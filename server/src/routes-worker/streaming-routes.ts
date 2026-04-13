import { Hono } from 'hono';

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
const proxyUrl = (url: string, proxyBase: string): string => {
    return `${proxyBase}?url=${encodeURIComponent(url)}`;
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
const rewriteM3u8Content = (content: string, originalUrl: string, proxyBase: string): string => {
    const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
    const lines = content.split('\n');

    return lines.map(line => {
        const trimmedLine = line.trim();

        // Skip empty lines and comments (except URI in comments)
        if (!trimmedLine || (trimmedLine.startsWith('#') && !trimmedLine.includes('URI='))) {
            // Handle URI in EXT-X-KEY or EXT-X-MAP tags
            if (trimmedLine.includes('URI="')) {
                return trimmedLine.replace(/URI="([^"]+)"/g, (match, uri) => {
                    const absoluteUri = uri.startsWith('http') ? uri : `${baseUrl}${uri}`;
                    return `URI="${proxyUrl(absoluteUri, proxyBase)}"`;
                });
            }
            return line;
        }

        // Handle segment URLs
        if (!trimmedLine.startsWith('#')) {
            const absoluteUrl = trimmedLine.startsWith('http')
                ? trimmedLine
                : `${baseUrl}${trimmedLine}`;
            return proxyUrl(absoluteUrl, proxyBase);
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
 */
async function proxyToRender(path: string, timeoutMs = 120_000): Promise<Response> {
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
}

export function createStreamingRoutes(sourceManager: StreamingSourceManager) {
    const app = new Hono();

    // Get episode servers
    app.get('/servers/:episodeId', async (c) => {
        const episodeId = decodeURIComponent(c.req.param('episodeId'));
        
        try {
            if (typeof sourceManager.getEpisodeServers === 'function') {
                const servers = await sourceManager.getEpisodeServers(episodeId);
                if (servers && servers.length > 0) return c.json({ servers });
            }
        } catch {}

        // Fallback: proxy to Render backend (has Puppeteer sources)
        try {
            return await proxyToRender(`/api/stream/servers/${encodeURIComponent(episodeId)}`);
        } catch (e: any) {
            return c.json({ servers: [], error: e.message }, 502);
        }
    });

    // Get streaming links — try local sources first, then proxy to Render for Puppeteer
    app.get('/watch/:episodeId', async (c) => {
        const episodeId = decodeURIComponent(c.req.param('episodeId'));
        const explicitServer = normalizeStreamServerQuery(c.req.query('server'));
        const category = c.req.query('category') as 'sub' | 'dub' | undefined;
        const useProxy = c.req.query('proxy') !== 'false';
        const proxyBase = getProxyBaseUrl(c);

        let streamData: any = { sources: [], subtitles: [] };
        let lastError: string | null = null;

        // 1) Try local CF Worker sources (CloudflareConsumet, WatchHentai, Hanime)
        try {
            if (typeof sourceManager.getStreamingLinks === 'function') {
                streamData = await sourceManager.getStreamingLinks(
                    episodeId,
                    explicitServer,
                    category || 'sub'
                );
            }
        } catch (error: any) {
            lastError = error.message;
        }

        // 2) If local sources returned nothing, proxy to Render (Puppeteer sources)
        if (!streamData.sources || streamData.sources.length === 0) {
            try {
                const qs = new URLSearchParams();
                if (explicitServer) qs.set('server', explicitServer);
                if (category) qs.set('category', category);
                const qsStr = qs.toString() ? `?${qs.toString()}` : '';
                const renderResp = await proxyToRender(
                    `/api/stream/watch/${encodeURIComponent(episodeId)}${qsStr}`,
                    120_000
                );
                if (renderResp.ok) {
                    const renderData = await renderResp.json() as any;
                    if (renderData.sources && renderData.sources.length > 0) {
                        streamData = renderData;
                        // Rewrite Render proxy URLs to use our CF Worker proxy instead
                        if (useProxy) {
                            streamData.sources = streamData.sources.map((s: any) => {
                                // If Render already wrapped in its proxy, extract original URL
                                const origUrl = s.originalUrl || s.url;
                                const unwrapped = origUrl.includes('/api/stream/proxy?url=')
                                    ? decodeURIComponent(origUrl.split('/api/stream/proxy?url=')[1]?.split('&')[0] || origUrl)
                                    : origUrl;
                                return {
                                    ...s,
                                    url: proxyUrl(unwrapped, proxyBase),
                                    originalUrl: unwrapped,
                                };
                            });
                            if (streamData.subtitles) {
                                streamData.subtitles = streamData.subtitles.map((sub: any) => {
                                    const origUrl = sub.url;
                                    const unwrapped = origUrl.includes('/api/stream/proxy?url=')
                                        ? decodeURIComponent(origUrl.split('/api/stream/proxy?url=')[1]?.split('&')[0] || origUrl)
                                        : origUrl;
                                    return { ...sub, url: proxyUrl(unwrapped, proxyBase) };
                                });
                            }
                        }
                    }
                }
            } catch (renderErr: any) {
                lastError = `CF local + Render both failed: ${renderErr.message}`;
            }
        }

        const winningSource = typeof streamData?.source === 'string' ? streamData.source : undefined;
        const successServer = explicitServer || winningSource || 'auto';

        if (!streamData.sources || streamData.sources.length === 0) {
            return c.json({
                error: 'No streaming sources found',
                episodeId,
                triedServers: explicitServer ? [explicitServer] : ['auto'],
                lastError,
                suggestion: 'All streaming sources failed. Please try again later.',
                sources: [],
                subtitles: []
            }, 404);
        }

        // Proxy the stream URLs if requested (and not already rewritten above from Render)
        if (useProxy && !streamData.sources[0]?.url?.includes('/api/stream/proxy')) {
            streamData.sources = streamData.sources.map((source: any) => ({
                ...source,
                url: proxyUrl(source.url, proxyBase),
                originalUrl: source.url
            }));

            if (streamData.subtitles) {
                streamData.subtitles = streamData.subtitles.map((sub: any) => ({
                    ...sub,
                    url: proxyUrl(sub.url, proxyBase)
                }));
            }
        }

        // Add server info to response
        streamData.server = successServer;
        streamData.triedServers = explicitServer ? [explicitServer] : ['auto'];

        // Short cache - streams expire quickly
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
    async function handleProxyRequest(c: any, url: string) {
        const proxyBase = getProxyBaseUrl(c);

        // Basic validation: require http(s) URL
        if (!/^https?:\/\//i.test(url)) {
            return c.json({ error: 'Invalid streaming URL' }, 400);
        }

        // Extract domain for logging
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const isM3u8 = url.includes('.m3u8');

        // Check if domain is dead/unresolvable before making request
        if (isDeadDomain(url)) {
            return c.json({
                error: 'Dead domain',
                reason: 'dead_domain',
                domain,
                message: `Domain ${domain} is known to be non-functional`
            }, 502);
        }

        try {
            // Determine best referer based on URL domain
            const cdnConfig: Record<string, { referer: string; origin?: string }> = {
                'fast4speed': { referer: 'https://allanime.day/', origin: 'https://allanime.day' },
                'allanime': { referer: 'https://allanime.day/', origin: 'https://allanime.day' },
                'sunshinerays': { referer: 'https://rapid-cloud.co/' },
                'sunburst': { referer: 'https://rapid-cloud.co/' },
                'rainveil': { referer: 'https://rapid-cloud.co/' },
                'lightningspark': { referer: 'https://megacloud.blog/' },
                'megacloud': { referer: 'https://megacloud.blog/' },
                'vidcloud': { referer: 'https://vidcloud9.com/' },
                'rapid-cloud': { referer: 'https://rapid-cloud.co/' },
                'netmagcdn': { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' },
                'biananset': { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' },
                'anicdnstream': { referer: 'https://aniwatchtv.to/' },
                'gogocdn': { referer: 'https://gogoanime.run/' },
                'hstorage': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
                'hstorage.xyz': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
                'xyz': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
                'googlevideo': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
                'default': { referer: 'https://aniwatchtv.to/' }
            };

            const matchedConfig = Object.entries(cdnConfig).find(([key]) => domain.includes(key));
            const config = matchedConfig ? matchedConfig[1] : cdnConfig.default;
            const referer = config.referer;
            const origin = config.origin || referer.replace(/\/$/, '');

            // Prepare headers for upstream request
            const headers: Record<string, string> = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': referer,
                'Origin': origin,
                'Connection': 'keep-alive'
            };

            // Forward Range header if present (crucial for seeking in video players)
            const rangeHeader = c.req.header('range');
            if (rangeHeader) {
                headers['Range'] = rangeHeader;
            }

            const response = await fetch(url, {
                headers: headers,
                redirect: 'follow'
            });

            if (!response.ok) {
                return c.json({
                    error: 'Upstream error',
                    status: response.status,
                    domain
                }, response.status);
            }

            // Determine content type
            const upstreamContentType = response.headers.get('content-type') || '';
            const isUpstreamM3u8 = upstreamContentType.includes('x-mpegurl') || upstreamContentType.includes('vnd.apple.mpegurl') || url.includes('.m3u8');

            // Handle M3U8 Manifests (Buffer & Rewrite)
            if (isUpstreamM3u8) {
                try {
                    const content = await response.text();
                    const rewrittenContent = rewriteM3u8Content(content, url, proxyBase);

                    return c.body(rewrittenContent, 200, {
                        'Content-Type': 'application/vnd.apple.mpegurl',
                        'Cache-Control': 'private, max-age=5',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, OPTIONS',
                        'Access-Control-Allow-Headers': 'Range, Origin, Accept'
                    });
                } catch (err) {
                    return c.json({ error: 'Failed to process manifest' }, 502);
                }
            }

            // Handle Video/Binary content (Stream/Pipe)
            const newHeaders = new Headers();
            
            // Forward content headers
            if (response.headers.get('content-length')) {
                newHeaders.set('Content-Length', response.headers.get('content-length')!);
            }
            if (response.headers.get('content-range')) {
                newHeaders.set('Content-Range', response.headers.get('content-range')!);
            }
            if (response.headers.get('accept-ranges')) {
                newHeaders.set('Accept-Ranges', response.headers.get('accept-ranges')!);
            }

            // Set Content-Type
            if (upstreamContentType) {
                newHeaders.set('Content-Type', upstreamContentType);
            } else if (url.includes('.ts')) {
                newHeaders.set('Content-Type', 'video/MP2T');
            } else if (url.endsWith('.mp4')) {
                newHeaders.set('Content-Type', 'video/mp4');
            }

            // CORS headers
            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
            newHeaders.set('Access-Control-Allow-Headers', 'Range');
            newHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

            // Cache control
            const isSegment = url.includes('.ts') || url.includes('.m4s');
            const isVideo = url.endsWith('.mp4');
            if (isSegment || isVideo) {
                newHeaders.set('Cache-Control', 'public, max-age=86400');
            } else {
                newHeaders.set('Cache-Control', 'public, max-age=3600');
            }

            return new Response(response.body, {
                status: response.status,
                headers: newHeaders
            });
        } catch (error: any) {
            const errorMessage = error.message || 'Unknown error';
            const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
            const isBlocked = errorMessage.includes('blocked') || errorMessage.includes('forbidden');

            return c.json({
                error: 'Failed to proxy stream',
                reason: isTimeout ? 'timeout' : isBlocked ? 'blocked' : 'connection_error',
                domain,
                message: errorMessage
            }, 502);
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
