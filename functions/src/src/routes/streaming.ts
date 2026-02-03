import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

const router = Router();

// Base URL for proxy - used to rewrite stream URLs
const getProxyBaseUrl = (req: Request): string => {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/api/stream/proxy`;
};

/**
 * Convert a raw stream URL to a proxied URL
 */
const proxyUrl = (url: string, proxyBase: string): string => {
    return `${proxyBase}?url=${encodeURIComponent(url)}`;
};

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
 * @route GET /api/stream/servers/:episodeId
 * @description Get available streaming servers for an episode
 */
router.get('/servers/:episodeId', async (req: Request, res: Response): Promise<void> => {
    const episodeId = req.params.episodeId as string;
    const requestId = (req as any).id;

    logger.info(`[STREAM] Getting servers for episode: ${episodeId}`, { episodeId, requestId });

    try {
        const servers = await sourceManager.getEpisodeServers(episodeId);

        logger.info(`[STREAM] Found ${servers.length} servers for episode: ${episodeId}`, {
            episodeId,
            serverCount: servers.length,
            servers: servers.map(s => `${s.name}(${s.type})`).join(', '),
            requestId
        });

        res.json({ servers });
    } catch (error: any) {
        logger.error(`[STREAM] Failed to get servers for episode: ${episodeId}`, error, {
            episodeId,
            requestId
        });
        res.status(500).json({ error: 'Failed to get servers', message: error.message });
    }
});

/**
 * Server priority order - hd-2 works best based on testing
 */
const SERVER_PRIORITY = ['hd-2', 'hd-1', 'hd-3'];

/**
 * @route GET /api/stream/watch/:episodeId
 * @query server - Server name (optional, will try multiple if not specified)
 * @query category - sub/dub
 * @query proxy - If true, automatically proxy all stream URLs (default: true)
 * @query tryAll - If true, try all servers until one works (default: true)
 * @description Get streaming URLs for an episode
 */
router.get('/watch/:episodeId', async (req: Request, res: Response): Promise<void> => {
    const episodeId = req.params.episodeId as string;
    const { server, category, proxy: useProxy = 'true', tryAll = 'true' } = req.query;
    const requestId = (req as any).id;
    const shouldProxy = useProxy !== 'false';
    const shouldTryAll = tryAll !== 'false' && !server; // Only try all if no specific server requested
    const proxyBase = getProxyBaseUrl(req);

    logger.info(`[STREAM] Fetching stream for episode: ${episodeId}`, {
        episodeId,
        server,
        category,
        shouldProxy,
        shouldTryAll,
        requestId
    });

    // Determine servers to try
    const serversToTry = server ? [server as string] : SERVER_PRIORITY;
    let streamData: any = { sources: [], subtitles: [] };
    let lastError: string | null = null;
    let successServer: string | null = null;

    for (const currentServer of serversToTry) {
        try {
            logger.info(`[STREAM] Trying server: ${currentServer}`, { episodeId, requestId });

            const data = await sourceManager.getStreamingLinks(
                episodeId,
                currentServer,
                (category as 'sub' | 'dub') || 'sub'
            );

            if (data.sources && data.sources.length > 0) {
                streamData = data;
                successServer = currentServer;
                logger.info(`[STREAM] ✅ Got ${data.sources.length} sources from ${currentServer}`, {
                    episodeId,
                    server: currentServer,
                    qualities: data.sources.map((s: any) => s.quality).join(', '),
                    requestId
                });
                break;
            } else {
                logger.warn(`[STREAM] No sources from ${currentServer}`, { episodeId, requestId });
            }
        } catch (error: any) {
            lastError = error.message;
            logger.warn(`[STREAM] Server ${currentServer} failed: ${error.message}`, { episodeId, requestId });

            if (!shouldTryAll) {
                break;
            }
        }
    }

    if (streamData.sources.length === 0) {
        logger.error(`[STREAM] No sources found after trying all servers for episode: ${episodeId}`, undefined, {
            episodeId,
            triedServers: serversToTry.join(', '),
            category: category as string,
            lastError,
            requestId
        });

        res.status(404).json({
            error: 'No streaming sources found',
            episodeId,
            triedServers: serversToTry,
            lastError,
            suggestion: 'All servers failed. Please try again later.'
        });
        return;
    }

    // Log successful extraction
    logger.info(`[STREAM] Found ${streamData.sources.length} sources from ${successServer}`, {
        episodeId,
        server: successServer,
        sourceCount: streamData.sources.length,
        qualities: streamData.sources.map((s: any) => s.quality).join(', '),
        originalUrls: streamData.sources.map((s: any) => s.url?.substring(0, 50) + '...'),
        requestId
    });

    // Proxy the stream URLs if requested
    if (shouldProxy) {
        streamData.sources = streamData.sources.map((source: any) => ({
            ...source,
            url: proxyUrl(source.url, proxyBase),
            originalUrl: source.url // Keep original for debugging
        }));

        // Also proxy subtitle URLs
        if (streamData.subtitles) {
            streamData.subtitles = streamData.subtitles.map((sub: any) => ({
                ...sub,
                url: proxyUrl(sub.url, proxyBase)
            }));
        }

        logger.info(`[STREAM] Proxied ${streamData.sources.length} sources`, {
            episodeId,
            proxiedUrls: streamData.sources.map((s: any) => s.url?.substring(0, 80)),
            requestId
        });
    }

    // Add server info to response
    streamData.server = successServer;
    streamData.triedServers = serversToTry;

    // Short cache - streams expire quickly
    res.set('Cache-Control', 'private, max-age=300'); // 5 minutes
    res.json(streamData);
});

/**
 * @route GET /api/stream/proxy
 * @query url - HLS manifest or segment URL to proxy
 * @description Proxy HLS streams to avoid CORS issues and blocked domains
 */
router.get('/proxy', async (req: Request, res: Response): Promise<void> => {
    const { url } = req.query;
    const requestId = (req as any).id;
    const proxyBase = getProxyBaseUrl(req);

    if (!url || typeof url !== 'string') {
        logger.warn(`[PROXY] Missing URL parameter`, { requestId });
        res.status(400).json({ error: 'URL parameter is required' });
        return;
    }

    // Basic validation: require http(s) URL
    if (!/^https?:\/\//i.test(url)) {
        logger.warn(`[PROXY] Invalid URL format: ${url}`, { requestId });
        res.status(400).json({ error: 'Invalid streaming URL' });
        return;
    }

    // Extract domain for logging (don't log full URL which may contain tokens)
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const isM3u8 = url.includes('.m3u8');
    const isSegment = url.includes('.ts') || url.includes('.m4s');

    logger.info(`[PROXY] Proxying ${isM3u8 ? 'manifest' : isSegment ? 'segment' : 'resource'} from ${domain}`, {
        domain,
        type: isM3u8 ? 'manifest' : isSegment ? 'segment' : 'other',
        requestId
    });

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
            'default': { referer: 'https://hianimez.to/' }
        };

        const matchedConfig = Object.entries(cdnConfig).find(([key]) => domain.includes(key));
        const config = matchedConfig ? matchedConfig[1] : cdnConfig.default;
        const referer = config.referer;
        const origin = config.origin || referer.replace(/\/$/, '');

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': referer,
                'Origin': origin,
                'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': isM3u8 ? 'empty' : 'video',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site',
                'Connection': 'keep-alive'
            },
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500 // Allow 4xx for error handling
        });

        // Log response status
        if (response.status >= 400) {
            logger.warn(`[PROXY] Upstream returned ${response.status} for ${domain}`, {
                status: response.status,
                domain,
                requestId
            });
            res.status(response.status).json({
                error: 'Upstream error',
                status: response.status,
                domain
            });
            return;
        }

        // Set appropriate content type
        const upstreamContentType = response.headers?.['content-type'];
        if (upstreamContentType) {
            res.set('Content-Type', upstreamContentType);
        } else if (isM3u8) {
            res.set('Content-Type', 'application/vnd.apple.mpegurl');
        } else if (url.includes('.ts')) {
            res.set('Content-Type', 'video/MP2T');
        } else if (url.includes('.m4s')) {
            res.set('Content-Type', 'video/iso.segment');
        }

        // CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Range');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');

        // Cache segments longer than manifests
        if (isSegment) {
            res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
        } else if (isM3u8) {
            res.set('Cache-Control', 'private, max-age=5'); // 5 seconds for live content
        }

        // If this is an m3u8 manifest, rewrite URLs inside it
        if (isM3u8) {
            const content = response.data.toString('utf-8');
            const rewrittenContent = rewriteM3u8Content(content, url, proxyBase);
            res.send(rewrittenContent);

            logger.info(`[PROXY] Rewrote m3u8 manifest from ${domain}`, {
                domain,
                originalSize: content.length,
                rewrittenSize: rewrittenContent.length,
                requestId
            });
        } else {
            // Send binary data as-is for segments
            res.send(response.data);
        }
    } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
        const isBlocked = errorMessage.includes('blocked') || errorMessage.includes('forbidden');

        logger.error(`[PROXY] Failed to proxy from ${domain}`, error, {
            domain,
            errorMessage,
            isTimeout,
            isBlocked,
            requestId
        });

        res.status(502).json({
            error: 'Failed to proxy stream',
            reason: isTimeout ? 'timeout' : isBlocked ? 'blocked' : 'connection_error',
            domain,
            message: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        });
    }
});

/**
 * @route OPTIONS /api/stream/proxy
 * @description Handle CORS preflight for proxy
 */
router.options('/proxy', (req: Request, res: Response) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Range, Origin, Accept');
    res.set('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
});

export default router;
