import { Hono, type Context } from 'hono';
import { retryWithBackoff } from '../utils/workers-reliability.js';

// Flexible interface for both SourceManager and CloudflareSourceManager
interface StreamingSourceManager {
    getEpisodeServers?(episodeId: string): Promise<Array<{ name: string; url: string; type: string }>>;
    getStreamingLinks?(episodeId: string, server?: string, category?: 'sub' | 'dub'): Promise<{
        sources: Array<{ url: string; quality: string; isM3U8?: boolean }>;
        subtitles?: Array<{ url: string; lang: string }>;
    }>;
}

/**
 * Streaming routes for Cloudflare Worker/Render (Hono)
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
 * Extract direct video URL from Streamtape embed page using CF Worker fetch.
 * The token is IP-bound, so extraction must happen on the same server that will proxy the video.
 */
async function extractStreamtapeVideoUrl(embedUrl: string): Promise<string | null> {
    try {
        const resp = await fetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            },
        });
        if (!resp.ok) return null;
        const html = await resp.text();

        // Parse ALL JS assignments to robotlink/ideoolink/botlink — the LAST one wins.
        const jsPattern = /getElementById\(['"](?:robotlink|ideoolink|botlink)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:['"]['"]\s*\+\s*)?\(?['"]([^'"]+)['"]\)?\.substring\((\d+)\)(?:\.substring\((\d+)\))?/g;
        let lastMatch: RegExpExecArray | null = null;
        let m: RegExpExecArray | null;
        while ((m = jsPattern.exec(html)) !== null) {
            lastMatch = m;
        }

        if (lastMatch) {
            const prefix = lastMatch[1];
            let suffix = lastMatch[2];
            const sub1 = parseInt(lastMatch[3], 10);
            const sub2 = lastMatch[4] ? parseInt(lastMatch[4], 10) : undefined;
            suffix = suffix.substring(sub1);
            if (sub2 !== undefined) suffix = suffix.substring(sub2);
            const videoUrl = `https:${prefix}${suffix}`;
            if (videoUrl.includes('/get_video?') || videoUrl.includes('streamtape.com')) {
                return videoUrl;
            }
        }

        // Fallback: robotlink div content
        const divMatch = html.match(/<div id="robotlink"[^>]*>([^<]+)<\/div>/);
        if (divMatch) {
            const partial = divMatch[1].trim();
            if (partial.includes('/get_video?')) {
                return partial.startsWith('http') ? partial : `https:${partial}`;
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Given a streamtape get_video URL (with potentially wrong IP-bound token),
 * find the embed URL from the video ID and re-extract with CF Worker IP.
 */
async function reExtractStreamtapeForWorkerIp(getVideoUrl: string): Promise<string | null> {
    try {
        const u = new URL(getVideoUrl);
        const videoId = u.searchParams.get('id');
        if (!videoId) return null;
        const embedUrl = `https://streamtape.com/e/${videoId}/`;
        return await extractStreamtapeVideoUrl(embedUrl);
    } catch {
        return null;
    }
}

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
 * Render backend URL for Puppeteer-dependent requests.
 * CF Worker handles metadata (AniList) and proxy; Render handles stream extraction.
 */
const RENDER_BACKEND_URL = 'https://anifoxwatch-sm7s.onrender.com';

/**
 * Proxy a request to the Render backend (for routes that need Puppeteer/heavy scraping).
 * Forwards query params and returns the JSON response with CORS headers.
 * Includes retry logic for reliability.
 */
async function proxyToRender(path: string, timeoutMs = 120_000): Promise<Response> {
    return await retryWithBackoff(
        async () => {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const resp = await fetch(`${RENDER_BACKEND_URL}${path}`, {
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' },
                });
                clearTimeout(tid);
                // Clone into a new Response so we can add CORS headers
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
        2, // maxAttempts
        2000, // initialDelay
        'proxyToRender'
    );
}

export function createStreamingRoutes(sourceManager: StreamingSourceManager) {
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
        const episodeId = decodeURIComponent(c.req.param('episodeId')).split('?')[0]; // Strip query params

        if (typeof sourceManager.getEpisodeServers === 'function') {
            try {
                const servers = await sourceManager.getEpisodeServers(episodeId);
                if (servers && servers.length > 0) return c.json({ servers });
            } catch { /* fall through to Render */ }
        }

        try {
            return await proxyToRender(`/api/stream/servers/${encodeURIComponent(episodeId)}`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Render proxy failed';
            return c.json({ servers: [], error: msg }, 502);
        }
    });

    // Get streaming links — try local sources first, then proxy to Render for Puppeteer
    app.get('/watch/:episodeId', async (c) => {
        const episodeId = decodeURIComponent(c.req.param('episodeId')).split('?')[0]; // Strip query params
        const explicitServer = normalizeStreamServerQuery(c.req.query('server'));
        const category = c.req.query('category') as 'sub' | 'dub' | undefined;
        const useProxy = c.req.query('proxy') !== 'false';
        const proxyBase = getProxyBaseUrl(c);

        let streamData: StreamPayload = { sources: [], subtitles: [] };
        let lastError: string | null = null;

        // 1) Try local CF Worker sources
        if (typeof sourceManager.getStreamingLinks === 'function') {
            try {
                streamData = await sourceManager.getStreamingLinks(episodeId, explicitServer, category || 'sub') as StreamPayload;
            } catch (e: unknown) {
                lastError = e instanceof Error ? e.message : 'Local source error';
            }
        }

        // 2) Fall back to Render (Puppeteer sources)
        // Trigger if: no sources at all, OR all sources are embed pages that can't be played directly
        if (!streamData.sources || streamData.sources.length === 0 || !hasPlayableSources(streamData.sources)) {
            try {
                const qs = new URLSearchParams();
                if (explicitServer) qs.set('server', explicitServer);
                if (category) qs.set('category', category);
                const qsStr = qs.toString() ? `?${qs.toString()}` : '';
                const renderResp = await proxyToRender(`/api/stream/watch/${encodeURIComponent(episodeId)}${qsStr}`, 120_000);
                if (renderResp.ok) {
                    const renderData = await renderResp.json() as StreamPayload;
                    if (renderData.sources && renderData.sources.length > 0) {
                        streamData = renderData;

                        if (useProxy) {
                            const referer = streamData.headers?.Referer || streamData.headers?.referer;
                            streamData.sources = streamData.sources.map(s => {
                                const rawUrl = unwrapProxied(s.originalUrl || s.url);
                                // Streamtape get_video tokens are IP-bound to Render's IP.
                                // Keep Render's proxy URL for streamtape sources so the browser
                                // fetches via Render (same IP as extraction).
                                try {
                                    const h = new URL(rawUrl).hostname;
                                    if (h.includes('streamtape') && rawUrl.includes('/get_video')) {
                                        // s.url is already Render-proxied — pass it through
                                        return {
                                            ...s,
                                            originalUrl: rawUrl,
                                        };
                                    }
                                } catch { /* fall through to CF Worker proxy */ }
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
                lastError = `CF local + Render both failed: ${e instanceof Error ? e.message : String(e)}`;
            }
        }

        if (!streamData.sources || streamData.sources.length === 0) {
            return c.json({
                error: 'No streaming sources found',
                episodeId,
                triedServers: explicitServer ? [explicitServer] : ['auto'],
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

        streamData.server = explicitServer || (typeof streamData.source === 'string' ? streamData.source : undefined) || 'auto';
        streamData.triedServers = explicitServer ? [explicitServer] : ['auto'];

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
                'pro25zone':    { referer: 'https://megacloud.blog/',    origin: 'https://megacloud.blog' },
                'code29wave':   { referer: 'https://megacloud.blog/',    origin: 'https://megacloud.blog' },
                'megaup':       { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
                'lab27core':    { referer: 'https://megaup.nl/',         origin: 'https://megaup.nl' },
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
            let referer: string;
            let origin: string;

            if (matched) {
                referer = matched[1].referer;
                origin  = matched[1].origin;
            } else if (refererParam) {
                // Use caller-supplied referer when no CDN rule matches
                referer = refererParam;
                try { origin = new URL(refererParam).origin; } catch { origin = 'https://megacloud.blog'; }
            } else {
                referer = 'https://megacloud.blog/';
                origin  = 'https://megacloud.blog';
            }

            const headers: Record<string, string> = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': referer,
                'Origin': origin,
                'Connection': 'keep-alive',
            };

            const rangeHeader = c.req.header('range');
            if (rangeHeader) headers['Range'] = rangeHeader;

            const response = await fetch(url, { headers, redirect: 'follow' });

            if (!response.ok) {
                return c.json({ error: 'Upstream error', status: response.status, domain }, response.status as 400 | 401 | 403 | 404 | 500 | 502 | 503);
            }

            const upstreamContentType = response.headers.get('content-type') || '';
            const isUpstreamM3u8 = upstreamContentType.includes('x-mpegurl') ||
                upstreamContentType.includes('vnd.apple.mpegurl') ||
                url.includes('.m3u8');

            if (isUpstreamM3u8) {
                const content = await response.text();
                const rewrittenContent = rewriteM3u8Content(content, url, proxyBase, referer);
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
