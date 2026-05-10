import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';
import { tryFetchHianimeRestStreamingData } from '../services/hianime-rest-fallback.js';
import { isHianimeStyleEpisodeId } from '../utils/hianime-rest-servers.js';
import { logger } from '../utils/logger.js';
import axios, { type AxiosResponse } from 'axios';
import https from 'node:https';
import { lookup } from 'dns/promises';
import type { StreamingData, VideoSource, VideoSubtitle } from '../types/streaming.js';

const router = Router();

// ---------------------------------------------------------------------------
// Constants & environment
// ---------------------------------------------------------------------------

const DEFAULT_REMOTE_STREAM_PROXY =
    process.env.DEFAULT_REMOTE_STREAM_PROXY ||
    'https://anifoxwatch.vercel.app/api/stream/proxy';

/** How long to wait for a dub result before accepting a sub fallback (ms). */
const DUB_PATIENCE_MS = 18_000;

/** Global per-request timeout safety net (ms). */
const GLOBAL_TIMEOUT_MS = 25_000;

// ---------------------------------------------------------------------------
// Helpers — episode ID normalisation
// ---------------------------------------------------------------------------

/**
 * When `?ep=` is a non-numeric embed token, allow HiAnime REST to retry with
 * the numeric episode number from the query string.
 */
function catalogEpisodeFallbackForRest(
    episodeId: string,
    episodeNum?: number,
): number | undefined {
    if (episodeNum == null || !Number.isFinite(episodeNum) || episodeNum < 1) return undefined;
    if (!episodeId.includes('?ep=')) return undefined;
    const epSeg = episodeId.split('?ep=')[1]?.split('&')[0]?.split('#')[0] ?? '';
    // Only apply the fallback when the token is non-numeric
    if (!epSeg || /^\d+$/.test(epSeg)) return undefined;
    return episodeNum;
}

/**
 * AnimeKai (and peers) sometimes return a placeholder server named "default".
 * Treat it as "no preference" so multi-server racing works normally.
 */
function normalizeStreamServerQuery(raw: unknown): string | undefined {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (!s || s.toLowerCase() === 'default') return undefined;
    return s;
}

/**
 * Strip nested /api/stream/proxy?url=… wrappers so m3u8 rewrites never stack
 * proxy-on-proxy (which caused 502 Bad Gateway and broken HLS).
 */
function unwrapProxyTarget(url: string): string {
    let current = url.trim();
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
        if (seen.has(current)) break; // circular reference guard
        seen.add(current);
        const mIdx = current.indexOf('/api/stream/proxy');
        if (mIdx === -1) break;
        const qIdx = current.indexOf('?url=', mIdx);
        if (qIdx === -1) break;
        let param = current.slice(qIdx + 5);
        const amp = param.indexOf('&');
        if (amp !== -1) param = param.slice(0, amp);
        let decoded: string;
        try { decoded = decodeURIComponent(param); } catch { break; }
        if (!decoded || decoded === current) break;
        current = decoded;
    }
    return current;
}

// ---------------------------------------------------------------------------
// Helpers — domain filtering
// ---------------------------------------------------------------------------

const DEAD_DOMAINS = new Set([
    'streamable.cloud',
    'streamable.video',
    'streamable.host',
    'dead-cdn.example',
    'ajax.gogocdn.net',
    'anitaku.pe',
    'anitaku.so',
    'anix.to',
    'animesuge.to',
]);

/**
 * Known ad / tracking CDN domains. HLS segments from these hosts are
 * ad blobs (images, tracking pixels) disguised as video — they cause
 * `fragParsingError` because they aren't valid MPEG-TS / fMP4.
 */
const AD_CDN_DOMAINS = [
    'ibyteimg.com',       // ByteDance / TikTok ad CDN
    'ad-site-i18n',       // ByteDance ad path component
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adsrvr.org',
    'adnxs.com',
    'moatads.com',
    'serving-sys.com',
];

function isAdCdnUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return AD_CDN_DOMAINS.some(d => lower.includes(d));
}

/** Content-types that are definitely NOT valid video segment data. */
const NON_VIDEO_CONTENT_TYPES = [
    'text/html',
    'text/xml',
    'application/json',
    'text/javascript',
    'application/javascript',
];

/** Content-types used for obfuscated video segments. */
const IMAGE_CONTENT_TYPES = [
    'image/gif',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg',
];

/** Domains to skip DNS/local checks and forward straight to the remote proxy. */
const ISP_BLOCKED_DOMAINS = new Set([
    'ajax.gogocdn.net',
    'anitaku.pe',
    'anitaku.so',
]);

function isDeadDomain(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return [...DEAD_DOMAINS].some(d => hostname.includes(d));
    } catch { return false; }
}

function isIspBlockedDomain(domain: string): boolean {
    return [...ISP_BLOCKED_DOMAINS].some(d => domain.includes(d));
}

// ---------------------------------------------------------------------------
// CDN referer configs with multi-config fallback support
// ---------------------------------------------------------------------------

type CdnCombo = { referer: string; origin?: string; userAgent?: string };

const CDN_CONFIGS: Array<{ pattern: RegExp; configs: CdnCombo[] }> = [
    { pattern: /fast4speed|allanime/i, configs: [{ referer: 'https://allanime.day/', origin: 'https://allanime.day' }] },
    { pattern: /rapid-cloud\.co/i, configs: [{ referer: 'https://rapid-cloud.co/', origin: 'https://rapid-cloud.co' }, { referer: 'https://9anime.lu/', origin: 'https://9anime.lu' }] },
    { pattern: /megacloud/i, configs: [{ referer: 'https://megacloud.blog/', origin: 'https://megacloud.blog' }, { referer: 'https://aniwave.to/', origin: 'https://aniwave.to' }] },
    { pattern: /vidcloud/i, configs: [{ referer: 'https://vidcloud9.com/', origin: 'https://vidcloud9.com' }, { referer: 'https://vidstreaming.io/', origin: 'https://vidstreaming.io' }] },
    { pattern: /gogocdn/i, configs: [{ referer: 'https://gogoanime.run/', origin: 'https://gogoanime.run' }, { referer: 'https://gogoanime.ai/', origin: 'https://gogoanime.ai' }] },
    { pattern: /aniwatchtv|megacloud|rapid-cloud/i, configs: [{ referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' }] },
    { pattern: /watchhentai/i, configs: [{ referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' }, { referer: 'https://hentai19.net/', origin: 'https://hentai19.net' }] },
    { pattern: /megaup|tech20hub|lab27core|code29wave|net22lab|pro25zone/i, configs: [{ referer: 'https://megaup.nl/', origin: 'https://megaup.nl' }, { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' }] },
];

function getCdnConfigs(hostname: string): CdnCombo[] {
    for (const { pattern, configs } of CDN_CONFIGS) {
        if (pattern.test(hostname)) return configs;
    }
    return [
        { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' },
        { referer: 'https://9anime.lu/', origin: 'https://9anime.lu' },
    ];
}

// ---------------------------------------------------------------------------
// DNS resolution cache & protocol cache
// ---------------------------------------------------------------------------

interface DnsCacheEntry { resolvable: boolean; checkedAt: number }
const DNS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const dnsCache = new Map<string, DnsCacheEntry>();

async function isDomainResolvable(hostname: string): Promise<boolean> {
    const cached = dnsCache.get(hostname);
    if (cached && Date.now() - cached.checkedAt < DNS_CACHE_TTL) return cached.resolvable;
    try {
        await lookup(hostname);
        dnsCache.set(hostname, { resolvable: true, checkedAt: Date.now() });
        return true;
    } catch (error: any) {
        const unresolvable = ['ENOTFOUND', 'EAI_AGAIN', 'ENODATA'].includes(error.code);
        dnsCache.set(hostname, { resolvable: !unresolvable, checkedAt: Date.now() });
        return !unresolvable;
    }
}

/** Remembers domains that failed TLS so we can skip straight to HTTP fallback. */
const PROTOCOL_CACHE_MAX = 500;
const PROTOCOL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
interface ProtocolEntry { protocol: 'http' | 'https'; setAt: number }
const protocolCache = new Map<string, ProtocolEntry>();

function getProtocolCache(domain: string): 'http' | 'https' | undefined {
    const entry = protocolCache.get(domain);
    if (!entry) return undefined;
    if (Date.now() - entry.setAt > PROTOCOL_CACHE_TTL) { protocolCache.delete(domain); return undefined; }
    return entry.protocol;
}

function setProtocolCache(domain: string, protocol: 'http' | 'https'): void {
    if (protocolCache.size >= PROTOCOL_CACHE_MAX) {
        // Evict oldest entry
        const oldestKey = protocolCache.keys().next().value;
        if (oldestKey) protocolCache.delete(oldestKey);
    }
    protocolCache.set(domain, { protocol, setAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Segment cache (in-memory LRU)
// ---------------------------------------------------------------------------

const SEGMENT_CACHE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const SEGMENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface SegmentCacheEntry { data: Buffer; contentType: string; fetchedAt: number; size: number; lastUsed: number }
const segmentCache = new Map<string, SegmentCacheEntry>();
let segmentCacheBytes = 0;

function segmentCacheEvict(): void {
    // True LRU: sort by lastUsed ascending and evict until under budget
    const entries = [...segmentCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, entry] of entries) {
        if (segmentCacheBytes <= SEGMENT_CACHE_MAX_BYTES) break;
        segmentCacheBytes -= entry.size;
        segmentCache.delete(key);
    }
}

function segmentCacheGet(url: string): Buffer | null {
    const entry = segmentCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > SEGMENT_CACHE_TTL) {
        segmentCacheBytes -= entry.size;
        segmentCache.delete(url);
        return null;
    }
    entry.lastUsed = Date.now(); // update LRU timestamp
    return entry.data;
}

function segmentCacheSet(url: string, data: Buffer, contentType: string): void {
    if (data.length > SEGMENT_CACHE_MAX_BYTES / 10) return; // Skip segments > 10% of budget
    const existing = segmentCache.get(url);
    if (existing) segmentCacheBytes -= existing.size;
    segmentCache.set(url, { data, contentType, fetchedAt: Date.now(), lastUsed: Date.now(), size: data.length });
    segmentCacheBytes += data.length;
    segmentCacheEvict();
}

// ---------------------------------------------------------------------------
// Stream result cache
// ---------------------------------------------------------------------------

const STREAM_CACHE_TTL = 8 * 60 * 1000; // 8 minutes
const STREAM_CACHE_MAX = 200;

interface StreamCacheEntry { data: any; expiresAt: number }
const streamCache = new Map<string, StreamCacheEntry>();

function streamCacheKey(episodeId: string, server: string | undefined, category: string): string {
    return `${episodeId}|${server ?? ''}|${category}`;
}

function streamCacheGet(key: string): any | null {
    const entry = streamCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { streamCache.delete(key); return null; }
    return entry.data;
}

function streamCacheSet(key: string, data: any): void {
    if (!data?.sources?.length) return; // Don't cache failures
    if (streamCache.size >= STREAM_CACHE_MAX) {
        // Evict all expired entries first; if still full, evict oldest
        for (const [k, v] of streamCache) {
            if (Date.now() > v.expiresAt) streamCache.delete(k);
        }
        if (streamCache.size >= STREAM_CACHE_MAX) {
            const oldest = streamCache.keys().next().value;
            if (oldest) streamCache.delete(oldest);
        }
    }
    streamCache.set(key, { data, expiresAt: Date.now() + STREAM_CACHE_TTL });
}

// ---------------------------------------------------------------------------
// Dub validation
// ---------------------------------------------------------------------------

/**
 * Returns true if a streaming result should be treated as a real dub stream.
 *
 * FIX: The original checked `result.category === 'dub'` at the end, which
 * would reject results that simply have no category set (some sources omit it).
 * Now we only hard-reject when there's explicit evidence it is *not* a dub.
 */
function validateDubStream(result: any): boolean {
    if (!result?.sources?.length) return false;

    // Explicitly tagged as sub — reject
    if (result.category === 'sub') return false;

    // Spanish source — reject regardless of category label
    const sourceName = String(result.source ?? '').toLowerCase();
    if (sourceName.includes('animeflv')) return false;

    // Accept if explicitly tagged dub, or if category is absent/unknown
    // (let the stream itself prove whether it's dubbed)
    return result.category === 'dub' || result.category == null || result.category === '';
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

const getProxyBaseUrl = (req: Request): string => {
    const forwarded = req.get('x-forwarded-proto');
    const host = req.get('host') || 'localhost:3001';
    const protocol = forwarded || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    return `${protocol}://${host}/api/stream/proxy`;
};

const proxyUrl = (url: string, proxyBase: string, referer?: string): string => {
    const target = unwrapProxyTarget(url);
    let out = `${proxyBase}?url=${encodeURIComponent(target)}`;
    if (referer) out += `&referer=${encodeURIComponent(referer)}`;
    return out;
};

/** Domains where direct browser fetch works fine — skip the proxy. */
const DIRECT_PLAY_DOMAINS = ['kwik.si', 'kwik.cx'];
function isDirectPlay(url: string): boolean {
    try { return DIRECT_PLAY_DOMAINS.some(d => new URL(url).hostname.includes(d)); }
    catch { return false; }
}

/**
 * Rewrite an m3u8 manifest so every segment URL is routed through the proxy.
 */
const rewriteM3u8Content = (
    content: string,
    originalUrl: string,
    proxyBase: string,
    referer?: string,
): string => {
    const urlNoQuery = originalUrl.split('?')[0].split('#')[0];
    const baseUrl = urlNoQuery.substring(0, urlNoQuery.lastIndexOf('/') + 1);

    return content.split('\n').map(line => {
        const t = line.trim();
        if (t.startsWith('#') && t.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
                const abs = uri.startsWith('http') ? uri : `${baseUrl}${uri}`;
                return `URI="${proxyUrl(abs, proxyBase, referer)}"`;
            });
        }
        if (!t || t.startsWith('#')) return line;
        const abs = t.startsWith('http') ? t : `${baseUrl}${t}`;
        return proxyUrl(abs, proxyBase, referer);
    }).join('\n');
};

/**
 * Validate an m3u8 manifest: reject playlists whose segments point to
 * known ad CDNs (e.g. ibyteimg.com). Returns `true` when the manifest
 * is poisoned and should be rejected.
 */
function isAdPoisonedManifest(content: string, originalUrl: string): boolean {
    const urlNoQuery = originalUrl.split('?')[0].split('#')[0];
    const baseUrl = urlNoQuery.substring(0, urlNoQuery.lastIndexOf('/') + 1);

    const segmentUrls: string[] = [];
    for (const line of content.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const abs = t.startsWith('http') ? t : `${baseUrl}${t}`;
        segmentUrls.push(abs);
    }

    if (segmentUrls.length === 0) return false;
    
    // Exception: Megaup use .jpg/.png/.gif for real video segments to bypass blocks
    const domain = new URL(originalUrl).hostname.toLowerCase();
    const isMegaup = domain.includes('megaup.') || 
                     /(web24code|lab27core|code29wave|net22lab|pro25zone|tech20hub|hub26link|hub27link|shop21pro|burntburst45)\.(site|store)/i.test(domain);
    if (isMegaup) return false;

    // Use common ad extensions for segment-level detection
    // Use common non-video extensions for segment-level detection
    const AD_EXTENSIONS = /\.(png|gif|svg|jpg|jpeg|webp|html|js|css|json|xml|txt|vtt|srt|woff|woff2|ttf|otf)$/i;

    // A manifest is poisoned if it has a high ratio of ad-domain segments
    // OR if it contains segments with image extensions on unknown domains.
    const adCount = segmentUrls.filter(u => {
        if (isAdCdnUrl(u)) return true;
        if (AD_EXTENSIONS.test(u)) return true;
        return false;
    }).length;

    const ratio = adCount / segmentUrls.length;
    const firstFewPoisoned = segmentUrls.slice(0, 3).some(u => isAdCdnUrl(u) || AD_EXTENSIONS.test(u));

    if (ratio > 0.05 || firstFewPoisoned) {
        logger.warn(`[PROXY] Ad-poisoned manifest detected: ${adCount}/${segmentUrls.length} segments (${(ratio * 100).toFixed(1)}%) or first segments poisoned`, { originalUrl });
        return true;
    }
    return false;
}

async function streamToString(stream: any, maxSize = 5 * 1024 * 1024): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > maxSize) throw new Error(`Stream exceeded max size (${maxSize} bytes) for M3U8 manifest`);
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
}

// ---------------------------------------------------------------------------
// Remote proxy helper (shared between /watch and /proxy)
// ---------------------------------------------------------------------------

async function forwardToRemoteProxy(
    res: Response,
    url: string,
    refererParam: string | undefined,
    domain: string,
    requestId: string | undefined,
    label: string,
): Promise<boolean> {
    const remoteProxy = process.env.REMOTE_PROXY_URL || DEFAULT_REMOTE_STREAM_PROXY;
    const remoteTarget = `${remoteProxy}?url=${encodeURIComponent(url)}${refererParam ? `&referer=${encodeURIComponent(refererParam)}` : ''}`;
    try {
        const remoteResp = await axios({ method: 'get', url: remoteTarget, responseType: 'stream', timeout: 50_000, maxRedirects: 5 });
        const ct = remoteResp.headers['content-type'] || 'application/vnd.apple.mpegurl';
        res.setHeader('Content-Type', ct);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');

        // Forward seeking/duration headers
        if (remoteResp.headers['accept-ranges']) res.setHeader('Accept-Ranges', remoteResp.headers['accept-ranges']);
        if (remoteResp.headers['content-length']) res.setHeader('Content-Length', remoteResp.headers['content-length']);
        if (remoteResp.headers['content-range']) res.setHeader('Content-Range', remoteResp.headers['content-range']);
        if (remoteResp.headers['access-control-expose-headers']) {
            res.setHeader('Access-Control-Expose-Headers', remoteResp.headers['access-control-expose-headers']);
        } else {
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
        }
        res.status(remoteResp.status);
        remoteResp.data.on('error', (err: any) => {
            logger.error(`[PROXY] ${label} pipeline error for ${domain}`, err);
            if (!res.headersSent) res.status(502).end();
        });
        remoteResp.data.pipe(res);
        logger.info(`[PROXY] ${label} success for ${domain}`, { domain, requestId });
        return true;
    } catch (err: unknown) {
        logger.warn(`[PROXY] ${label} failed for ${domain}: ${err instanceof Error ? err.message : String(err)}`, { requestId });
        return false;
    }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Reconstruct a full episode ID from a split path + query (Render/nginx decode).
 */
function reconstructEpisodeId(episodeId: string, query: Record<string, any>): string {
    if (!query.ep || episodeId.includes('?ep=')) return episodeId;
    // Do not corrupt fully-formed AnimeKai IDs with a stray ?ep=
    if (episodeId.includes('$ep=') && episodeId.includes('$token=')) return episodeId;
    
    const epParam = String(query.ep);
    if (!/^\d+$/.test(epParam) && !episodeId.startsWith('animekai-')) {
        const epNum = query.ep_num ? String(query.ep_num) : '1';
        return `animekai-${episodeId}$ep=${epNum}$token=${epParam}`;
    }
    return `${episodeId}?ep=${epParam}`;
}

/**
 * @route GET /api/stream/diag/animekai
 * @description Quick connectivity check for AnimeKai dependencies.
 */
router.get('/diag/animekai', async (_req: Request, res: Response): Promise<void> => {
    const results: Record<string, unknown> = {};
    const check = async (label: string, url: string, extraHeaders?: Record<string, string>) => {
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...extraHeaders }, signal: AbortSignal.timeout(5000) });
            results[label] = { status: r.status, ok: r.ok };
        } catch (e: unknown) { results[label] = { error: String(e) }; }
    };

    await check('enc-dec.app/enc-kai', 'https://enc-dec.app/api/enc-kai?text=hello');
    await check('animekai.to', 'https://animekai.to/');

    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    for (const host of ['megaup.nl', 'megaup.cc', 'megaup.live', 'megaup.to']) {
        await check(host, `https://${host}/`, { 'User-Agent': UA });
    }

    const testMediaId = '1sj1b3msWS2JcOLyFrlL5xHpCQ';
    for (const host of ['megaup.nl', 'megaup.cc', 'megaup.live']) {
        const mediaUrl = `https://${host}/media/${testMediaId}`;
        try {
            const r = await fetch(mediaUrl, {
                headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `https://${host}/e/${testMediaId}` },
                signal: AbortSignal.timeout(5000),
            });
            const txt = await r.text();
            results[`${host}/media/`] = { status: r.status, hasResult: txt.includes('"result"') };
        } catch (e: unknown) { results[`${host}/media/`] = { error: String(e) }; }
    }

    res.json(results);
});

/**
 * @route GET /api/stream/servers/:episodeId
 * @description Get available streaming servers for an episode.
 */
router.get('/servers/:episodeId', async (req: Request, res: Response): Promise<void> => {
    let episodeId = decodeURIComponent(req.params.episodeId as string);
    episodeId = reconstructEpisodeId(episodeId, req.query);

    const requestId = (req as any).id;
    logger.info(`[STREAM] Getting servers for episode: ${episodeId}`, { episodeId, requestId });

    try {
        const servers = await sourceManager.getEpisodeServers(episodeId);
        logger.info(`[STREAM] Found ${servers.length} servers`, {
            episodeId,
            servers: servers.map((s: any) => `${s.name}(${s.type})`).join(', '),
            requestId,
        });
        res.json({ servers });
    } catch (error: any) {
        logger.error(`[STREAM] Failed to get servers for ${episodeId}`, error, { episodeId, requestId });
        res.status(500).json({ error: 'Failed to get servers', message: error.message });
    }
});

/**
 * @route GET /api/stream/watch/:episodeId
 * @description Get streaming URLs for an episode. Races multiple sources in
 *   parallel and returns the best available result.
 */
router.get('/watch/:episodeId', async (req: Request, res: Response): Promise<void> => {
    let episodeId = decodeURIComponent(req.params.episodeId as string);
    episodeId = reconstructEpisodeId(episodeId, req.query);

    // Compound AnimeKai IDs that arrive with $ delimiters intact
    if (/^[^$]+\$/.test(episodeId) && !episodeId.startsWith('animekai-')) {
        episodeId = `animekai-${episodeId}`;
    }

    const { category, proxy: useProxy = 'true' } = req.query;
    const explicitServer = normalizeStreamServerQuery(req.query.server);
    const episodeNum = req.query.ep_num ? parseInt(String(req.query.ep_num), 10) || undefined : undefined;
    const anilistId = req.query.anilist_id ? parseInt(String(req.query.anilist_id), 10) || undefined : undefined;
    const requestId = (req as any).id;
    const shouldProxy = useProxy !== 'false';
    const proxyBase = getProxyBaseUrl(req);
    const categoryStr = String(category || 'sub');
    const isDubRequested = categoryStr === 'dub';
    const cat = isDubRequested ? 'dub' : 'sub';

    const cacheKey = streamCacheKey(episodeId, explicitServer, categoryStr);
    const cached = streamCacheGet(cacheKey);
    if (cached) {
        logger.info(`[STREAM] Cache hit for ${episodeId}`, { requestId });
        res.set('Cache-Control', 'private, max-age=300');
        res.set('X-Stream-Cache', 'HIT');
        res.json(cached);
        return;
    }

    logger.info(`[STREAM] Fetching stream for episode: ${episodeId}`, {
        episodeId, server: explicitServer ?? 'auto', category: categoryStr, episodeNum, shouldProxy, requestId,
    });

    // Strip provider prefix for REST/AllAnime fallbacks
    const episodeIdForRest = episodeId.replace(/^animekai-/i, '');
    const preferredSource = explicitServer || (req.query.preferred_source as string) || undefined;

    const buildAttempts = (targetCategory: 'sub' | 'dub'): Promise<any>[] => {
        const attempts: Promise<any>[] = [];

        if (isHianimeStyleEpisodeId(episodeIdForRest)) {
            attempts.push(
                tryFetchHianimeRestStreamingData({
                    episodeId: episodeIdForRest,
                    category: targetCategory,
                    explicitServer: preferredSource,
                    perAttemptTimeoutMs: 15_000,
                    catalogEpisodeFallback: catalogEpisodeFallbackForRest(episodeId, episodeNum),
                }).then(r => r?.sources?.length ? { ...r, _category: targetCategory } : null).catch(() => null),
            );
        }

        attempts.push(
            sourceManager.getStreamingLinks(episodeId, preferredSource, targetCategory, episodeNum, anilistId)
                .then(r => r?.sources?.length ? { ...r, _category: targetCategory } : null)
                .catch(() => null),
        );

        if (episodeNum != null && episodeNum >= 1) {
            attempts.push(
                sourceManager.tryAllAnimeFallback(episodeIdForRest, targetCategory, episodeNum, anilistId)
                    .then(r => r?.sources?.length ? { ...r, _category: targetCategory } : null)
                    .catch(() => null),
            );
            attempts.push(
                sourceManager.crossSourceStreamingFallback(episodeId, preferredSource, targetCategory, episodeNum, anilistId)
                    .then(r => r?.sources?.length ? { ...r, _category: targetCategory } : null)
                    .catch(() => null),
            );
            
            // For dub requests, also try cross-source fallback to sub in parallel
            if (targetCategory === 'dub') {
                attempts.push(
                    sourceManager.crossSourceStreamingFallback(episodeId, preferredSource, 'sub', episodeNum, anilistId)
                        .then(r => r?.sources?.length ? { ...r, _category: 'sub', isDubFallback: true } : null)
                        .catch(() => null),
                );
            }
        }
        return attempts;
    };

    const dubAttempts = buildAttempts(cat);
    const subAttempts = isDubRequested ? buildAttempts('sub') : [];

    // ---------------------------------------------------------------------------
    // Race all attempts. Prefer dub; fall back to sub only when sub was requested
    // implicitly (not by explicit user click).
    // FIX: The original patienceExpired check used `!dubPatienceTimer` which was
    // unreliable — the timer variable was captured by closure and could be null
    // both before it fired AND after. We now use a dedicated boolean flag instead.
    // ---------------------------------------------------------------------------
    let streamData: any = { sources: [], subtitles: [] };
    let lastError: string | null = null;

    streamData = await new Promise<any>((resolve) => {
        let remainingDub = dubAttempts.length;
        let remainingSub = subAttempts.length;
        let resolved = false;
        const dubResults: any[] = [];
        const subResults: any[] = [];
        let dubPatienceExpired = false;
        let timerHandle: ReturnType<typeof setTimeout> | null = null;

        const tryResolve = () => {
            if (resolved) return;

            if (dubResults.length > 0) {
                resolved = true;
                if (timerHandle) clearTimeout(timerHandle);
                logger.info(`[STREAM] Dub source found for ${episodeId}`, { requestId });
                resolve(dubResults[0]);
                return;
            }

            const dubDone = remainingDub === 0;

            // Sub fallback - allow for both auto-mode and explicit dub requests (from parallel cross-source fallback)
            if ((dubDone || dubPatienceExpired) && subResults.length > 0) {
                resolved = true;
                if (timerHandle) clearTimeout(timerHandle);
                const fallbackResult = subResults[0];
                if (isDubRequested) {
                    logger.info(`[STREAM] Parallel sub fallback used for dub request ${episodeId}`, { requestId });
                } else {
                    logger.info(`[STREAM] Sub fallback used for ${episodeId}`, { requestId });
                }
                resolve({ ...fallbackResult, category: 'sub', dubFallback: true });
                return;
            }

            // Explicit dub request with no dub found and no sub fallback — return empty so UI can show "no dub"
            if ((dubDone || dubPatienceExpired) && isDubRequested && subResults.length === 0) {
                resolved = true;
                if (timerHandle) clearTimeout(timerHandle);
                logger.info(`[STREAM] No dub sources found for ${episodeId}`, { requestId });
                resolve({ sources: [], subtitles: [], category: 'dub', dubUnavailable: true });
                return;
            }

            // All attempts exhausted
            if (dubDone && remainingSub === 0) {
                resolved = true;
                if (timerHandle) clearTimeout(timerHandle);
                resolve({ sources: [], subtitles: [] });
            }
        };

        for (const p of dubAttempts) {
            p.then((result: any) => {
                remainingDub--;
                if (result?.sources?.length > 0) {
                    // Handle cross-source dub fallback results (marked as sub)
                    if (result.isDubFallback) {
                        subResults.push(result);
                    } else if (isDubRequested) {
                        if (validateDubStream(result)) {
                            dubResults.push(result);
                        } else {
                            logger.info(`[STREAM] Filtered non-dub result from ${result.source ?? 'unknown'}`, { requestId });
                        }
                    } else {
                        dubResults.push(result);
                    }
                }
                tryResolve();
            }).catch(() => { remainingDub--; tryResolve(); });
        }

        if (isDubRequested) {
            for (const p of subAttempts) {
                p.then((result: any) => {
                    remainingSub--;
                    if (result?.sources?.length > 0) subResults.push(result);
                    tryResolve();
                }).catch(() => { remainingSub--; tryResolve(); });
            }

            timerHandle = setTimeout(() => {
                logger.info(`[STREAM] Dub patience (${DUB_PATIENCE_MS}ms) expired for ${episodeId}`, { requestId });
                dubPatienceExpired = true;
                timerHandle = null;
                tryResolve();
            }, DUB_PATIENCE_MS);
        }

        // Global safety net
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                if (timerHandle) clearTimeout(timerHandle);
                if (dubResults.length > 0) resolve(dubResults[0]);
                else if (subResults.length > 0) resolve({ ...subResults[0], category: 'sub', dubFallback: true });
                else resolve({ sources: [], subtitles: [] });
            }
        }, 25_000);
    });

    if (streamData?.sources?.length) {
        logger.info(`[STREAM] Source resolved (${streamData.source ?? 'unknown'}, cat=${streamData.category ?? cat}) for ${episodeId}`, { requestId });
    }

    // Legacy sequential sub fallback — rarely needed now but kept for safety
    if (!streamData.sources?.length && isDubRequested) {
        try {
            logger.info(`[STREAM] Final sequential sub fallback for ${episodeId}`, { requestId });
            const subFallback = await sourceManager.getStreamingLinks(episodeId, preferredSource, 'sub', episodeNum, anilistId);
            if (subFallback?.sources?.length) {
                streamData = { ...subFallback, category: 'sub', dubFallback: true };
                logger.info(`[STREAM] Sequential sub fallback succeeded for ${episodeId}`, { requestId });
            }
        } catch (e: unknown) {
            lastError = e instanceof Error ? e.message : String(e);
        }
    }

    const winningSource = typeof streamData?.source === 'string' ? streamData.source : undefined;
    const successServer = explicitServer || winningSource || 'auto';

    if (!streamData.sources?.length) {
        logger.error(`[STREAM] No sources found for ${episodeId}`, undefined, {
            episodeId, triedServers: explicitServer ?? 'auto', category: categoryStr, lastError, requestId,
        });
        res.status(404).json({
            error: 'No streaming sources found',
            episodeId,
            triedServers: explicitServer ? [explicitServer] : ['auto'],
            lastError,
            suggestion: 'All streaming sources failed. Please try again later.',
        });
        return;
    }

    logger.info(`[STREAM] Found ${streamData.sources.length} sources (${successServer})`, {
        episodeId, server: successServer,
        qualities: streamData.sources.map((s: any) => s.quality).join(', '),
        requestId,
    });

    // Clone before mutating — the object may come from a shared cache reference
    const response: StreamingData & { server?: string; triedServers?: string[]; audioLanguage?: string } = {
        ...streamData,
        audioLanguage: isDubRequested ? 'en' : 'ja',
    };

    if (shouldProxy) {
        // Determine best referer: source-provided > domain-guessed > default
        let streamReferer = streamData.headers?.Referer || streamData.headers?.referer;
        if (!streamReferer) {
            const sourceName = String(streamData.source || '').toLowerCase();
            if (sourceName.includes('kai')) streamReferer = 'https://megaup.nl/';
            else if (sourceName.includes('gogo')) streamReferer = 'https://gogoanime.run/';
            else if (sourceName.includes('pahe')) streamReferer = 'https://animepahe.ru/';
            else if (sourceName.includes('watchhentai')) streamReferer = 'https://watchhentai.net/';
            else streamReferer = 'https://megacloud.blog/'; // Generic fallback
        }
        const isLocalDev = !req.get('x-forwarded-proto');

        response.sources = (streamData.sources as VideoSource[])
            .map((source): VideoSource | null => {
                const rawUrl = source.originalUrl || source.url;

                if (source.isEmbed) {
                    if (isLocalDev && rawUrl.includes('anikai.to/iframe')) {
                        logger.warn(`[STREAM] Dev: skipping AnimeKai iframe`, { episodeId, requestId });
                        return null;
                    }
                    return { ...source, isDirect: true, originalUrl: rawUrl };
                }

                if (isDirectPlay(rawUrl)) {
                    return { ...source, isDirect: true, originalUrl: rawUrl };
                }

                // FIX: Wrapped in try/catch — new URL() throws on empty/invalid strings
                let hostname = '';
                try { hostname = new URL(rawUrl).hostname; } catch { return null; }


                return { ...source, url: proxyUrl(rawUrl, proxyBase, streamReferer), originalUrl: rawUrl };
            })
            .filter((s): s is VideoSource => s !== null);

        if (streamData.subtitles) {
            response.subtitles = (streamData.subtitles as VideoSubtitle[])
                .map((sub): VideoSubtitle => {
                    if (isDirectPlay(sub.url)) return sub;
                    return { ...sub, url: proxyUrl(sub.url, proxyBase, streamReferer) };
                });
        }

        logger.info(`[STREAM] Proxied ${response.sources.length} sources (direct: ${response.sources.filter(s => s.isDirect).length})`, { episodeId, requestId });
    }

    response.server = successServer;
    response.triedServers = explicitServer ? [explicitServer] : ['auto'];

    streamCacheSet(cacheKey, response);
    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Stream-Cache', 'MISS');
    res.json(response);
});

/**
 * @route GET /api/stream/proxy
 * @description Proxy HLS manifests and media segments to avoid CORS/domain
 *   blocking. Supports Range requests for seeking.
 */
router.get('/proxy', async (req: Request, res: Response): Promise<void> => {
    let url = req.query.url as string | undefined;
    const requestId = (req as any).id;
    const proxyBase = getProxyBaseUrl(req);
    const refererParam = req.query.referer as string | undefined;

    if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'URL parameter is required' });
        return;
    }

    url = unwrapProxyTarget(url);
    
    // Fix dead Megaup CDN domains (e.g. lgv.net22lab.site -> lgv.megaup.cc)
    // These often appear inside variant m3u8 playlists as absolute URLs.
    url = url.replace(/(web24code|lab27core|code29wave|net22lab|pro25zone|tech20hub|hub26link|hub27link|shop21pro|burntburst45)\.(site|store)/gi, 'megaup.cc');

    if (!/^https?:\/\//i.test(url)) {
        res.status(400).json({ error: 'Invalid streaming URL' });
        return;
    }

    let urlObj: URL;
    try { urlObj = new URL(url); } catch {
        res.status(400).json({ error: 'Malformed URL' });
        return;
    }
    const domain = urlObj.hostname;
    const isM3u8 = url.includes('.m3u8');
    const isSegment = url.includes('.ts') || url.includes('.m4s');
    const isVideo = url.endsWith('.mp4');

    // Serve cached segments without hitting upstream
    if (isSegment && !req.headers.range) {
        const cachedData = segmentCacheGet(url);
        if (cachedData) {
            const entry = segmentCache.get(url)!;
            res.set('Content-Type', entry.contentType || 'video/MP2T');
            res.set('Content-Length', String(cachedData.length));
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Cache-Control', 'public, max-age=86400');
            res.set('X-Segment-Cache', 'HIT');
            res.status(200).send(cachedData);
            return;
        }
    }

    logger.info(`[PROXY] ${isM3u8 ? 'manifest' : isVideo ? 'video' : 'resource'} from ${domain}`, {
        domain, type: isM3u8 ? 'manifest' : isVideo ? 'video' : 'other', requestId,
    });

    if (isDeadDomain(url)) {
        res.status(502).json({ error: 'Dead domain', reason: 'dead_domain', domain });
        return;
    }

    // Fast-path for ISP-blocked domains
    if (process.env.IS_REMOTE_PROXY !== 'true' && isIspBlockedDomain(domain)) {
        logger.info(`[PROXY] ISP-blocked ${domain} — routing to remote proxy`, { domain, requestId });
        const ok = await forwardToRemoteProxy(res, url, refererParam, domain, requestId, 'ISP fast-path');
        if (!ok) res.status(502).json({ error: 'ISP-blocked domain unreachable via remote proxy', domain });
        return;
    }

    const isResolvable = await isDomainResolvable(domain);
    if (!isResolvable) {
        res.status(502).json({ error: 'Domain not resolvable', reason: 'dns_error', domain });
        return;
    }

    // Build referer combos to try in order
    const cdnConfigs = getCdnConfigs(domain);
    const refererCombos: Array<{ referer: string; origin: string }> = [];

    // Deduplicate helper
    const addCombo = (referer: string, origin?: string) => {
        const o = origin || referer.replace(/\/$/, '');
        if (!refererCombos.some(c => c.referer === referer)) refererCombos.push({ referer, origin: o });
    };

    const isMegaupCdn = cdnConfigs[0]?.referer.includes('megaup.nl');
    if (isMegaupCdn && refererParam) {
        let paramOrigin: string;
        try { paramOrigin = new URL(refererParam).origin; } catch { paramOrigin = 'https://megaup.nl'; }
        addCombo(refererParam, paramOrigin);
    }

    for (const c of cdnConfigs) addCombo(c.referer, c.origin);
    if (refererParam) {
        try { addCombo(refererParam, new URL(refererParam).origin); } catch { /* ignore */ }
    }

    // owocdn needs extra referer options
    if (domain.includes('owocdn')) {
        for (const ref of ['https://animepahe.ru/', 'https://kwik.cx/', 'https://kwik.si/', 'https://aniwatchtv.to/']) {
            try { addCombo(ref, new URL(ref).origin); } catch { /* ignore */ }
        }
    }

    // Always include aniwatchtv and animekai as last-resort referers
    addCombo('https://aniwatchtv.to/', 'https://aniwatchtv.to');
    addCombo('https://animekai.to/', 'https://animekai.to');
    if (domain.includes('megaup') || domain.includes('rrr.')) {
        addCombo('https://megaup.live/', 'https://megaup.live');
        addCombo('https://megaup.cc/', 'https://megaup.cc');
        addCombo('https://megaup.to/', 'https://megaup.to');
    }

    // Proxy CDN config lookup for per-domain referers in the proxy route
    const proxyCdnConfig: Record<string, { referer: string; origin?: string }> = {
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
        'megaup': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'lab27core': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'code29wave': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'net22lab': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'pro25zone': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'tech20hub': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'web24code': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'burntburst45': { referer: 'https://aniwaves.ru/', origin: 'https://aniwaves.ru' },
        'burntburst': { referer: 'https://aniwaves.ru/', origin: 'https://aniwaves.ru' },
        'megaup-stream': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
        'gogocdn': { referer: 'https://gogoanime.run/' },
        'fast4speed': { referer: 'https://allanime.day', origin: 'https://allanime.day' },
        'hstorage': { referer: 'https://watchhentai.net/', origin: 'https://watchhentai.net' },
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
        'takutaku': { referer: 'https://anitaku.to/', origin: 'https://anitaku.to' },
    };

    const matchedProxyConfig = Object.entries(proxyCdnConfig).find(([key]) => domain.includes(key));
    if (matchedProxyConfig) {
        const [, cfg] = matchedProxyConfig;
        addCombo(cfg.referer, cfg.origin);
    }

    // Try each referer combo
    let proxyResponse: AxiosResponse | null = null;
    let lastProxyError: unknown = null;

    const makeProxyRequest = (targetUrl: string, combo: { referer: string; origin: string }, relaxedTls: boolean): Promise<AxiosResponse> => {
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': combo.referer,
            'Connection': 'keep-alive',
        };
        if (req.headers.range) headers['Range'] = req.headers.range as string;

        const agentOptions = relaxedTls
            ? { rejectUnauthorized: false, ciphers: 'DEFAULT:@SECLEVEL=0' }
            : undefined;

        return axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers,
            timeout: 30_000,
            maxRedirects: 5,
            validateStatus: (s: number) => s < 400,
            ...(agentOptions ? { httpsAgent: new https.Agent(agentOptions) } : {}),
        });
    };

    for (let attempt = 0; attempt < refererCombos.length; attempt++) {
        const combo = refererCombos[attempt];
        const cachedProtocol = getProtocolCache(domain);

        try {
            const targetUrl = cachedProtocol === 'http' ? url.replace(/^https:\/\//i, 'http://') : url;
            proxyResponse = await makeProxyRequest(targetUrl, combo, false);
            logger.info(`[PROXY] Success on attempt ${attempt + 1} (${combo.referer})`, { domain, requestId });
            break;
        } catch (err: unknown) {
            lastProxyError = err;
            const errMsg = err instanceof Error ? err.message : String(err);
            const errCode = (err as NodeJS.ErrnoException).code;
            const isTlsError =
                errCode === 'EPROTO' || errCode === 'ECONNRESET' || errCode === 'ECONNREFUSED' ||
                errCode === 'CERT_REVOKED' ||
                errMsg.includes('EPROTO') || errMsg.includes('wrong version number') ||
                errMsg.includes('socket hang up') || errMsg.includes('alert protocol version') ||
                errMsg.includes('revoked');

            if (isTlsError && cachedProtocol !== 'http') {
                logger.warn(`[PROXY] TLS error for ${domain} — trying relaxed TLS`, { requestId });
                try {
                    proxyResponse = await makeProxyRequest(url, combo, true);
                    logger.info(`[PROXY] Relaxed TLS success for ${domain}`, { domain, requestId });
                    break;
                } catch (tlsErr: unknown) {
                    lastProxyError = tlsErr;
                    logger.warn(`[PROXY] Relaxed TLS failed for ${domain}: ${tlsErr instanceof Error ? tlsErr.message : String(tlsErr)}`, { requestId });

                    if (url.startsWith('https://')) {
                        try {
                            const httpResp = await makeProxyRequest(url.replace(/^https:\/\//i, 'http://'), combo, false);
                            const ct = httpResp.headers['content-type'] || '';
                            if (ct.includes('text/html')) {
                                // ISP block page — drain and break out of loop completely
                                httpResp.data?.resume?.();
                                logger.warn(`[PROXY] HTTP fallback returned HTML (ISP block) for ${domain}. Skipping remaining combos.`, { requestId });
                                break; // Break out of referer loop!
                            } else {
                                setProtocolCache(domain, 'http');
                                proxyResponse = httpResp;
                                logger.info(`[PROXY] HTTP fallback success for ${domain}`, { domain, requestId });
                                break;
                            }
                        } catch (httpErr: unknown) {
                            lastProxyError = httpErr;
                            logger.warn(`[PROXY] HTTP fallback failed for ${domain}`, { requestId });
                            // If HTTP also fails with timeout/connection error, it's a hard block.
                            break;
                        }
                    } else {
                        break; // Not HTTPS, so no HTTP fallback to try. Hard block.
                    }
                }
            } else if (errCode === 'ECONNABORTED' || errCode === 'ETIMEDOUT' || errMsg.includes('timeout')) {
                // Timeouts are network-level. Changing referer won't fix it.
                logger.warn(`[PROXY] Network timeout for ${domain}. Skipping remaining combos.`, { requestId });
                break;
            }
            logger.warn(`[PROXY] Attempt ${attempt + 1}/${refererCombos.length} failed (${combo.referer}): ${errMsg}`, { requestId });
            if (attempt < refererCombos.length - 1) await new Promise(r => setTimeout(r, 300));
        }
    }

    if (!proxyResponse) {
        logger.info(`[PROXY] All local attempts failed for ${domain} — trying remote proxy`, { domain, requestId });
        const ok = await forwardToRemoteProxy(res, url, refererParam, domain, requestId, 'Remote fallback');
        if (!ok) {
            const err = lastProxyError;
            const errMsg = err instanceof Error ? err.message : String(err);
            const errCode = (err as NodeJS.ErrnoException | undefined)?.code;
            res.status(502).json({
                error: 'Failed to proxy stream',
                reason: errCode === 'EPROTO' ? 'tls_error' : errCode === 'ECONNABORTED' || errCode === 'ETIMEDOUT' ? 'timeout' : 'connection_error',
                domain,
                message: process.env.NODE_ENV === 'development' ? errMsg : undefined,
            });
        }
        return;
    }

    if (proxyResponse.status >= 400) {
        proxyResponse.data?.resume?.();
        res.status(proxyResponse.status).json({ error: 'Upstream error', status: proxyResponse.status, domain });
        return;
    }

    // ---------- M3U8 manifest handling ----------
    const upstreamCt = proxyResponse.headers['content-type'] || '';
    const isUpstreamM3u8 =
        upstreamCt.includes('x-mpegurl') ||
        upstreamCt.includes('vnd.apple.mpegurl') ||
        url.includes('.m3u8') ||
        (domain.includes('shop21pro.site') && !url.includes('.ts') && !url.includes('.m4s'));

    if (isUpstreamM3u8) {
        try {
            const content = await streamToString(proxyResponse.data);

            // Reject manifests whose segments resolve to known ad CDNs
            if (isAdPoisonedManifest(content, url)) {
                res.status(502).json({
                    error: 'Ad-poisoned manifest',
                    reason: 'ad_cdn_segments',
                    domain,
                    message: 'HLS manifest contains segments from ad/tracking CDNs instead of real video data',
                });
                return;
            }

            const rewritten = rewriteM3u8Content(content, url, proxyBase, refererParam || refererCombos[0]?.referer);
            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
            res.set('Access-Control-Allow-Origin', '*');
            res.send(rewritten);
            logger.info(`[PROXY] Rewrote m3u8 from ${domain}`, { domain, originalSize: content.length, requestId });
        } catch (err) {
            logger.error(`[PROXY] Failed to process m3u8 from ${domain}`, err as Error);
            res.status(502).json({ error: 'Failed to process manifest' });
        }
        return;
    }

    // ---------- Video/binary content ----------

    // Guard: reject responses from ad CDN domains (ad blobs disguised as segments)
    if (isAdCdnUrl(url)) {
        proxyResponse.data?.resume?.();
        logger.warn(`[PROXY] Blocked ad CDN segment: ${domain}`, { url: url.substring(0, 200), requestId });
        res.status(502).json({ error: 'Ad CDN content blocked', reason: 'ad_cdn', domain });
        return;
    }

    // Guard: reject non-video content types when the request looks like a segment
    const expectingVideoSegment = isSegment || (!isM3u8 && !isVideo && !url.includes('.vtt') && !url.includes('.srt'));
    if (expectingVideoSegment && upstreamCt) {
        const ctLower = upstreamCt.toLowerCase();
        
        // Strict block for non-media types (HTML/JSON/JS)
        if (NON_VIDEO_CONTENT_TYPES.some(bad => ctLower.includes(bad))) {
            proxyResponse.data?.resume?.();
            logger.warn(`[PROXY] Blocked strict non-video content type: ${upstreamCt}`, { domain, requestId });
            res.status(502).json({ error: 'Non-video content type blocked', contentType: upstreamCt, domain });
            return;
        }

        // Image handling: allow if from known video CDN (obfuscation), block if from ad CDN
        if (IMAGE_CONTENT_TYPES.some(img => ctLower.includes(img))) {
            const isKnownCdn = Object.keys(proxyCdnConfig).some(key => domain.includes(key));
            const isAdDomain = isAdCdnUrl(url);

            if (isAdDomain) {
                proxyResponse.data?.resume?.();
                logger.warn(`[PROXY] Blocked ad image segment: ${domain}`, { url: url.substring(0, 100), requestId });
                res.status(502).json({ error: 'Ad image segment blocked', domain });
                return;
            }

            if (!isKnownCdn) {
                // Potential ad disguised as image on unknown domain - check size
                const size = parseInt(proxyResponse.headers['content-length'] || '0', 10);
                if (size > 0 && size < 100 * 1024) { // < 100KB on unknown domain
                    proxyResponse.data?.resume?.();
                    logger.warn(`[PROXY] Blocked small unknown image segment (${size} bytes): ${domain}`, { requestId });
                    res.status(502).json({ error: 'Small unknown image segment blocked', domain });
                    return;
                }
            }
            
            // It's likely an obfuscated video segment - allow it
            logger.info(`[PROXY] Allowing obfuscated image segment (${upstreamCt}) from ${domain}`, { requestId });
            // Set normalized video content type for the Accept-Ranges check below
            (req as any)._normalizedCt = 'video/MP2T';
        }
    }

    const effectiveCt = (req as any)._normalizedCt || upstreamCt.toLowerCase();

    if (proxyResponse.headers['content-length'] && !proxyResponse.headers['content-encoding']) {
        res.set('Content-Length', proxyResponse.headers['content-length']);
    }
    if (proxyResponse.headers['content-range']) res.set('Content-Range', proxyResponse.headers['content-range']);

    const hasAcceptRanges = proxyResponse.headers['accept-ranges'];
    if (hasAcceptRanges) {
        res.set('Accept-Ranges', hasAcceptRanges);
    } else if (effectiveCt.startsWith('video/') || effectiveCt === 'application/octet-stream' ||
        url.includes('.ts') || url.includes('.m4s') || url.includes('.mp4') ||
        domain.includes('streamtape') || domain.includes('tapecontent')) {
        res.set('Accept-Ranges', 'bytes');
    }

    const isOctetStream = upstreamCt === 'application/octet-stream' || upstreamCt === '';
    const isKnownVideoCdn = Object.keys(proxyCdnConfig).some(key => domain.includes(key));
    const isImage = IMAGE_CONTENT_TYPES.some(img => upstreamCt.toLowerCase().includes(img));

    if (isImage && isKnownVideoCdn) {
        // Force video content type for obfuscated segments so HLS.js/Player accepts them
        res.set('Content-Type', 'video/MP2T');
    } else if (isOctetStream && isKnownVideoCdn) {
        res.set('Content-Type', 'video/mp4');
    } else if (upstreamCt) {
        res.set('Content-Type', upstreamCt);
    } else if (url.includes('.ts')) {
        res.set('Content-Type', 'video/MP2T');
    } else if (url.endsWith('.mp4')) {
        res.set('Content-Type', 'video/mp4');
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Range');
    res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.set('Cache-Control', isSegment || isVideo ? 'public, max-age=86400' : 'public, max-age=3600');
    res.status(proxyResponse.status);

    // Buffer cacheable segments; pipe everything else directly
    if (isSegment && !req.headers.range && proxyResponse.status === 200) {
        const MAX_CACHE_SEGMENT = 4 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let total = 0;
        let overflow = false;

        proxyResponse.data.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_CACHE_SEGMENT) { overflow = true; return; }
            chunks.push(chunk);
        });
        proxyResponse.data.on('end', () => {
            if (!overflow && total > 0) {
                const buf = Buffer.concat(chunks);
                segmentCacheSet(url!, buf, upstreamCt || 'video/MP2T');
            }
        });
        proxyResponse.data.on('error', (err: Error) => logger.error(`[PROXY] Segment buffer error from ${domain}`, err));
        proxyResponse.data.pipe(res);
    } else {
        proxyResponse.data.pipe(res);
    }

    proxyResponse.data.on('error', (err: Error) => {
        logger.error(`[PROXY] Stream error from ${domain}`, err);
        if (!res.headersSent) res.status(502).json({ error: 'Stream error' });
        else res.end();
    });
});

/**
 * @route OPTIONS /api/stream/proxy
 * @description Handle CORS preflight for proxy.
 */
router.options('/proxy', (_req: Request, res: Response) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Range, Origin, Accept');
    res.set('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
});

export default router;
