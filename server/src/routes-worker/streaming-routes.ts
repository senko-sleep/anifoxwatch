import { Hono, type Context } from 'hono';
import { retryWithBackoff, reliableRequest } from '../utils/workers-reliability.js';
import {
    buildHianimeRestServersToTry,
    fetchHianimeRestEpisodeServerIds,
} from '../utils/hianime-rest-episode-discovery.js';
import { getHianimeRestBase, fetchHianimeRestData } from './hianime-rest.js';

interface HiAnimeScraper {
    getEpisodeServers(episodeId: string): Promise<{
        sub: Array<{ serverId: number | null; serverName: string }>;
        dub: Array<{ serverId: number | null; serverName: string }>;
        raw?: Array<{ serverId: number | null; serverName: string }>;
        [k: string]: unknown;
    }>;
    getEpisodeSources(episodeId: string, server?: string, category?: 'sub' | 'dub' | 'raw'): Promise<{
        sources: Array<{ url: string; isM3U8?: boolean; type?: string; quality?: string; [k: string]: unknown }>;
        subtitles?: Array<{ url: string; lang: string }>;
        headers?: { [k: string]: string };
        [k: string]: unknown;
    }>;
}

// Flexible interface for both SourceManager and CloudflareSourceManager
interface StreamingSourceManager {
    getEpisodeServers?(episodeId: string): Promise<Array<{ name: string; url: string; type: string }>>;
    getStreamingLinks?(episodeId: string, server?: string, category?: 'sub' | 'dub', fallbackEpisodeNum?: number): Promise<{
        sources: Array<{ url: string; quality: string; isM3U8?: boolean }>;
        subtitles?: Array<{ url: string; lang: string }>;
    }>;
}

/**
 * Streaming routes for Cloudflare Worker (Hono)
 * Uses the same working approach as localhost
 */

// Known dead/unresolvable domains that should be filtered out
const DEAD_DOMAINS = [
    'streamable.cloud',
    'streamable.video',
    'streamable.host',
    'dead-cdn.example'
];

// Helper proxy URL generator
const proxyUrl = (url: string, proxyBase: string, referer?: string): string => {
    let s = `${proxyBase}?url=${encodeURIComponent(url)}`;
    if (referer) s += `&referer=${encodeURIComponent(referer)}`;
    return s;
};

// Helper to get proxy base URL from Hono context
const getProxyBaseUrl = (c: { req: { url: string } }): string => {
    const url = new URL(c.req.url);
    return `${url.protocol}//${url.host}/api/stream/proxy`;
};


/**
 * Check if a URL's domain is on the dead domains list
 */
function isDeadDomain(url: string): boolean {
    try {
        const hostname = new URL(url).hostname;
        return DEAD_DOMAINS.some(dead => hostname.includes(dead));
    } catch {
        return false;
    }
}

/**
 * Rewrite m3u8 content to proxy all segment URLs
 */
const rewriteM3u8Content = (content: string, originalUrl: string, proxyBase: string, referer?: string): string => {
    const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
    const lines = content.split('\n');

    return lines.map(line => {
        const trimmedLine = line.trim();

        if (!trimmedLine || (trimmedLine.startsWith('#') && !trimmedLine.includes('URI='))) {
            if (trimmedLine.includes('URI="')) {
                return trimmedLine.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
                    const absoluteUri = uri.startsWith('http') ? uri : `${baseUrl}${uri}`;
                    return `URI="${proxyUrl(absoluteUri, proxyBase, referer)}"`;
                });
            }
            return line;
        }

        if (!trimmedLine.startsWith('#')) {
            const absoluteUrl = trimmedLine.startsWith('http')
                ? trimmedLine
                : `${baseUrl}${trimmedLine}`;
            return proxyUrl(absoluteUrl, proxyBase, referer);
        }

        return line;
    }).join('\n');
};

function normalizeStreamServerQuery(raw: string | string[] | undefined): string | undefined {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (!s || s.toLowerCase() === 'default') return undefined;
    return s;
}

/**
 * Optional full Node API base for Puppeteer-heavy streaming (set `HEAVY_STREAM_BACKEND_URL` or legacy `RENDER_BACKEND_URL` in Worker env). If unset, Worker does not proxy stream extraction.
 */
function getHeavyStreamBackendUrl(env: unknown): string | undefined {
    if (!env || typeof env !== 'object') return undefined;
    const e = env as Record<string, unknown>;
    const v = e.HEAVY_STREAM_BACKEND_URL ?? e.RENDER_BACKEND_URL;
    if (typeof v === 'string' && v.trim()) return v.replace(/\/$/, '');
    return undefined;
}

async function proxyToHeavyStreamBackend(env: unknown, path: string, timeoutMs = 120_000): Promise<Response | null> {
    const base = getHeavyStreamBackendUrl(env);
    if (!base) return null;
    return await retryWithBackoff(
        async () => {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const resp = await fetch(`${base}${path}`, {
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' },
                });
                clearTimeout(tid);
                const body = await resp.text();
                return new Response(body, {
                    status: resp.status,
                    headers: {
                        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'private, max-age=300',
                    },
                });
            } catch (e) {
                clearTimeout(tid);
                throw e;
            }
        },
        2,
        2000,
        'proxyToHeavyStreamBackend'
    );
}

export function createStreamingRoutes(sourceManager: StreamingSourceManager, hianime?: HiAnimeScraper) {
    const app = new Hono();

    interface StreamSource { url: string; originalUrl?: string; [k: string]: unknown }
    interface StreamSubtitle { url: string; [k: string]: unknown }
    interface StreamPayload {
        sources: StreamSource[];
        subtitles?: StreamSubtitle[];
        headers?: Record<string, string>;
        source?: string;
        server?: string;
        triedServers?: string[];
        [k: string]: unknown;
    }

    function unwrapProxied(u: string): string {
        if (u.includes('/api/stream/proxy?url=')) {
            const extracted = u.split('/api/stream/proxy?url=')[1]?.split('&')[0];
            if (extracted) return decodeURIComponent(extracted);
        }
        return u;
    }

    /** True only when a source URL points to an actual video/playlist, not an embed HTML page */
    const EMBED_DOMAINS = ['streamwish', 'mega.nz', 'hqq.tv', 'streamtape', 'doodstream', 'mp4upload', 'sendvid', 'ok.ru'];
    function isPlayableSource(url: string): boolean {
        if (!url) return false;
        const lower = url.toLowerCase();
        if (lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('.mpd')) return true;
        if (EMBED_DOMAINS.some((d) => lower.includes(d))) return false;
        return true; // assume playable if unknown
    }
    function hasPlayableSources(sources: StreamSource[]): boolean {
        return sources.some((s) => isPlayableSource(unwrapProxied(s.originalUrl || s.url || '')));
    }

    // Get episode servers
    app.get('/servers/:episodeId', async (c) => {
        let episodeId = decodeURIComponent(c.req.param('episodeId'));
        const epQueryParam = c.req.query('ep');
        if (epQueryParam && !episodeId.includes('?ep=')) {
            episodeId = `${episodeId}?ep=${epQueryParam}`;
        }

        // HiAnime aniwatch-style IDs handled directly on CF Worker
        if (hianime && /^[^?]+\?ep=\d+$/.test(episodeId)) {
            try {
                const restBase = getHianimeRestBase(c.env);
                const data = restBase
                    ? await fetchHianimeRestData<Awaited<ReturnType<HiAnimeScraper['getEpisodeServers']>>>(
                        restBase,
                        `/api/v2/hianime/episode/servers?${new URLSearchParams({ animeEpisodeId: episodeId })}`
                    )
                    : null;
                const resolved =
                    data ??
                    (await reliableRequest('HiAnime', 'getEpisodeServers', () => hianime!.getEpisodeServers(episodeId), {
                        maxAttempts: 2,
                        timeout: 10000,
                        retryDelay: 1000,
                    }));
                const servers = [
                    ...(resolved.sub || []).map(s => ({ name: s.serverName, url: '', type: 'sub' })),
                    ...(resolved.dub || []).map(s => ({ name: s.serverName, url: '', type: 'dub' })),
                ];
                return c.json({ servers });
            } catch (e: unknown) {
                return c.json({ servers: [], error: `HiAnime servers failed: ${e instanceof Error ? e.message : String(e)}` }, 503);
            }
        }

        if (typeof sourceManager.getEpisodeServers === 'function') {
            try {
                const servers = await sourceManager.getEpisodeServers(episodeId);
                if (servers && servers.length > 0) return c.json({ servers });
            } catch { /* fall through */ }
        }

        return c.json({ servers: [], error: 'Streaming servers unavailable' }, 503);
    });

    // Get streaming links — try local sources first, then optional heavy backend
    app.get('/watch/:episodeId', async (c) => {
        // Cloudflare/Hono may decode %3F→? in the path before routing, turning
        // "anime-slug%3Fep%3D92595" into path param "anime-slug" + query "ep=92595".
        // Reconstruct the full aniwatch-style ID when that happens.
        let episodeId = decodeURIComponent(c.req.param('episodeId'));
        const epQueryParam = c.req.query('ep');
        if (epQueryParam && !episodeId.includes('?ep=')) {
            episodeId = `${episodeId}?ep=${epQueryParam}`;
        }
        const explicitServerRaw = normalizeStreamServerQuery(c.req.query('server'));
        const category = c.req.query('category') as 'sub' | 'dub' | undefined;
        const epNum = c.req.query('ep_num');
        const fallbackEpisodeNum = epNum ? parseInt(epNum, 10) : undefined;
        const epNumHint = fallbackEpisodeNum != null && !Number.isNaN(fallbackEpisodeNum) && fallbackEpisodeNum > 0
            ? fallbackEpisodeNum
            : undefined;
        const useProxy = c.req.query('proxy') !== 'false';
        const proxyBase = getProxyBaseUrl(c);

        let streamData: StreamPayload = { sources: [], subtitles: [] };
        let lastError: string | null = null;

        // HiAnime aniwatch-style IDs (slug?ep=NNNNN) — try REST + scraper first, then fall through to
        // CloudflareConsumet / cross-source title search (Vercel upstream often 404s on sources).
        if (hianime && /^[^?]+\?ep=\d+$/.test(episodeId)) {
            const cat = (category || 'sub') as 'sub' | 'dub' | 'raw';
            const discoveryCat: 'sub' | 'dub' = cat === 'dub' ? 'dub' : 'sub';

            const restBaseWatch = getHianimeRestBase(c.env);
            let discovered: string[] | null = null;
            if (restBaseWatch) {
                discovered = await fetchHianimeRestEpisodeServerIds(
                    restBaseWatch,
                    episodeId,
                    discoveryCat,
                    12_000
                );
            }
            const serversToTry = buildHianimeRestServersToTry({
                explicitServer: explicitServerRaw,
                discoveredIds: discovered,
            });
            for (const server of serversToTry.slice(0, 12)) {
                try {
                    let data: Awaited<ReturnType<HiAnimeScraper['getEpisodeSources']>> | null = null;
                    if (restBaseWatch) {
                        const qs = new URLSearchParams({
                            animeEpisodeId: episodeId,
                            server,
                            category: cat,
                        });
                        data = await fetchHianimeRestData<Awaited<ReturnType<HiAnimeScraper['getEpisodeSources']>>>(
                            restBaseWatch,
                            `/api/v2/hianime/episode/sources?${qs}`
                        );
                    }
                    if (!data?.sources?.length) {
                        data = await reliableRequest('HiAnime', `getEpisodeSources-${server}`,
                            () => hianime!.getEpisodeSources(episodeId, server, cat),
                            { maxAttempts: 1, timeout: 15000, retryDelay: 0 }
                        );
                    }
                     if (data.sources && data.sources.length > 0) {
                         const referer = data.headers?.Referer || 'https://hianime.to/';
                         let sources: StreamSource[] = data.sources.map(s => ({
                             url: s.url,
                             quality: (s.quality || s.type || 'default') as string,
                             isM3U8: s.isM3U8 ?? false,
                         }));
                         const subtitles: StreamSubtitle[] = (data.subtitles || [])
                             .map(t => ({ url: t.url, lang: t.lang }));

                         // Filter out IP-locked sources (Streamtape /get_video URLs) — their
                         // CDN tokens are bound to the Render server IP and cannot be proxied
                         // through CF Worker (range requests from a different IP → playback error).
                         const isIpLocked = (s: StreamSource) => {
                             if ((s as Record<string, unknown>).ipLocked) return true;
                             const rawUrl = s.url.toLowerCase();
                             return (rawUrl.includes('streamtape') || rawUrl.includes('tapecontent')) && rawUrl.includes('get_video');
                         };
                         const proxyableSources = sources.filter(s => !isIpLocked(s));
                         if (proxyableSources.length === 0) {
                             // All sources were IP-locked, try next server
                             continue;
                         }
                         sources = proxyableSources;

                         if (useProxy) {
                             sources = sources.map(s => ({
                                 ...s,
                                 url: proxyUrl(s.url, proxyBase, referer),
                                 originalUrl: s.url,
                             }));
                         }

                         c.header('Cache-Control', 'private, max-age=300');
                         return c.json({
                             sources,
                             subtitles: useProxy
                                 ? subtitles.map(sub => ({ ...sub, url: proxyUrl(sub.url, proxyBase, referer) }))
                                 : subtitles,
                             headers: { Referer: referer },
                             server,
                             source: 'hianime',
                             triedServers: [server],
                         });
                     }
                } catch { /* try next server */ }
            }
            // Do not return 404 — fall through to Consumet + title-based fallback below.
        }

        // IDs that require the full Node SourceManager (AnimeKai, etc.)
        // The CF Worker's CloudflareSourceManager only handles gogoanime/consumet/adult IDs.
        const RENDER_ONLY_PREFIXES = ['animekai-', 'kaido-', 'miruro-', '9anime-', 'zoro-', 'aniwave-',
            'allanime-', 'animepahe-', 'gogoanime-', 'animefox-', 'animeflv-', 'anix-', 'consumet-'];
        const isRenderOnlyId = (id: string): boolean => {
            const low = id.toLowerCase();
            if (RENDER_ONLY_PREFIXES.some(p => low.startsWith(p))) return true;
            // AnimeKai episode format: slug$ep=N$token=KEY
            if (/\$ep=\d+(\$token=|\$)/.test(id)) return true;
            return false;
        };

        // 1) Try local CF Worker sources (only for IDs it can actually handle)
        if (!isRenderOnlyId(episodeId) && typeof sourceManager.getStreamingLinks === 'function') {
            try {
                streamData = await sourceManager.getStreamingLinks(
                    episodeId,
                    explicitServerRaw,
                    category || 'sub',
                    epNumHint
                ) as StreamPayload;
            } catch (e: unknown) {
                lastError = e instanceof Error ? e.message : 'Local source error';
                if (!streamData.sources || streamData.sources.length === 0) {
                    return c.json({ error: 'Streaming unavailable from edge sources', sources: [] }, 503);
                }
            }
        }

        // 2) Optional fall back to a configured full Node API (Puppeteer sources)
        if (!streamData.sources || streamData.sources.length === 0 || !hasPlayableSources(streamData.sources)) {
            try {
                const qs = new URLSearchParams();
                if (explicitServerRaw) qs.set('server', explicitServerRaw);
                if (category) qs.set('category', category);
                if (epNum) qs.set('ep_num', epNum);
                const qsStr = qs.toString() ? `?${qs.toString()}` : '';
                const renderResp = await proxyToHeavyStreamBackend(
                    c.env,
                    `/api/stream/watch/${encodeURIComponent(episodeId)}${qsStr}`,
                    120_000
                );
                if (renderResp?.ok) {
                    const renderData = await renderResp.json() as StreamPayload;
                    if (renderData.sources && renderData.sources.length > 0) {
                        streamData = renderData;

                         // Filter out IP-locked sources (Streamtape /get_video URLs) — their
                         // CDN tokens are bound to the Render server IP and cannot be proxied
                         // through CF Worker (range requests from a different IP → playback error).
                         const isIpLocked = (s: StreamSource) => {
                             if ((s as Record<string, unknown>).ipLocked) return true;
                             const rawUrl = unwrapProxied(s.originalUrl || s.url).toLowerCase();
                             return (rawUrl.includes('streamtape') || rawUrl.includes('tapecontent')) && rawUrl.includes('get_video');
                         };
                         streamData.sources = streamData.sources.filter(s => !isIpLocked(s));

                        if (useProxy) {
                            const referer = streamData.headers?.Referer || streamData.headers?.referer;
                            streamData.sources = streamData.sources.map(s => {
                                const rawUrl = unwrapProxied(s.originalUrl || s.url);
                                return {
                                    ...s,
                                    url: proxyUrl(rawUrl, proxyBase, referer),
                                    originalUrl: rawUrl,
                                };
                            });
                            if (streamData.subtitles) {
                                streamData.subtitles = streamData.subtitles.map(sub => ({
                                    ...sub,
                                    url: proxyUrl(unwrapProxied(sub.url), proxyBase, referer),
                                }));
                            }
                        }
                    }
                }
            } catch (e: unknown) {
                lastError = `Edge + optional heavy backend failed: ${e instanceof Error ? e.message : String(e)}`;
            }
        }

        if (!streamData.sources || streamData.sources.length === 0) {
            return c.json({
                error: 'No streaming sources found',
                episodeId,
                triedServers: explicitServerRaw ? [explicitServerRaw] : ['auto'],
                lastError,
                sources: [],
                subtitles: [],
            }, 404);
        }

        // Proxy local source URLs if not already proxied
        if (useProxy && !streamData.sources[0]?.url?.includes('/api/stream/proxy')) {
            const referer = streamData.headers?.Referer || streamData.headers?.referer;
            streamData.sources = streamData.sources.map(s => ({
                ...s,
                url: proxyUrl(s.url, proxyBase, referer),
                originalUrl: s.url,
            }));
            if (streamData.subtitles) {
                streamData.subtitles = streamData.subtitles.map(sub => ({
                    ...sub,
                    url: proxyUrl(sub.url, proxyBase, referer),
                }));
            }
        }

        streamData.server = explicitServerRaw || (typeof streamData.source === 'string' ? streamData.source : undefined) || 'auto';
        streamData.triedServers = explicitServerRaw ? [explicitServerRaw] : ['auto'];

        c.header('Cache-Control', 'private, max-age=300');
        return c.json(streamData);
    });

    // Proxy endpoint - GET
    app.get('/proxy', async (c) => {
        const url = c.req.query('url');
        if (!url) return c.json({ error: 'URL parameter is required' }, 400);

        return handleProxyRequest(c, url);
    });

    // Proxy endpoint - POST (for long URLs)
    app.post('/proxy', async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const url = body.url;
        if (!url) return c.json({ error: 'URL is required in request body' }, 400);

        return handleProxyRequest(c, url);
    });

    // Shared proxy handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function handleProxyRequest(c: Context<any>, url: string) {
        const proxyBase = getProxyBaseUrl(c);

        // Basic validation: require http(s) URL
        if (!/^https?:\/\//i.test(url)) {
            return c.json({ error: 'Invalid streaming URL' }, 400);
        }

        // Extract domain and optional referer hint from query params
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const refererParam = c.req.query('referer');

        if (isDeadDomain(url)) {
            return c.json({ error: 'Dead domain', reason: 'dead_domain', domain }, 502);
        }

        try {
            const cdnConfig: Record<string, { referer: string; origin: string }> = {
                'fast4speed':   { referer: 'https://allanime.day/',      origin: 'https://allanime.day' },
                'allanime':     { referer: 'https://allanime.day/',      origin: 'https://allanime.day' },
                'sunshinerays': { referer: 'https://rapid-cloud.co/',    origin: 'https://rapid-cloud.co' },
                'sunburst':     { referer: 'https://rapid-cloud.co/',    origin: 'https://rapid-cloud.co' },
                'rainveil':     { referer: 'https://rapid-cloud.co/',    origin: 'https://rapid-cloud.co' },
                'lightningspark':{ referer: 'https://megacloud.blog/',   origin: 'https://megacloud.blog' },
                'megacloud':    { referer: 'https://megacloud.blog/',    origin: 'https://megacloud.blog' },
                'pro25zone':    { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
                'xm8.':         { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
                'code29wave':   { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
                'net22lab':     { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
                'megaup':       { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
                'lab27core':    { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
                'tech20hub':    { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
                'vidcloud':     { referer: 'https://vidcloud9.com/',     origin: 'https://vidcloud9.com' },
                'rapid-cloud':  { referer: 'https://rapid-cloud.co/',    origin: 'https://rapid-cloud.co' },
                'netmagcdn':    { referer: 'https://aniwatchtv.to/',     origin: 'https://aniwatchtv.to' },
                'biananset':    { referer: 'https://aniwatchtv.to/',     origin: 'https://aniwatchtv.to' },
                'anicdnstream': { referer: 'https://aniwatchtv.to/',     origin: 'https://aniwatchtv.to' },
                'gogocdn':      { referer: 'https://gogoanime.run/',     origin: 'https://gogoanime.run' },
                'owocdn':       { referer: 'https://kwik.si/',           origin: 'https://kwik.si' },
                'vault':        { referer: 'https://kwik.cx/',           origin: 'https://kwik.cx' },
                'kwik':         { referer: 'https://kwik.si/',           origin: 'https://kwik.si' },
                'pahe':         { referer: 'https://animepahe.ru/',      origin: 'https://animepahe.ru' },
                'nextcdn':      { referer: 'https://animepahe.ru/',      origin: 'https://animepahe.ru' },
                'hstorage':     { referer: 'https://watchhentai.net/',   origin: 'https://watchhentai.net' },
                'googlevideo':  { referer: 'https://watchhentai.net/',   origin: 'https://watchhentai.net' },
                'streamtape':   { referer: 'https://streamtape.com/',    origin: 'https://streamtape.com' },
                'tapecontent':  { referer: 'https://streamtape.com/',    origin: 'https://streamtape.com' },
                'streamwish':   { referer: 'https://streamwish.to/',     origin: 'https://streamwish.to' },
            };

            const matched = Object.entries(cdnConfig).find(([key]) => domain.includes(key));

            // Build ordered list of referer/origin combos to try
            type RefererCombo = { referer: string; origin: string };
            const refererCombos: RefererCombo[] = [];

            if (matched) {
                const isMegaupCdn = matched[1].referer.includes('megaup.nl');
                if (isMegaupCdn && refererParam) {
                    // MegaUp CDNs need the embed page URL first, then root
                    let paramOrigin: string;
                    try { paramOrigin = new URL(refererParam).origin; } catch { paramOrigin = 'https://megaup.nl'; }
                    refererCombos.push({ referer: refererParam, origin: paramOrigin });
                    refererCombos.push({ referer: 'https://megaup.nl/', origin: 'https://megaup.nl' });
                } else {
                    refererCombos.push({ referer: matched[1].referer, origin: matched[1].origin });
                    if (refererParam && refererParam !== matched[1].referer) {
                        let paramOrigin: string;
                        try { paramOrigin = new URL(refererParam).origin; } catch { paramOrigin = matched[1].origin; }
                        refererCombos.push({ referer: refererParam, origin: paramOrigin });
                    }
                }
            } else if (refererParam) {
                let paramOrigin: string;
                try { paramOrigin = new URL(refererParam).origin; } catch { paramOrigin = 'https://megacloud.blog'; }
                refererCombos.push({ referer: refererParam, origin: paramOrigin });
                refererCombos.push({ referer: 'https://megacloud.blog/', origin: 'https://megacloud.blog' });
            } else {
                refererCombos.push({ referer: 'https://megacloud.blog/', origin: 'https://megacloud.blog' });
            }

            const rangeHeader = c.req.header('range');

            // Try each referer combo until one succeeds
            let response: Response | null = null;
            for (const combo of refererCombos) {
                const headers: Record<string, string> = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': combo.referer,
                    'Origin': combo.origin,
                    'Connection': 'keep-alive',
                };
                if (rangeHeader) headers['Range'] = rangeHeader;
                try {
                    const res = await fetch(url, { headers, redirect: 'follow' });
                    if (res.ok) { response = res; break; }
                } catch { /* try next combo */ }
            }

            const activeReferer = refererCombos[0]?.referer || 'https://megacloud.blog/';

            if (!response) {
                return c.json({ error: 'Upstream error', domain }, 502 as 502);
            }

            const upstreamContentType = response.headers.get('content-type') || '';
            const isUpstreamM3u8 = upstreamContentType.includes('x-mpegurl') ||
                upstreamContentType.includes('vnd.apple.mpegurl') ||
                url.includes('.m3u8');

            if (isUpstreamM3u8) {
                const content = await response.text();
                const rewrittenContent = rewriteM3u8Content(content, url, proxyBase, activeReferer);
                return c.body(rewrittenContent, 200, {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Cache-Control': 'private, max-age=5',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range, Origin, Accept',
                });
            }

            const newHeaders = new Headers();
            const contentLength = response.headers.get('content-length');
            const contentRange  = response.headers.get('content-range');
            const acceptRanges  = response.headers.get('accept-ranges');
            if (contentLength) newHeaders.set('Content-Length', contentLength);
            if (contentRange)  newHeaders.set('Content-Range', contentRange);
            if (acceptRanges)  newHeaders.set('Accept-Ranges', acceptRanges);

            if (upstreamContentType) {
                newHeaders.set('Content-Type', upstreamContentType);
            } else if (url.includes('.ts') || url.includes('.m4s')) {
                newHeaders.set('Content-Type', 'video/MP2T');
            } else if (url.endsWith('.mp4')) {
                newHeaders.set('Content-Type', 'video/mp4');
            }

            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
            newHeaders.set('Access-Control-Allow-Headers', 'Range');
            newHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

            const isSegment = url.includes('.ts') || url.includes('.m4s');
            const isVideo   = url.endsWith('.mp4');
            newHeaders.set('Cache-Control', (isSegment || isVideo) ? 'public, max-age=86400' : 'public, max-age=3600');

            return new Response(response.body, { status: response.status, headers: newHeaders });

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            return c.json({ error: 'Failed to proxy stream', domain, message: msg }, 502);
        }
    }

    // CORS preflight
    app.options('/proxy', (c) => {
        c.header('Access-Control-Allow-Origin', '*');
        c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        c.header('Access-Control-Allow-Headers', 'Range, Origin, Accept, Content-Type');
        c.header('Access-Control-Max-Age', '86400');
        return c.body(null, 204);
    });

    return app;
}
