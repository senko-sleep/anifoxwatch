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
 * @route GET /api/stream/watch/:episodeId
 * @query server - Server name (optional, default: auto-select best)
 * @query category - sub/dub
 * @query proxy - If true, automatically proxy all stream URLs (default: true)
 * @description Get streaming URLs for an episode
 */
router.get('/watch/:episodeId', async (req: Request, res: Response): Promise<void> => {
    const episodeId = req.params.episodeId as string;
    const { server, category, proxy: useProxy = 'true' } = req.query;
    const requestId = (req as any).id;
    const shouldProxy = useProxy !== 'false';
    const proxyBase = getProxyBaseUrl(req);
    
    logger.info(`[STREAM] Fetching stream for episode: ${episodeId}`, {
        episodeId,
        server,
        category,
        shouldProxy,
        requestId
    });

    try {
        const streamData = await sourceManager.getStreamingLinks(
            episodeId,
            server as string | undefined,
            category as 'sub' | 'dub' | undefined
        );

        if (streamData.sources.length === 0) {
            logger.error(`[STREAM] No sources found for episode: ${episodeId}`, undefined, {
                episodeId,
                server: server as string,
                category: category as string,
                requestId
            });

            res.status(404).json({
                error: 'No streaming sources found',
                episodeId,
                server,
                category,
                suggestion: 'Try a different server or check episode availability'
            });
            return;
        }

        // Log original sources
        logger.info(`[STREAM] Found ${streamData.sources.length} sources for episode: ${episodeId}`, {
            episodeId,
            sourceCount: streamData.sources.length,
            qualities: streamData.sources.map(s => s.quality).join(', '),
            originalUrls: streamData.sources.map(s => s.url.substring(0, 50) + '...'),
            requestId
        });

        // Proxy the stream URLs if requested
        if (shouldProxy) {
            streamData.sources = streamData.sources.map(source => ({
                ...source,
                url: proxyUrl(source.url, proxyBase),
                originalUrl: source.url // Keep original for debugging
            }));

            // Also proxy subtitle URLs
            if (streamData.subtitles) {
                streamData.subtitles = streamData.subtitles.map(sub => ({
                    ...sub,
                    url: proxyUrl(sub.url, proxyBase)
                }));
            }

            logger.info(`[STREAM] Proxied ${streamData.sources.length} sources`, {
                episodeId,
                proxiedUrls: streamData.sources.map(s => s.url.substring(0, 80)),
                requestId
            });
        }

        // Add cache headers for performance
        res.set('Cache-Control', 'private, max-age=3600'); // 1 hour
        res.json(streamData);
    } catch (error: any) {
        logger.error(`[STREAM] Error fetching stream for episode: ${episodeId}`, error, {
            episodeId,
            server,
            category,
            requestId
        });
        res.status(500).json({ error: 'Failed to get streaming links', message: error.message });
    }
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
        const referers: Record<string, string> = {
            'sunshinerays': 'https://rapid-cloud.co/',
            'rainveil': 'https://rapid-cloud.co/',
            'lightningspark': 'https://megacloud.tv/',
            'megacloud': 'https://megacloud.tv/',
            'vidcloud': 'https://vidcloud9.com/',
            'rapid-cloud': 'https://rapid-cloud.co/',
            'default': 'https://hianimez.to/'
        };
        
        const matchedReferer = Object.entries(referers).find(([key]) => domain.includes(key));
        const referer = matchedReferer ? matchedReferer[1] : referers.default;
        
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': referer,
                'Origin': referer.replace(/\/$/, ''),
                'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': isM3u8 ? 'empty' : 'video',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site'
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
