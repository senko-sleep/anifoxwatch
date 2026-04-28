import { Router } from 'express';
import { sourceManager } from '../services/source-manager.js';
import { tryFetchHianimeRestStreamingData } from '../services/hianime-rest-fallback.js';
import { isHianimeStyleEpisodeId } from '../utils/hianime-rest-servers.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';
import { lookup } from 'dns/promises';
const router = Router();
/** When `?ep=` is a non-numeric embed token, allow HiAnime REST to retry with `?ep=<ep_num>` from the query string. */
function catalogEpisodeFallbackForRest(episodeId, episodeNum) {
    if (episodeNum == null || !Number.isFinite(episodeNum) || episodeNum < 1)
        return undefined;
    if (!episodeId.includes('?ep='))
        return undefined;
    const epSeg = episodeId.split('?ep=')[1]?.split('&')[0]?.split('#')[0] ?? '';
    if (!epSeg || /^\d+$/.test(epSeg))
        return undefined;
    return episodeNum;
}
/** When `REMOTE_PROXY_URL` is unset, chain HLS proxy through the Cloudflare Worker (not Render). */
const DEFAULT_REMOTE_STREAM_PROXY = process.env.DEFAULT_REMOTE_STREAM_PROXY ||
    'https://anifoxwatch-api.anya-bot.workers.dev/api/stream/proxy';
/**
 * AnimeKai (and peers) return a placeholder server named "default". Passing that to
 * /api/stream/watch disables multi-server racing and confuses upstream APIs that expect
 * concrete embed ids (hd-1, hd-2, vidstreaming, …). Treat it as "no preference".
 */
function normalizeStreamServerQuery(raw) {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string')
        return undefined;
    const s = v.trim();
    if (!s || s.toLowerCase() === 'default')
        return undefined;
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
const CDN_CONFIGS = [
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
function getCdnConfigs(hostname) {
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
async function retryProxyRequest(url, configs, maxRetries = 2, rangeHeader) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const config = configs[attempt % configs.length];
        try {
            const headers = {
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
                timeout: 45000,
                maxRedirects: 5
            });
        }
        catch (error) {
            lastError = error;
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
async function isDomainResolvable(hostname) {
    try {
        await lookup(hostname);
        return true;
    }
    catch (error) {
        // DNS errors: ENOTFOUND, EAI_AGAIN, etc.
        if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN' || error.code === 'ENODATA') {
            return false;
        }
        // For other errors, assume it might work
        return true;
    }
}
// Protocol cache to remember domains that failed TLS and need HTTP fallback
const PROTOCOL_CACHE = new Map();
// Domains known to be unreachable locally due to ISP/network blocking.
// These are sent directly to the remote proxy without wasting time on local attempts.
// We keep this EMPTY by default, because users' residential ISPs often do not block these,
// whereas datacenter IPs (the fallback) are heavily anti-bot protected!
const ISP_BLOCKED_DOMAINS = [];
function isIspBlockedDomain(domain) {
    return ISP_BLOCKED_DOMAINS.some(d => domain.includes(d));
}
/**
 * Check if a URL's domain is on the dead domains list
 */
function isDeadDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        return DEAD_DOMAINS.some(dead => hostname.includes(dead));
    }
    catch {
        return false;
    }
}
// Base URL for proxy - used to rewrite stream URLs
const getProxyBaseUrl = (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const protocol = isProduction ? 'https' : req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/api/stream/proxy`;
};
// In-memory stream cache: keeps resolved stream URLs hot between requests within the same
// Vercel function instance. Avoids hitting AnimeKai on every play/resume/tab-switch.
const STREAM_CACHE_TTL = 8 * 60 * 1000; // 8 minutes — matches typical stream token lifetime
const streamCache = new Map();
function streamCacheKey(episodeId, server, category) {
    return `${episodeId}|${server ?? ''}|${category}`;
}
function streamCacheGet(key) {
    const entry = streamCache.get(key);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        streamCache.delete(key);
        return null;
    }
    return entry.data;
}
function streamCacheSet(key, data) {
    // Only cache if we actually got sources — don't cache failures
    if (!data?.sources?.length)
        return;
    streamCache.set(key, { data, expiresAt: Date.now() + STREAM_CACHE_TTL });
    // Evict oldest entries if cache grows large
    if (streamCache.size > 200) {
        const oldest = streamCache.keys().next().value;
        if (oldest)
            streamCache.delete(oldest);
    }
}
/**
 * Strip nested /api/stream/proxy?url=... wrappers so m3u8 rewrites never stack
 * proxy-on-proxy (which caused 502 Bad Gateway and broken HLS).
 */
function unwrapProxyTarget(url) {
    let current = url.trim();
    for (let i = 0; i < 12; i++) {
        const marker = '/api/stream/proxy';
        const mIdx = current.indexOf(marker);
        if (mIdx === -1)
            break;
        const qIdx = current.indexOf('?url=', mIdx);
        if (qIdx === -1)
            break;
        let param = current.slice(qIdx + 5);
        const amp = param.indexOf('&');
        if (amp !== -1)
            param = param.slice(0, amp);
        let decoded;
        try {
            decoded = decodeURIComponent(param);
        }
        catch {
            break;
        }
        if (!decoded || decoded === current)
            break;
        current = decoded;
    }
    return current;
}
/**
 * Convert a raw stream URL to a proxied URL (single layer only)
 */
const proxyUrl = (url, proxyBase, referer) => {
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
const rewriteM3u8Content = (content, originalUrl, proxyBase, referer) => {
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
async function streamToString(stream, maxSize = 5 * 1024 * 1024) {
    const chunks = [];
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
 * @description Quick connectivity check for AnimeKai dependencies (enc-dec.app, animekai.to)
 */
router.get('/diag/animekai', async (_req, res) => {
    const results = {};
    try {
        const r = await fetch('https://enc-dec.app/api/enc-kai?text=hello', { signal: AbortSignal.timeout(5000) });
        results['enc-dec.app/enc-kai'] = { status: r.status, ok: r.ok };
    }
    catch (e) {
        results['enc-dec.app/enc-kai'] = { error: String(e) };
    }
    try {
        const r = await fetch('https://animekai.to/', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000),
        });
        results['animekai.to'] = { status: r.status, ok: r.ok };
    }
    catch (e) {
        results['animekai.to'] = { error: String(e) };
    }
    for (const host of ['megaup.nl', 'megaup.cc', 'megaup.live', 'megaup.to']) {
        try {
            const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
            const r = await fetch(`https://${host}/`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
            results[host] = { status: r.status, ok: r.ok };
        }
        catch (e) {
            results[host] = { error: String(e) };
        }
    }
    // Also test the /media/ endpoint on a known ID
    const testMediaId = '1sj1b3msWS2JcOLyFrlL5xHpCQ';
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
    for (const host of ['megaup.nl', 'megaup.cc', 'megaup.live']) {
        const mediaUrl = `https://${host}/media/${testMediaId}`;
        try {
            const r = await fetch(mediaUrl, {
                headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `https://${host}/e/${testMediaId}` },
                signal: AbortSignal.timeout(5000),
            });
            const txt = await r.text();
            const hasResult = txt.includes('"result"');
            results[`${host}/media/`] = { status: r.status, hasResult };
        }
        catch (e) {
            results[`${host}/media/`] = { error: String(e) };
        }
    }
    res.json(results);
});
/**
 * @description Get available streaming servers for an episode
 */
router.get('/servers/:episodeId', async (req, res) => {
    // Decode the episodeId - Express doesn't automatically decode URL-encoded params
    let episodeId = decodeURIComponent(req.params.episodeId);
    // Render/nginx may decode %3F→? in paths, splitting "anime-slug?ep=3303" into
    // episodeId="anime-slug" and req.query.ep="3303". Reconstruct the full ID.
    if (req.query.ep && !episodeId.includes('?ep=')) {
        const epParam = String(req.query.ep);
        if (!/^\d+$/.test(epParam) && !episodeId.startsWith('animekai-')) {
            const epNum = req.query.ep_num ? String(req.query.ep_num) : '1';
            episodeId = `animekai-${episodeId}$ep=${epNum}$token=${epParam}`;
        }
        else {
            episodeId = `${episodeId}?ep=${epParam}`;
        }
    }
    const requestId = req.id;
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
    }
    catch (error) {
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
router.get('/watch/:episodeId', async (req, res) => {
    // Decode the episodeId - Express doesn't automatically decode URL-encoded params
    let episodeId = decodeURIComponent(req.params.episodeId);
    // Render/nginx may decode %3F→? in paths, splitting "anime-slug?ep=3303" into
    // episodeId="anime-slug" and req.query.ep="3303". Reconstruct the full ID.
    if (req.query.ep && !episodeId.includes('?ep=')) {
        const epParam = String(req.query.ep);
        if (!/^\d+$/.test(epParam) && !episodeId.startsWith('animekai-')) {
            const epNum = req.query.ep_num ? String(req.query.ep_num) : '1';
            episodeId = `animekai-${episodeId}$ep=${epNum}$token=${epParam}`;
        }
        else {
            episodeId = `${episodeId}?ep=${epParam}`;
        }
    }
    // Handle AnimeKai compound IDs that arrived with $ delimiters intact
    if (/^[^$]+\$\d+\$/.test(episodeId) && !episodeId.startsWith('animekai-')) {
        episodeId = `animekai-${episodeId}`;
    }
    const { category, proxy: useProxy = 'true' } = req.query;
    const explicitServer = normalizeStreamServerQuery(req.query.server);
    const epNumRaw = req.query.ep_num;
    const episodeNum = epNumRaw ? parseInt(String(epNumRaw), 10) || undefined : undefined;
    const anilistIdRaw = req.query.anilist_id;
    const anilistId = anilistIdRaw ? parseInt(String(anilistIdRaw), 10) || undefined : undefined;
    const requestId = req.id;
    const shouldProxy = useProxy !== 'false';
    const proxyBase = getProxyBaseUrl(req);
    const triedLabel = explicitServer ?? 'auto';
    const categoryStr = String(category || 'sub');
    const cacheKey = streamCacheKey(episodeId, explicitServer, categoryStr);
    // Serve from cache if available — avoids round-trip to AnimeKai on resume/tab-switch
    const cached = streamCacheGet(cacheKey);
    if (cached) {
        logger.info(`[STREAM] Cache hit for ${episodeId}`, { requestId });
        res.set('Cache-Control', 'private, max-age=300');
        res.set('X-Stream-Cache', 'HIT');
        res.json(cached);
        return;
    }
    logger.info(`[STREAM] Fetching stream for episode: ${episodeId}`, {
        episodeId,
        server: triedLabel,
        category,
        episodeNum,
        shouldProxy,
        requestId
    });
    let streamData = { sources: [], subtitles: [] };
    let lastError = null;
    const preferredSource = explicitServer || req.query.preferred_source || undefined;
    const cat = category || 'sub';
    // All candidates race in parallel; the first to return sources wins and the
    // function resolves immediately without stalling on the slower remaining ones.
    // Previously three sequential fallbacks each burned 12-14 s before AllAnime ran.
    const parallelAttempts = [];
    // AnimeKai compound IDs should not try HiAnime REST — the token is not a HiAnime ep ID.
    const isAnimeKaiId = episodeId.startsWith('animekai-');
    if (!isAnimeKaiId && isHianimeStyleEpisodeId(episodeId)) {
        parallelAttempts.push(tryFetchHianimeRestStreamingData({
            episodeId,
            category: cat,
            explicitServer: preferredSource,
            perAttemptTimeoutMs: 12_000,
            catalogEpisodeFallback: catalogEpisodeFallbackForRest(episodeId, episodeNum),
        }).catch(() => null));
    }
    parallelAttempts.push(sourceManager.getStreamingLinks(episodeId, preferredSource, cat, episodeNum, anilistId)
        .catch(() => null));
    // AllAnime title-based search — runs for any episode with a known number.
    // When anilistId is present it fetches the canonical title; otherwise it derives
    // a search title from the slug (sufficient for most AnimeKai anime).
    if (episodeNum != null && episodeNum >= 1) {
        parallelAttempts.push(sourceManager.tryAllAnimeFallback(episodeId, cat, episodeNum, anilistId).catch(() => null));
    }
    streamData = await new Promise((resolve) => {
        let remaining = parallelAttempts.length;
        if (remaining === 0) {
            resolve({ sources: [], subtitles: [] });
            return;
        }
        let done = false;
        for (const p of parallelAttempts) {
            p.then((result) => {
                if (!done && result?.sources?.length > 0) {
                    done = true;
                    resolve(result);
                    return;
                }
                if (--remaining === 0 && !done)
                    resolve({ sources: [], subtitles: [] });
            }).catch(() => {
                if (--remaining === 0 && !done)
                    resolve({ sources: [], subtitles: [] });
            });
        }
    });
    if (streamData?.sources?.length) {
        logger.info(`[STREAM] Source resolved (${streamData.source || 'unknown'}) for ${episodeId}`, { requestId });
    }
    // Dub unavailable → fall back to sub so the episode plays rather than erroring
    if ((!streamData.sources || streamData.sources.length === 0) && categoryStr === 'dub') {
        try {
            logger.info(`[STREAM] Dub unavailable for ${episodeId}, trying sub fallback`, { requestId });
            const subFallback = await sourceManager.tryAllAnimeFallback(episodeId, 'sub', episodeNum, anilistId);
            if (subFallback?.sources?.length) {
                streamData = subFallback;
                logger.info(`[STREAM] Sub fallback succeeded for ${episodeId} (dub unavailable)`, { requestId });
            }
        }
        catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
        }
    }
    const winningSource = typeof streamData?.source === 'string' ? streamData.source : undefined;
    const successServer = explicitServer || winningSource || triedLabel;
    if (!streamData.sources || streamData.sources.length === 0) {
        logger.error(`[STREAM] No sources found for episode: ${episodeId}`, undefined, {
            episodeId,
            triedServers: triedLabel,
            category: category,
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
        qualities: streamData.sources.map((s) => s.quality).join(', '),
        originalUrls: streamData.sources.map((s) => s.url?.substring(0, 50) + '...'),
        requestId
    });
    // Proxy the stream URLs if requested
    // Clone before mutating — sources may come from a shared in-memory cache object.
    // Mutating in-place would poison the cache with proxy-wrapped URLs on subsequent calls.
    const response = { ...streamData };
    if (shouldProxy) {
        const streamReferer = streamData.headers?.Referer || streamData.headers?.referer || 'https://megacloud.blog/';
        // IP-locked sources (e.g. Streamtape /get_video URLs) cannot be proxied
        // through serverless functions — the CDN token is bound to the server IP.
        // Filter them out so the client never receives unplayable URLs.
        const isIpLockedUrl = (source) => {
            if (source.ipLocked)
                return true;
            const u = (source.originalUrl || source.url || '').toLowerCase();
            return (u.includes('streamtape') || u.includes('tapecontent')) && u.includes('get_video');
        };
        const proxyableSources = streamData.sources.filter((s) => !isIpLockedUrl(s));
        if (proxyableSources.length < streamData.sources.length) {
            logger.info(`[STREAM] Filtered out ${streamData.sources.length - proxyableSources.length} IP-locked source(s) (Streamtape)`, {
                episodeId,
                requestId
            });
        }
        // If ALL sources are IP-locked, try AllAnime as a direct last-resort
        // fallback — it provides fast4speed CDN streams that work from any IP.
        if (proxyableSources.length === 0 && streamData.sources.length > 0) {
            logger.warn(`[STREAM] All ${streamData.sources.length} source(s) are IP-locked — trying AllAnime direct fallback`, {
                episodeId,
                requestId
            });
            try {
                const allAnimeData = await sourceManager.tryAllAnimeFallback(episodeId, category || 'sub', episodeNum, anilistId);
                if (allAnimeData?.sources?.length) {
                    logger.info(`[STREAM] AllAnime fallback succeeded: ${allAnimeData.sources.length} source(s)`, {
                        episodeId,
                        requestId
                    });
                    // Replace streamData entirely with AllAnime's non-IP-locked sources
                    streamData = allAnimeData;
                    // Re-clone and re-run the proxy logic below
                    response.sources = allAnimeData.sources.map((source) => {
                        const rawUrl = source.originalUrl || source.url;
                        return {
                            ...source,
                            url: proxyUrl(rawUrl, proxyBase, allAnimeData.headers?.Referer || streamReferer),
                            originalUrl: rawUrl
                        };
                    });
                    response.subtitles = (allAnimeData.subtitles || []).map((sub) => ({
                        ...sub,
                        url: proxyUrl(sub.url, proxyBase, allAnimeData.headers?.Referer || streamReferer)
                    }));
                    response.server = 'AllAnime';
                    response.triedServers = explicitServer ? [explicitServer] : ['auto'];
                    res.set('Cache-Control', 'private, max-age=300');
                    res.json(response);
                    return;
                }
            }
            catch (e) {
                logger.warn(`[STREAM] AllAnime fallback failed: ${e.message}`, { episodeId, requestId });
            }
            // If AllAnime also failed, return 404
            res.status(404).json({
                error: 'Only IP-locked sources available (Streamtape) — cannot proxy through serverless',
                sources: [],
                subtitles: [],
                ipLockedCount: streamData.sources.length,
            });
            return;
        }
        const sourcesToProcess = proxyableSources;
        // Some kwik hosts work better as direct browser fetches; vault-*.owocdn.top must NOT
        // be direct — browsers often hit ERR_SSL_PROTOCOL_ERROR on raw HTTPS to owocdn.
        // Always proxy owocdn/vault through this API so HLS loads same-origin.
        // NOTE: megaup/rrr domains need a Referer header — must go through proxy.
        const DIRECT_PLAY_DOMAINS = ['kwik.si', 'kwik.cx'];
        const isDirectPlay = (url) => {
            try {
                const h = new URL(url).hostname.toLowerCase();
                return DIRECT_PLAY_DOMAINS.some((d) => h.includes(d));
            }
            catch {
                return false;
            }
        };
        response.sources = sourcesToProcess.map((source) => {
            const rawUrl = source.originalUrl || source.url;
            // Embed sources (e.g. animekai.to/iframe/TOKEN) must not be proxied —
            // they are rendered as iframes in the browser, not fed to the HLS player.
            if (source.isEmbed) {
                return { ...source, isDirect: true, originalUrl: rawUrl };
            }
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
            response.subtitles = streamData.subtitles.map((sub) => ({
                ...sub,
                url: isDirectPlay(sub.url) ? sub.url : proxyUrl(sub.url, proxyBase, streamReferer)
            }));
        }
        logger.info(`[STREAM] Processed ${response.sources.length} sources (direct: ${response.sources.filter((s) => s.isDirect).length})`, {
            episodeId,
            requestId
        });
    }
    // Add server info to response
    response.server = successServer;
    response.triedServers = explicitServer ? [explicitServer] : ['auto'];
    // Store in server-side cache so repeat requests (resume, tab-switch) are instant
    streamCacheSet(cacheKey, response);
    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Stream-Cache', 'MISS');
    res.json(response);
});
/**
 * @route GET /api/stream/proxy
 * @query url - HLS manifest or segment URL to proxy
 * @description Proxy HLS streams and videos to avoid CORS issues and blocked domains. Supports Range requests.
 */
router.get('/proxy', async (req, res) => {
    let url = req.query.url;
    const requestId = req.id;
    const proxyBase = getProxyBaseUrl(req);
    const refererParam = req.query.referer;
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
        const cdnConfig = {
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
        const refererCombos = [];
        if (matchedConfig) {
            // For MegaUp CDNs: try the embed page URL first, then root megaup.nl
            if (isMegaupCdn && refererParam) {
                let paramOrigin;
                try {
                    paramOrigin = new URL(refererParam).origin;
                }
                catch {
                    paramOrigin = 'https://megaup.nl';
                }
                refererCombos.push({ referer: refererParam, origin: paramOrigin });
                refererCombos.push({ referer: 'https://megaup.nl/', origin: 'https://megaup.nl' });
            }
            else {
                refererCombos.push({
                    referer: config.referer,
                    origin: config.origin || config.referer.replace(/\/$/, '')
                });
                if (refererParam && refererParam !== config.referer) {
                    let paramOrigin;
                    try {
                        paramOrigin = new URL(refererParam).origin;
                    }
                    catch {
                        paramOrigin = config.origin || 'https://megacloud.blog';
                    }
                    refererCombos.push({ referer: refererParam, origin: paramOrigin });
                }
            }
        }
        else if (refererParam) {
            let paramOrigin;
            try {
                paramOrigin = new URL(refererParam).origin;
            }
            catch {
                paramOrigin = 'https://megacloud.blog';
            }
            refererCombos.push({ referer: refererParam, origin: paramOrigin });
            refererCombos.push({
                referer: config.referer,
                origin: config.origin || config.referer.replace(/\/$/, '')
            });
        }
        else {
            refererCombos.push({
                referer: config.referer,
                origin: config.origin || config.referer.replace(/\/$/, '')
            });
        }
        if (!refererCombos.some(c => c.referer.includes('aniwatchtv.to'))) {
            refererCombos.push({ referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' });
        }
        if (domain.includes('owocdn')) {
            const extras = [
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
                remoteResp.data.on('error', (err) => {
                    logger.error(`[PROXY] Remote fast-path pipeline error for ${domain}`, err);
                    if (!res.headersSent)
                        res.status(502).end();
                });
                remoteResp.data.pipe(res);
                logger.info(`[PROXY] Remote fast-path success for ${domain}`, { domain, requestId });
                return;
            }
            catch (remoteErr) {
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
        let response = null;
        let lastProxyError = null;
        for (let attempt = 0; attempt < refererCombos.length; attempt++) {
            const combo = refererCombos[attempt];
            const headers = {
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
            const makeProxyRequest = (protocol, relaxedTls) => {
                const targetUrl = protocol === 'http' ? url.replace(/^https:\/\//i, 'http://') : url;
                return axios({
                    method: 'get',
                    url: targetUrl,
                    responseType: 'stream',
                    headers,
                    timeout: 30000,
                    maxRedirects: 5,
                    validateStatus: (status) => status < 400,
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
                }
                else {
                    response = await makeProxyRequest('https', false);
                }
                logger.info(`[PROXY] Success on attempt ${attempt + 1} with referer ${combo.referer}`, { domain, requestId });
                break;
            }
            catch (err) {
                lastProxyError = err;
                const errMsg = err instanceof Error ? err.message : String(err);
                const errCode = err.code;
                const isEconnreset = errCode === 'ECONNRESET' || errMsg.includes('socket hang up') || errCode === 'ECONNREFUSED';
                const isEproto = errMsg.includes('EPROTO') || errCode === 'EPROTO' || isEconnreset;
                const isTlsError = isEproto || errMsg.includes('wrong version number') || errMsg.includes('alert protocol version');
                if (isTlsError && cachedProtocol !== 'http') {
                    logger.warn(`[PROXY] TLS/EPROTO for ${domain} — retrying with relaxed TLS`, { requestId });
                    try {
                        response = await makeProxyRequest('https', true);
                        logger.info(`[PROXY] Relaxed TLS success for ${domain}`, { domain, requestId });
                        break;
                    }
                    catch (tlsErr) {
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
                                    if (typeof httpResp.data?.resume === 'function')
                                        httpResp.data.resume();
                                    logger.warn(`[PROXY] HTTP fallback returned HTML (ISP block?) for ${domain}`, { requestId });
                                }
                                else {
                                    response = httpResp;
                                    PROTOCOL_CACHE.set(domain, 'http');
                                    logger.info(`[PROXY] HTTP fallback success for ${domain}`, { domain, requestId });
                                    break;
                                }
                            }
                            catch (httpErr) {
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
                const remoteResp = await axios({ method: 'get', url: remoteTarget, responseType: 'stream', timeout: 50000, maxRedirects: 5 });
                const ct = remoteResp.headers['content-type'] || 'application/vnd.apple.mpegurl';
                res.setHeader('Content-Type', ct);
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-store');
                res.status(200);
                remoteResp.data.on('error', (err) => {
                    logger.error(`[PROXY] Remote fallback pipeline error for ${domain}`, err);
                    if (!res.headersSent)
                        res.status(502).end();
                });
                remoteResp.data.pipe(res);
                logger.info(`[PROXY] Remote fallback success for ${domain}`, { domain, requestId });
                return;
            }
            catch (remoteErr) {
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
        const isUpstreamM3u8 = upstreamContentType.includes('x-mpegurl') ||
            upstreamContentType.includes('vnd.apple.mpegurl') ||
            url.includes('.m3u8') ||
            (domain.includes('shop21pro.site') && !url.includes('.ts') && !url.includes('.m4s'));
        // Handle M3U8 Manifests (Buffer & Rewrite)
        if (isUpstreamM3u8) {
            try {
                const content = await streamToString(response.data);
                const rewrittenContent = rewriteM3u8Content(content, url, proxyBase, refererParam || refererCombos[0]?.referer);
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
            }
            catch (err) {
                logger.error(`[PROXY] Failed to process m3u8 from ${domain}`, err);
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
        if (response.headers['content-range'])
            res.set('Content-Range', response.headers['content-range']);
        if (response.headers['accept-ranges']) {
            res.set('Accept-Ranges', response.headers['accept-ranges']);
        }
        else if (upstreamContentType.startsWith('video/') ||
            upstreamContentType === 'application/octet-stream' ||
            url.endsWith('.mp4') || url.endsWith('.ts') || url.endsWith('.m4s') ||
            domain.includes('streamtape') || domain.includes('tapecontent')) {
            // Force Accept-Ranges for video responses so the browser uses range requests
            // (required for Chrome to seek moov atom without buffering the full file).
            res.set('Accept-Ranges', 'bytes');
        }
        // Set Content-Type — override application/octet-stream for known video CDNs
        const isOctetStream = upstreamContentType === 'application/octet-stream' || upstreamContentType === '';
        const isKnownVideoCdn = domain.includes('fast4speed') || domain.includes('hstorage');
        if (isOctetStream && isKnownVideoCdn) {
            res.set('Content-Type', 'video/mp4');
        }
        else if (upstreamContentType) {
            res.set('Content-Type', upstreamContentType);
        }
        else if (url.includes('.ts')) {
            res.set('Content-Type', 'video/MP2T');
        }
        else if (url.endsWith('.mp4')) {
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
        }
        else {
            res.set('Cache-Control', 'public, max-age=3600');
        }
        // Set status code (200 or 206)
        res.status(response.status);
        // Pipe the stream
        response.data.pipe(res);
        // Handle errors during streaming
        response.data.on('error', (err) => {
            logger.error(`[PROXY] Stream error from ${domain}`, err);
            if (!res.headersSent) {
                res.status(502).json({ error: 'Stream error' });
            }
            else {
                res.end();
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errCode = error.code;
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
router.options('/proxy', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Range, Origin, Accept');
    res.set('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
});
export default router;
//# sourceMappingURL=streaming.js.map