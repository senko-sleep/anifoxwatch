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

/**
 * Server priority order - hd-2 works best based on testing
 */
const SERVER_PRIORITY = ['hd-2', 'hd-1', 'hd-3'];

export function createStreamingRoutes(sourceManager: StreamingSourceManager) {
    const app = new Hono();

    // Get episode servers
    app.get('/servers/:episodeId', async (c) => {
        const episodeId = decodeURIComponent(c.req.param('episodeId'));
        
        try {
            if (typeof sourceManager.getEpisodeServers === 'function') {
                const servers = await sourceManager.getEpisodeServers(episodeId);
                return c.json({ servers });
            }
            return c.json({ servers: [] });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get streaming links
    app.get('/watch/:episodeId', async (c) => {
        const episodeId = decodeURIComponent(c.req.param('episodeId'));
        const server = c.req.query('server');
        const category = c.req.query('category') as 'sub' | 'dub' | undefined;
        const tryAll = c.req.query('tryAll') !== 'false';
        const useProxy = c.req.query('proxy') !== 'false';
        const proxyBase = getProxyBaseUrl(c);
        const shouldTryAll = tryAll && !server;

        // Determine servers to try
        const serversToTry = server ? [server as string] : SERVER_PRIORITY;
        let streamData: any = { sources: [], subtitles: [] };
        let lastError: string | null = null;
        let successServer: string | null = null;

        for (const currentServer of serversToTry) {
            try {
                if (typeof sourceManager.getStreamingLinks === 'function') {
                    const data = await sourceManager.getStreamingLinks(
                        episodeId,
                        currentServer,
                        category || 'sub'
                    );

                    if (data.sources && data.sources.length > 0) {
                        streamData = data;
                        successServer = currentServer;
                        break;
                    }
                }
            } catch (error: any) {
                lastError = error.message;
                if (!shouldTryAll) {
                    break;
                }
            }
        }

        if (streamData.sources.length === 0) {
            return c.json({
                error: 'No streaming sources found',
                episodeId,
                triedServers: serversToTry,
                lastError,
                suggestion: 'All servers failed. Please try again later.',
                sources: [],
                subtitles: []
            }, 404);
        }

        // Proxy the stream URLs if requested
        if (useProxy) {
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
        streamData.triedServers = serversToTry;

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
                'sunshinerays': { referer: 'https://rapid-cloud.co/' },
                'sunburst': { referer: 'https://rapid-cloud.co/' },
                'rainveil': { referer: 'https://rapid-cloud.co/' },
                'lightningspark': { referer: 'https://megacloud.blog/' },
                'megacloud': { referer: 'https://megacloud.blog/' },
                'vidcloud': { referer: 'https://vidcloud9.com/' },
                'rapid-cloud': { referer: 'https://rapid-cloud.co/' },
                'netmagcdn': { referer: 'https://hianimez.to/', origin: 'https://hianimez.to' },
                'biananset': { referer: 'https://hianimez.to/', origin: 'https://hianimez.to' },
                'anicdnstream': { referer: 'https://hianimez.to/' },
                'gogocdn': { referer: 'https://gogoanime.run/' },
                'hstorage': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
                'hstorage.xyz': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
                'xyz': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
                'googlevideo': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
                'default': { referer: 'https://hianimez.to/' }
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
