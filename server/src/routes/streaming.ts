import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';
import { tryFetchHianimeRestStreamingData } from '../services/hianime-rest-fallback.js';
import { isHianimeStyleEpisodeId } from '../utils/hianime-rest-servers.js';
import { logger } from '../utils/logger.js';
import axios, { type AxiosResponse } from 'axios';
import https from 'https';
import { lookup } from 'dns/promises';
import type { StreamingData, VideoSource, VideoSubtitle } from '../types/streaming.js';

const router = Router();

/** When `REMOTE_PROXY_URL` is unset, chain HLS proxy through the Cloudflare Worker (not Render). */
const DEFAULT_REMOTE_STREAM_PROXY =
    process.env.DEFAULT_REMOTE_STREAM_PROXY ||
    'https://anifoxwatch-api.anya-bot.workers.dev/api/stream/proxy';

/**
 * AnimeKai (and peers) return a placeholder server named "default". Passing that to
 * /api/stream/watch disables multi-server racing and confuses upstream APIs that expect
 * concrete embed ids (hd-1, hd-2, vidstreaming, …). Treat it as "no preference".
 */
function normalizeStreamServerQuery(raw: unknown): string | undefined {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (!s || s.toLowerCase() === 'default') return undefined;
    return s;
}

// Known dead/unresolvable domains that should be filtered out
const DEAD_DOMAINS = [
    'streamable.cloud',
    'streamable.video',
    'streamable.host',
    'dead-cdn.example'
];

/**
 * Enhanced CDN configurations with fallback URLs for better reliability
 */
const CDN_CONFIGS: Array<{
    pattern: RegExp;
    configs: Array<{ referer: string; origin?: string; userAgent?: string }>;
}> = [
    {
        pattern: /fast4speed|allanime/i,
        configs: [
            { referer: 'https://allanime.day/', origin: 'https://allanime.day' }
        ]
    },
    {
        pattern: /rapid-cloud\.co/i,
        configs: [
            { referer: 'https://rapid-cloud.co/', origin: 'https://rapid-cloud.co' },
            { referer: 'https://9anime.lu/', origin: 'https://9anime.lu' }
        ]
    },
    {
        pattern: /megacloud/i,
        configs: [
            { referer: 'https://megacloud.blog/', origin: 'https://megacloud.blog' },
            { referer: 'https://aniwave.to/', origin: 'https://aniwave.to' }
        ]
    },
    {
        pattern: /vidcloud/i,
        configs: [
            { referer: 'https://vidcloud9.com/', origin: 'https://vidcloud9.com' },
            { referer: 'https://vidstreaming.io/', origin: 'https://vidstreaming.io' }
        ]
    },
    {
        pattern: /gogocdn/i,
        configs: [
            { referer: 'https://gogoanime.run/', origin: 'https://gogoanime.run' },
            { referer: 'https://gogoanime.ai/', origin: 'https://gogoanime.ai' }
        ]
    },
    {
        pattern: /aniwatchtv|megacloud|rapid-cloud/i,
        configs: [{ referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' }],
    },
    {
        pattern: /watchhentai/i,
        configs: [
            { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
            { referer: 'https://hentai19.net/', origin: 'https://hentai19.net' }
        ]
    },
    {
        pattern: /megaup|tech20hub|lab27core|code29wave|net22lab|pro25zone/i,
        configs: [
            { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
            { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' }
        ]
    }
];

/**
 * Get CDN configuration with fallback support
 */
function getCdnConfigs(hostname: string): Array<{ referer: string; origin?: string; userAgent?: string }> {
    for (const config of CDN_CONFIGS) {
        if (config.pattern.test(hostname)) {
            return config.configs;
        }
    }
    // Default embed referer
    return [
        { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' },
        { referer: 'https://9anime.lu/', origin: 'https://9anime.lu' }
    ];
}

/**
 * Retry logic for failed proxy requests with exponential backoff
 */
async function retryProxyRequest(
    url: string,
    configs: Array<{ referer: string; origin?: string; userAgent?: string }>,
    maxRetries: number = 2,
    rangeHeader?: string
): Promise<AxiosResponse> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const config = configs[attempt % configs.length];
        
        try {
            const headers: Record<string, string> = {
                'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': config.referer,
                'Origin': config.origin || config.referer.replace(/\/$/, ''),
                'Connection': 'keep-alive'
            };
            
            // Forward Range header if present (crucial for seeking)
            if (rangeHeader) {
                headers['Range'] = rangeHeader;
            }
            
            return await axios({
                method: 'get',
                url,
                responseType: 'stream',
                headers,
                timeout: 30000,
                maxRedirects: 5
            });
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries) {
                // Exponential backoff: 500ms, 1000ms, 2000ms...
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
            }
        }
    }
    
    throw lastError;
}

/**
 * Check if a domain is resolvable (has valid DNS)
 */
async function isDomainResolvable(hostname: string): Promise<boolean> {
    try {
        await lookup(hostname);
        return true;
    } catch (error: any) {
        // DNS errors: ENOTFOUND, EAI_AGAIN, etc.
        if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN' || error.code === 'ENODATA') {
            return false;
        }
        // For other errors, assume it might work
        return true;
    }
}

// Protocol cache to remember domains that failed TLS and need HTTP fallback
const PROTOCOL_CACHE = new Map<string, 'http' | 'https'>();

// Domains known to be unreachable locally due to ISP/network blocking.
// These are sent directly to the remote proxy without wasting time on local attempts.
// We keep this EMPTY by default, because users' residential ISPs often do not block these,
// whereas datacenter IPs (the fallback) are heavily anti-bot protected!
const ISP_BLOCKED_DOMAINS: string[] = [];

function isIspBlockedDomain(domain: string): boolean {
    return ISP_BLOCKED_DOMAINS.some(d => domain.includes(d));
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

// Base URL for proxy - used to rewrite stream URLs
const getProxyBaseUrl = (req: Request): string => {
    // Force HTTPS on Render.com and other production environments
    const isProduction = process.env.NODE_ENV === 'production';
    const protocol = isProduction ? 'https' : req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/api/stream/proxy`;
};

/**
 * Strip nested /api/stream/proxy?url=... wrappers so m3u8 rewrites never stack
 * proxy-on-proxy (which caused 502 Bad Gateway and broken HLS).
 */
function unwrapProxyTarget(url: string): string {
    let current = url.trim();
    for (let i = 0; i < 12; i++) {
        const marker = '/api/stream/proxy';
        const mIdx = current.indexOf(marker);
        if (mIdx === -1) break;
        const qIdx = current.indexOf('?url=', mIdx);
        if (qIdx === -1) break;
        let param = current.slice(qIdx + 5);
        const amp = param.indexOf('&');
        if (amp !== -1) param = param.slice(0, amp);
        let decoded: string;
        try {
            decoded = decodeURIComponent(param);
        } catch {
            break;
        }
        if (!decoded || decoded === current) break;
        current = decoded;
    }
    return current;
}

/**
 * Convert a raw stream URL to a proxied URL (single layer only)
 */
const proxyUrl = (url: string, proxyBase: string, referer?: string): string => {
    const target = unwrapProxyTarget(url);
    let proxyStr = `${proxyBase}?url=${encodeURIComponent(target)}`;
    if (referer) {
        proxyStr += `&referer=${encodeURIComponent(referer)}`;
    }
    return proxyStr;
};

/**
 * Rewrite m3u8 content to proxy all segment URLs
 */
const rewriteM3u8Content = (content: string, originalUrl: string, proxyBase: string, referer?: string): string => {
    const urlNoQuery = originalUrl.split('?')[0].split('#')[0];
    const baseUrl = urlNoQuery.substring(0, urlNoQuery.lastIndexOf('/') + 1);
    const lines = content.split('\n');

    return lines.map(line => {
        const trimmedLine = line.trim();

        // Handle URI in EXT-X-KEY or EXT-X-MAP tags (they start with # but have URI=)
        if (trimmedLine.startsWith('#') && trimmedLine.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                const absoluteUri = uri.startsWith('http') ? uri : `${baseUrl}${uri}`;
                return `URI="${proxyUrl(absoluteUri, proxyBase, referer)}"`;
            });
        }

        // Skip other comments and empty lines
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            return line;
        }

        // Handle segment URLs (lines not starting with #)
        const absoluteUrl = trimmedLine.startsWith('http')
            ? trimmedLine
            : `${baseUrl}${trimmedLine}`;
        return proxyUrl(absoluteUrl, proxyBase, referer);
    }).join('\n');
};

/**
 * Helper to convert a stream to string
 */
async function streamToString(stream: any, maxSize = 5 * 1024 * 1024): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > maxSize) {
            throw new Error(`Stream exceeded max size of ${maxSize} bytes for M3U8 manifest`);
        }
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
}

/**
 * @route GET /api/stream/servers/:episodeId
 * @description Get available streaming servers for an episode
 */
router.get('/servers/:episodeId', async (req: Request, res: Response): Promise<void> => {
    // Decode the episodeId - Express doesn't automatically decode URL-encoded params
    let episodeId = decodeURIComponent(req.params.episodeId as string);

    // Render/nginx may decode %3F→? in paths, splitting "anime-slug?ep=3303" into
    // episodeId="anime-slug" and req.query.ep="3303". Reconstruct the full ID.
    if (req.query.ep && !episodeId.includes('?ep=')) {
        episodeId = `${episodeId}?ep=${req.query.ep}`;
    }

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
 * @query server - Optional embed/server name from the episode UI (e.g. Vidstreaming). Omit to let SourceManager choose.
 * @query category - sub/dub
 * @query proxy - If true, automatically proxy all stream URLs (default: true)
 * @description Get streaming URLs for an episode
 */
router.get('/watch/:episodeId', async (req: Request, res: Response): Promise<void> => {
    // Decode the episodeId - Express doesn't automatically decode URL-encoded params
    let episodeId = decodeURIComponent(req.params.episodeId as string);

    // Render/nginx may decode %3F→? in paths, splitting "anime-slug?ep=3303" into
    // episodeId="anime-slug" and req.query.ep="3303". Reconstruct the full ID.
    if (req.query.ep && !episodeId.includes('?ep=')) {
        episodeId = `${episodeId}?ep=${req.query.ep}`;
    }

    const { category, proxy: useProxy = 'true' } = req.query;
    const explicitServer = normalizeStreamServerQuery(req.query.server);
    const epNumRaw = req.query.ep_num;
    const episodeNum = epNumRaw ? parseInt(String(epNumRaw), 10) || undefined : undefined;
    const requestId = (req as any).id;
    const shouldProxy = useProxy !== 'false';
    const proxyBase = getProxyBaseUrl(req);

    const triedLabel = explicitServer ?? 'auto';

    logger.info(`[STREAM] Fetching stream for episode: ${episodeId}`, {
        episodeId,
        server: triedLabel,
        category,
        episodeNum,
        shouldProxy,
        requestId
    });

    let streamData: any = { sources: [], subtitles: [] };
    let lastError: string | null = null;

    try {
        streamData = await sourceManager.getStreamingLinks(
            episodeId,
            explicitServer,
            (category as 'sub' | 'dub') || 'sub',
            episodeNum
        );
    } catch (error: any) {
        lastError = error.message;
        logger.warn(`[STREAM] getStreamingLinks failed: ${error.message}`, { episodeId, requestId });
    }

    if ((!streamData.sources || streamData.sources.length === 0) && isHianimeStyleEpisodeId(episodeId)) {
        const fromRest = await tryFetchHianimeRestStreamingData({
            episodeId,
            category: ((category as 'sub' | 'dub') || 'sub'),
            explicitServer: explicitServer,
        });
        if (fromRest?.sources?.length) {
            streamData = fromRest;
            logger.info(`[STREAM] HiAnime REST fallback succeeded for ${episodeId}`, { requestId });
        }
    }

    const winningSource = typeof streamData?.source === 'string' ? streamData.source : undefined;
    const successServer = explicitServer || winningSource || triedLabel;

    if (!streamData.sources || streamData.sources.length === 0) {
        logger.error(`[STREAM] No sources found for episode: ${episodeId}`, undefined, {
            episodeId,
            triedServers: triedLabel,
            category: category as string,
            lastError,
            requestId
        });

        res.status(404).json({
            error: 'No streaming sources found',
            episodeId,
            triedServers: explicitServer ? [explicitServer] : ['auto'],
            lastError,
            suggestion: 'All streaming sources failed. Please try again later.'
        });
        return;
    }

    // Log successful extraction
    logger.info(`[STREAM] Found ${streamData.sources.length} sources (${winningSource || explicitServer || 'auto'})`, {
        episodeId,
        server: successServer,
        sourceCount: streamData.sources.length,
        qualities: streamData.sources.map((s: any) => s.quality).join(', '),
        originalUrls: streamData.sources.map((s: any) => s.url?.substring(0, 50) + '...'),
        requestId
    });

    // Proxy the stream URLs if requested
    // Clone before mutating — sources may come from a shared in-memory cache object.
    // Mutating in-place would poison the cache with proxy-wrapped URLs on subsequent calls.
    const response: StreamingData & { server?: string; triedServers?: string[] } = { ...streamData };

    if (shouldProxy) {
        const streamReferer = streamData.headers?.Referer || streamData.headers?.referer || 'https://megacloud.blog/';

        // Some kwik hosts work better as direct browser fetches; vault-*.owocdn.top must NOT
        // be direct — browsers often hit ERR_SSL_PROTOCOL_ERROR on raw HTTPS to owocdn.
        // Always proxy owocdn/vault through this API so HLS loads same-origin.
        // NOTE: megaup/rrr domains need a Referer header — must go through proxy.
        const DIRECT_PLAY_DOMAINS = ['kwik.si', 'kwik.cx'];
        const isDirectPlay = (url: string) => {
            try {
                const h = new URL(url).hostname.toLowerCase();
                return DIRECT_PLAY_DOMAINS.some((d) => h.includes(d));
            } catch { return false; }
        };

        response.sources = streamData.sources.map((source: VideoSource): VideoSource => {
            const rawUrl = source.originalUrl || source.url;
            if (isDirectPlay(rawUrl)) {
                return { ...source, isDirect: true, originalUrl: rawUrl };
            }
            return {
                ...source,
                url: proxyUrl(rawUrl, proxyBase, streamReferer),
                originalUrl: rawUrl
            };
        });

        if (streamData.subtitles) {
            response.subtitles = streamData.subtitles.map((sub: VideoSubtitle): VideoSubtitle => ({
                ...sub,
                url: isDirectPlay(sub.url) ? sub.url : proxyUrl(sub.url, proxyBase, streamReferer)
            }));
        }

        logger.info(`[STREAM] Processed ${response.sources.length} sources (direct: ${response.sources.filter((s: VideoSource) => s.isDirect).length})`, {
            episodeId,
            requestId
        });
    }

    // Add server info to response
    response.server = successServer;
    response.triedServers = explicitServer ? [explicitServer] : ['auto'];

    // Short cache - streams expire quickly
    res.set('Cache-Control', 'private, max-age=300'); // 5 minutes
    res.json(response);
});

/**
 * @route GET /api/stream/proxy
 * @query url - HLS manifest or segment URL to proxy
 * @description Proxy HLS streams and videos to avoid CORS issues and blocked domains. Supports Range requests.
 */
router.get('/proxy', async (req: Request, res: Response): Promise<void> => {
    let url = req.query.url as string | undefined;
    const requestId = (req as any).id;
    const proxyBase = getProxyBaseUrl(req);

    const refererParam = req.query.referer as string | undefined;

    if (!url || typeof url !== 'string') {
        logger.warn(`[PROXY] Missing URL parameter`, { requestId });
        res.status(400).json({ error: 'URL parameter is required' });
        return;
    }

    url = unwrapProxyTarget(url);

    // Basic validation: require http(s) URL
    if (!/^https?:\/\//i.test(url)) {
        logger.warn(`[PROXY] Invalid URL format after unwrap`, { requestId });
        res.status(400).json({ error: 'Invalid streaming URL' });
        return;
    }

    // Extract domain for logging (don't log full URL which may contain tokens)
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const isM3u8 = url.includes('.m3u8');
    const isSegment = url.includes('.ts') || url.includes('.m4s');
    const isVideo = url.endsWith('.mp4');

    logger.info(`[PROXY] Proxying ${isM3u8 ? 'manifest' : isVideo ? 'video' : 'resource'} from ${domain}`, {
        domain,
        type: isM3u8 ? 'manifest' : isVideo ? 'video' : 'other',
        requestId
    });

    try {
        const cdnConfig: Record<string, { referer: string; origin?: string }> = {
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
            'megaup': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
            'lab27core': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
            'code29wave': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
            'net22lab': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
            'pro25zone': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
            'tech20hub': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
            'gogocdn': { referer: 'https://gogoanime.run/' },
            'fast4speed': { referer: 'https://allanime.day', origin: 'https://allanime.day' },
            'hstorage': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
            'hstorage.xyz': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
            'xyz': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
            'googlevideo': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
            'owocdn': { referer: 'https://kwik.si/', origin: 'https://kwik.si' },
            'vault': { referer: 'https://kwik.cx/', origin: 'https://kwik.cx' },
            'kwik': { referer: 'https://kwik.si/', origin: 'https://kwik.si' },
            'animekai': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
            'shop21pro': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
            'animepahe': { referer: 'https://animepahe.ru/', origin: 'https://animepahe.ru' },
            'pahe': { referer: 'https://animepahe.ru/', origin: 'https://animepahe.ru' },
            'nextcdn': { referer: 'https://animepahe.ru/', origin: 'https://animepahe.ru' },
            'streamtape': { referer: 'https://streamtape.com/', origin: 'https://streamtape.com' },
            'tapecontent': { referer: 'https://streamtape.com/', origin: 'https://streamtape.com' },
            'streamwish': { referer: 'https://streamwish.to/', origin: 'https://streamwish.to' },
            'default': { referer: 'https://megacloud.blog/', origin: 'https://megacloud.blog' }
        };

        const matchedConfig = Object.entries(cdnConfig).find(([key]) => key !== 'default' && domain.includes(key));
        const config = matchedConfig ? matchedConfig[1] : cdnConfig.default;

        // MegaUp CDN domains need the specific embed page URL as referer, not root.
        // Detect by CDN config referer being megaup.nl.
        const isMegaupCdn = config.referer.includes('megaup.nl');

        const refererCombos: Array<{ referer: string; origin: string }> = [];

        if (matchedConfig) {
            // For MegaUp CDNs: try the embed page URL first, then root megaup.nl
            if (isMegaupCdn && refererParam) {
                let paramOrigin: string;
                try { paramOrigin = new URL(refererParam).origin; } catch { paramOrigin = 'https://megaup.nl'; }
                refererCombos.push({ referer: refererParam, origin: paramOrigin });
                refererCombos.push({ referer: 'https://megaup.nl/', origin: 'https://megaup.nl' });
            } else {
                refererCombos.push({
                    referer: config.referer,
                    origin: config.origin || config.referer.replace(/\/$/, '')
                });
                if (refererParam && refererParam !== config.referer) {
                    let paramOrigin: string;
                    try { paramOrigin = new URL(refererParam).origin; } catch { paramOrigin = config.origin || 'https://megacloud.blog'; }
                    refererCombos.push({ referer: refererParam, origin: paramOrigin });
                }
            }
        } else if (refererParam) {
            let paramOrigin: string;
            try { paramOrigin = new URL(refererParam).origin; } catch { paramOrigin = 'https://megacloud.blog'; }
            refererCombos.push({ referer: refererParam, origin: paramOrigin });
            refererCombos.push({
                referer: config.referer,
                origin: config.origin || config.referer.replace(/\/$/, '')
            });
        } else {
            refererCombos.push({
                referer: config.referer,
                origin: config.origin || config.referer.replace(/\/$/, '')
            });
        }

        if (!refererCombos.some(c => c.referer.includes('aniwatchtv.to'))) {
            refererCombos.push({ referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' });
        }

        if (domain.includes('owocdn')) {
            const extras: Array<{ referer: string; origin: string }> = [
                { referer: 'https://animepahe.ru/', origin: 'https://animepahe.ru' },
                { referer: 'https://kwik.cx/', origin: 'https://kwik.cx' },
                { referer: 'https://kwik.si/', origin: 'https://kwik.si' },
                { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' },
            ];
            for (const e of extras) {
                if (!refererCombos.some((c) => c.referer === e.referer)) {
                    refererCombos.push(e);
                }
            }
        }

        if (isDeadDomain(url)) {
            logger.warn(`[PROXY] Skipping dead domain: ${domain}`, { domain, requestId });
            res.status(502).json({
                error: 'Dead domain',
                reason: 'dead_domain',
                domain,
                message: `Domain ${domain} is known to be non-functional`
            });
            return;
        }

        // Fast-path: skip local attempts for ISP-blocked domains
        if (isIspBlockedDomain(domain)) {
            logger.info(`[PROXY] ISP-blocked domain ${domain} — routing directly to remote proxy`, { domain, requestId });
            const remoteProxy = process.env.REMOTE_PROXY_URL || DEFAULT_REMOTE_STREAM_PROXY;
            try {
                const remoteTarget = `${remoteProxy}?url=${encodeURIComponent(url)}${refererParam ? `&referer=${encodeURIComponent(refererParam)}` : ''}`;
                const remoteResp = await axios({ method: 'get', url: remoteTarget, responseType: 'stream', timeout: 50000, maxRedirects: 5 });
                const ct = remoteResp.headers['content-type'] || 'application/vnd.apple.mpegurl';
                res.setHeader('Content-Type', ct);
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-store');
                res.status(200);
                remoteResp.data.on('error', (err: any) => {
                    logger.error(`[PROXY] Remote fast-path pipeline error for ${domain}`, err);
                    if (!res.headersSent) res.status(502).end();
                });
                remoteResp.data.pipe(res);
                logger.info(`[PROXY] Remote fast-path success for ${domain}`, { domain, requestId });
                return;
            } catch (remoteErr: unknown) {
                logger.warn(`[PROXY] Remote fast-path failed for ${domain}: ${remoteErr instanceof Error ? remoteErr.message : String(remoteErr)}`, { requestId });
                res.status(502).json({ error: 'ISP-blocked domain unreachable via remote proxy', domain });
                return;
            }
        }

        const isResolvable = await isDomainResolvable(domain);
        if (!isResolvable) {
            logger.warn(`[PROXY] Domain not resolvable: ${domain}`, { domain, requestId });
            res.status(502).json({
                error: 'Domain not resolvable',
                reason: 'dns_error',
                domain,
                message: `Domain ${domain} cannot be resolved`
            });
            return;
        }

        // Try each referer combo until one succeeds
        let response: any = null;
        let lastProxyError: any = null;

        for (let attempt = 0; attempt < refererCombos.length; attempt++) {
            const combo = refererCombos[attempt];
            const headers: any = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': combo.referer,
                'Origin': combo.origin,
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site'
            };

            if (req.headers.range) {
                headers['Range'] = req.headers.range;
            }

            const makeProxyRequest = (protocol: 'http' | 'https', relaxedTls: boolean) => {
                const targetUrl = protocol === 'http' ? url.replace(/^https:\/\//i, 'http://') : url;
                return axios({
                    method: 'get',
                    url: targetUrl,
                    responseType: 'stream',
                    headers,
                    timeout: 22000,
                    maxRedirects: 5,
                    validateStatus: (status: number) => status < 400,
                    ...(relaxedTls ? {
                        httpsAgent: new (require('https').Agent)({
                            rejectUnauthorized: false,
                            secureOptions: require('crypto').constants.SSL_OP_LEGACY_SERVER_CONNECT,
                            ciphers: 'DEFAULT:@SECLEVEL=0'
                        })
                    } : {})
                });
            };

            // Check protocol cache
            const cachedProtocol = PROTOCOL_CACHE.get(domain);
            
            try {
                if (cachedProtocol === 'http') {
                    response = await makeProxyRequest('http', false);
                } else {
                    response = await makeProxyRequest('https', false);
                }
                logger.info(`[PROXY] Success on attempt ${attempt + 1} with referer ${combo.referer}`, { domain, requestId });
                break;
            } catch (err: unknown) {
                lastProxyError = err;
                const errMsg = err instanceof Error ? err.message : String(err);
                const errCode = (err as NodeJS.ErrnoException).code;
                const isEconnreset = errCode === 'ECONNRESET' || errMsg.includes('socket hang up') || errCode === 'ECONNREFUSED';
                const isEproto = errMsg.includes('EPROTO') || errCode === 'EPROTO' || isEconnreset;
                const isTlsError = isEproto || errMsg.includes('wrong version number') || errMsg.includes('alert protocol version');
                
                if (isTlsError && cachedProtocol !== 'http') {
                    logger.warn(`[PROXY] TLS/EPROTO for ${domain} — retrying with relaxed TLS`, { requestId });
                    try {
                        response = await makeProxyRequest('https', true);
                        logger.info(`[PROXY] Relaxed TLS success for ${domain}`, { domain, requestId });
                        break;
                    } catch (tlsErr: unknown) {
                        lastProxyError = tlsErr;
                        const tlsErrMsg = tlsErr instanceof Error ? tlsErr.message : String(tlsErr);
                        logger.warn(`[PROXY] Relaxed TLS also failed for ${domain}: ${tlsErrMsg}`, { requestId });
                        
                        if (url.startsWith('https://')) {
                            logger.warn(`[PROXY] Trying HTTP fallback for ${domain}`, { requestId });
                            try {
                                const httpResp = await makeProxyRequest('http', false);
                                const ct = httpResp.headers['content-type'] || '';
                                if (ct.includes('text/html')) {
                                    // ISP block page — drain and discard
                                    if (typeof httpResp.data?.resume === 'function') httpResp.data.resume();
                                    logger.warn(`[PROXY] HTTP fallback returned HTML (ISP block?) for ${domain}`, { requestId });
                                } else {
                                    response = httpResp;
                                    PROTOCOL_CACHE.set(domain, 'http');
                                    logger.info(`[PROXY] HTTP fallback success for ${domain}`, { domain, requestId });
                                    break;
                                }
                            } catch (httpErr: unknown) {
                                lastProxyError = httpErr;
                                logger.warn(`[PROXY] HTTP fallback also failed for ${domain}: ${httpErr instanceof Error ? httpErr.message : String(httpErr)}`, { requestId });
                            }
                        }
                    }
                }
                logger.warn(`[PROXY] Attempt ${attempt + 1}/${refererCombos.length} failed for ${domain} (referer: ${combo.referer}): ${errMsg}`, { requestId });
                if (attempt < refererCombos.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        }

        if (!response) {
            // Remote proxy fallback: when local can't reach CDN (e.g. ISP block), forward via Worker proxy.
            const remoteProxy = process.env.REMOTE_PROXY_URL || DEFAULT_REMOTE_STREAM_PROXY;
            logger.info(`[PROXY] All local attempts failed, trying remote fallback for ${domain}`, { domain, requestId });
            try {
                const remoteTarget = `${remoteProxy}?url=${encodeURIComponent(url)}${refererParam ? `&referer=${encodeURIComponent(refererParam)}` : ''}`;
                const remoteResp = await axios({ method: 'get', url: remoteTarget, responseType: 'stream', timeout: 35000, maxRedirects: 5 });
                const ct = remoteResp.headers['content-type'] || 'application/vnd.apple.mpegurl';
                res.setHeader('Content-Type', ct);
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-store');
                res.status(200);
                remoteResp.data.on('error', (err: any) => {
                    logger.error(`[PROXY] Remote fallback pipeline error for ${domain}`, err);
                    if (!res.headersSent) res.status(502).end();
                });
                remoteResp.data.pipe(res);
                logger.info(`[PROXY] Remote fallback success for ${domain}`, { domain, requestId });
                return;
            } catch (remoteErr: unknown) {
                logger.warn(`[PROXY] Remote fallback also failed for ${domain}: ${remoteErr instanceof Error ? remoteErr.message : String(remoteErr)}`, { requestId });
            }
            
            throw lastProxyError || new Error('All proxy attempts failed');
        }

        if (response.status >= 400) {
            logger.warn(`[PROXY] Upstream returned ${response.status} for ${domain}`, {
                status: response.status,
                domain,
                requestId
            });
            if (response.data && typeof response.data.resume === 'function') {
                response.data.resume();
            }
            res.status(response.status).json({
                error: 'Upstream error',
                status: response.status,
                domain
            });
            return;
        }

        // Determine content type
        const upstreamContentType = response.headers['content-type'] || '';
        // Better M3U8 detection: extension, content-type, or known AnimeKai pattern
        const isUpstreamM3u8 = 
            upstreamContentType.includes('x-mpegurl') || 
            upstreamContentType.includes('vnd.apple.mpegurl') || 
            url.includes('.m3u8') ||
            (domain.includes('shop21pro.site') && !url.includes('.ts') && !url.includes('.m4s'));

        // Handle M3U8 Manifests (Buffer & Rewrite)
        if (isUpstreamM3u8) {
            try {
                const content = await streamToString(response.data);
                const rewrittenContent = rewriteM3u8Content(
                    content,
                    url,
                    proxyBase,
                    refererParam || refererCombos[0]?.referer
                );

                res.set('Content-Type', 'application/vnd.apple.mpegurl');
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
                res.set('Access-Control-Allow-Origin', '*');
                res.send(rewrittenContent);

                logger.info(`[PROXY] Rewrote m3u8 manifest from ${domain}`, {
                    domain,
                    originalSize: content.length,
                    requestId
                });
                return;
            } catch (err) {
                logger.error(`[PROXY] Failed to process m3u8 from ${domain}`, err as Error);
                res.status(502).json({ error: 'Failed to process manifest' });
                return;
            }
        }

        // Handle Video/Binary content (Stream/Pipe)

        // Forward content headers, but skip if the response was compressed 
        // because Axios automatically decompressed the stream, meaning the original 
        // Content-Length and Content-Encoding are no longer accurate for the piped uncompressed bytes.
        if (response.headers['content-length'] && !response.headers['content-encoding']) {
            res.set('Content-Length', response.headers['content-length']);
        }
        if (response.headers['content-range']) res.set('Content-Range', response.headers['content-range']);
        if (response.headers['accept-ranges']) res.set('Accept-Ranges', response.headers['accept-ranges']);

        // Set Content-Type — override application/octet-stream for known video CDNs
        const isOctetStream = upstreamContentType === 'application/octet-stream' || upstreamContentType === '';
        const isKnownVideoCdn = domain.includes('fast4speed') || domain.includes('hstorage');
        if (isOctetStream && isKnownVideoCdn) {
            res.set('Content-Type', 'video/mp4');
        } else if (upstreamContentType) {
            res.set('Content-Type', upstreamContentType);
        } else if (url.includes('.ts')) {
            res.set('Content-Type', 'video/MP2T');
        } else if (url.endsWith('.mp4')) {
            res.set('Content-Type', 'video/mp4');
        }

        // CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Range');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

        // Cache control
        if (isSegment || isVideo) {
            res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
        } else {
            res.set('Cache-Control', 'public, max-age=3600');
        }

        // Set status code (200 or 206)
        res.status(response.status);

        // Pipe the stream
        response.data.pipe(res);

        // Handle errors during streaming
        response.data.on('error', (err: any) => {
            logger.error(`[PROXY] Stream error from ${domain}`, err);
            if (!res.headersSent) {
                res.status(502).json({ error: 'Stream error' });
            } else {
                res.end();
            }
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errCode = (error as NodeJS.ErrnoException).code;
        const isTimeout = errCode === 'ECONNABORTED' || errCode === 'ETIMEDOUT';
        const isBlocked = errorMessage.includes('blocked') || errorMessage.includes('forbidden');
        const isEconnreset = errCode === 'ECONNRESET' || errorMessage.includes('socket hang up') || errCode === 'ECONNREFUSED';
        const isEproto = errorMessage.includes('EPROTO') || errCode === 'EPROTO' || isEconnreset;

        logger.error(`[PROXY] Failed to proxy from ${domain}`, error instanceof Error ? error : undefined, {
            domain,
            errorMessage,
            isTimeout,
            isBlocked,
            requestId
        });

        if (!res.headersSent) {
            res.status(502).json({
                error: 'Failed to proxy stream',
                reason: isEproto ? 'tls_error' : isTimeout ? 'timeout' : isBlocked ? 'blocked' : 'connection_error',
                retryable: isEproto,
                domain,
                message: process.env.NODE_ENV === 'development' ? errorMessage : undefined
            });
        }
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
