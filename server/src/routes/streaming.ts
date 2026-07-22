import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';

// Extend Express Request type to include custom property for normalized content type
declare module 'express' {
    interface Request {
        _normalizedCt?: string;
    }
}

import { tryFetchHianimeRestStreamingData } from '../services/hianime-rest-fallback.js';
import { isHianimeStyleEpisodeId } from '../utils/hianime-rest-servers.js';
import { logger } from '../utils/logger.js';
import axios, { type AxiosResponse } from 'axios';
import https from 'node:https';
import { lookup } from 'dns/promises';
import { Readable, PassThrough } from 'node:stream';
import type { StreamingData, VideoSource, VideoSubtitle } from '../types/streaming.js';

const router = Router();

// Debug endpoint to verify streaming routes are loaded
router.get('/debug', (_req: Request, res: Response) => {
    const sources = Array.from((req as any).app?._router?.stack || [])
        .filter((layer: any) => layer.name === 'bound dispatch')
        .map((layer: any) => layer.route?.path);
    
    res.json({
        status: 'ok',
        message: 'Streaming routes are loaded',
        timestamp: new Date().toISOString(),
        registeredSources: ['Yomi', 'Aniwaves', 'Hanime', 'WatchHentai'],
        sourceManagerSources: sourceManager ? Array.from((sourceManager as any).sources?.keys() || []) : [],
        sourcesAvailable: sourceManager ? (sourceManager as any).sources?.size : 0
    });
});

// ── Persistent HTTPS agent for proxy segment fetches ───────────────────────
// POWERHOUSE MODE: Massive connection pool for zero-latency segment fetching
// Reuses TCP connections across the ~350 segments in a 24-minute episode.
// Without keepAlive each segment pays a full TCP+TLS handshake (~80-200ms).
const proxyKeepAliveAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 100,        // Increased from 25 to 100 for parallel segment loading
    maxFreeSockets: 50,     // Increased from 10 to 50 - keep more connections alive
    timeout: 90000,         // Increased from 60s to 90s - longer-lived connections for CDN blocking
    scheduling: 'fifo',
});

// ---------------------------------------------------------------------------
// Constants & environment
// ---------------------------------------------------------------------------

const DEFAULT_REMOTE_STREAM_PROXY =
    process.env.DEFAULT_REMOTE_STREAM_PROXY ||
    'https://api.allorigins.win/raw?url=';

/** How long to wait for a dub result before accepting a sub fallback (ms). */
const DUB_PATIENCE_MS = 25_000; // Increased to 25s to allow for deep fallbacks

/** Global per-request timeout safety net (ms). */
const GLOBAL_TIMEOUT_MS = 60_000; // Increased to 60s to match SourceManager's time budget

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
    'megaup.cc',
    'megaup.nl',
    'megaup.live',
    'megaup.to',
    'roburnt10.store',
    'px.roburnt10.store',
    'dpopdrop',
    'px.dpopdrop',
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
    { pattern: /burntburst|aniwaves|echovideo/i, configs: [{ referer: 'https://aniwaves.ru/', origin: 'https://aniwaves.ru' }, { referer: 'https://play.echovideo.ru/', origin: 'https://play.echovideo.ru' }] },
    { pattern: /megaup|tech20hub|lab27core|code29wave|net22lab|pro25zone|hub26link|hub27link|shop21pro|rrr\.|xm8\./i, configs: [{ referer: 'https://megaup.nl/', origin: 'https://megaup.nl' }, { referer: 'https://animekai.to/', origin: 'https://animekai.to' }, { referer: 'https://aniwatchtv.to/', origin: 'https://aniwatchtv.to' }] },
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
        if (unresolvable) logger.warn(`[PROXY] DNS lookup failed for ${hostname}: ${error.code}`);
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

// POWERHOUSE MODE: Massive cache to eliminate buffering entirely
// 1GB cache fits ~150 segments (half an episode) for zero buffering
const IS_LOW_MEMORY = process.env.NODE_ENV === 'production' && !process.env.POSTGRES_URL;
const SEGMENT_CACHE_MAX_BYTES = IS_LOW_MEMORY ? 200 * 1024 * 1024 : 1024 * 1024 * 1024; // 200MB on low-memory, 1GB otherwise for powerhouse mode
const SEGMENT_CACHE_TTL = 60 * 60 * 1000; // 60 minutes - entire episode cached

// Manifest cache - m3u8 manifests are small but critical for startup performance
const MANIFEST_CACHE_MAX_ENTRIES = 5000; // Cache up to 5000 manifests for powerhouse mode
const MANIFEST_CACHE_TTL = 60 * 60 * 1000; // 60 minutes - entire session cached

interface SegmentCacheEntry { data: Buffer; contentType: string; fetchedAt: number; size: number; lastUsed: number }
interface ManifestCacheEntry { data: string; fetchedAt: number; lastUsed: number }

const segmentCache = new Map<string, SegmentCacheEntry>();
const manifestCache = new Map<string, ManifestCacheEntry>();
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

function manifestCacheEvict(): void {
    // LRU eviction for manifests
    if (manifestCache.size <= MANIFEST_CACHE_MAX_ENTRIES) return;
    const entries = [...manifestCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toEvict = entries.slice(0, manifestCache.size - MANIFEST_CACHE_MAX_ENTRIES);
    for (const [key] of toEvict) {
        manifestCache.delete(key);
    }
}

function manifestCacheGet(url: string): string | null {
    const entry = manifestCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > MANIFEST_CACHE_TTL) {
        manifestCache.delete(url);
        return null;
    }
    entry.lastUsed = Date.now();
    return entry.data;
}

function manifestCacheSet(url: string, data: string): void {
    const existing = manifestCache.get(url);
    manifestCache.set(url, { data, fetchedAt: Date.now(), lastUsed: Date.now() });
    if (existing) {
        // Update in place, no size change for manifests
    } else {
        manifestCacheEvict();
    }
}

// ---------------------------------------------------------------------------
// Stream result cache
// ---------------------------------------------------------------------------

const STREAM_CACHE_TTL = 20 * 60 * 1000; // 20 minutes — long enough to survive most "re-watch" patterns
// MEMORY OPTIMIZATION: Reduce cache on low-memory systems (Render free tier)
const STREAM_CACHE_MAX = IS_LOW_MEMORY ? 20 : 200; // 20 entries on Render, 200 elsewhere

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

function streamCacheSet(key: string, data: any, ttlOverride?: number): void {
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
    const ttl = ttlOverride != null ? ttlOverride : STREAM_CACHE_TTL;
    streamCache.set(key, { data, expiresAt: Date.now() + ttl });
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
    // Priority 1: Explicit BASE_URL env var (highest confidence)
    const envBase = process.env.BASE_URL?.replace(/\/$/, '');
    if (envBase && !envBase.includes('localhost:3001') && !envBase.includes('127.0.0.1:3001')) {
        return `${envBase}/api/stream/proxy`;
    }

    // Priority 2: Render.com automatically injects RENDER_EXTERNAL_URL with the service's
    // public HTTPS URL. Without this, proxy URLs are relative (/api/stream/proxy?...) which
    // only work when the SPA and API share the same origin. Since the frontend is on Firebase
    // (anifoxwatch.web.app) and the API is on Render, relative URLs break playback.
    const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, '');
    if (renderExternalUrl) {
        return `${renderExternalUrl}/api/stream/proxy`;
    }

    // Priority 3: Other known platform env vars
    const cleverUrl = process.env.CLEVER_APP_URL?.replace(/\/$/, '');
    if (cleverUrl) {
        return `${cleverUrl}/api/stream/proxy`;
    }

    // Priority 4: Infer from incoming request (works for same-origin deployments like Vercel)
    // Always force https protocol on non-localhost hosts to prevent Mixed Content blocking on HTTPS sites (Firebase)
    const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = req.headers['x-forwarded-host'] || req.headers['host'];
    if (host && !String(host).includes('localhost') && !String(host).includes('127.0.0.1')) {
        const proto = (rawProto === 'http' && !String(host).includes('localhost')) ? 'https' : rawProto;
        return `${proto}://${host}/api/stream/proxy`;
    }

    // Default for production API: target Render API explicitly if no host matches
    return 'https://anifoxwatch-dko2.onrender.com/api/stream/proxy';
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
    const origin = new URL(originalUrl).origin;

    return content.split('\n').map(line => {
        const t = line.trim();
        if (t.startsWith('#') && t.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
                const abs = uri.startsWith('http') ? uri : uri.startsWith('/') 
                    ? `${origin}${uri}` 
                    : `${baseUrl}${uri}`;
                return `URI="${proxyUrl(abs, proxyBase, referer)}"`;
            });
        }
        if (!t || t.startsWith('#')) return line;
        // Handle absolute paths (starting with /) by using origin + path
        // For echovideo CDN, paths like /cdn/... need the full origin
        const abs = t.startsWith('http') ? t : t.startsWith('/') 
            ? `${origin}${t}` 
            : `${baseUrl}${t}`;
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
    const isMegaupPattern = /(web|lab|code|net|pro|tech|hub|shop|burnt|zone|cdn|site|app|data|media|rrr|xm8|rrr\d+|dev\d*app)\d*(code|core|wave|lab|zone|hub|link|pro|burst|data|link|media|host|cdn|file|store|link|site)\.(site|store|click|buzz|online|top|xyz|shop|live|cc|nl)/i.test(originalUrl);
    if (isMegaupPattern) return false;
    
    // Also check if segments themselves are from megaup CDN
    const hasMegaupSegments = segmentUrls.some(u => /megaup|pro25zone|net22lab|code29wave|lab27core|web24code|tech20hub|hub26link|hub27link|shop21pro|burntburst|xm8|rrr\.|rrr\d+|dev\d*app/i.test(u));
    if (hasMegaupSegments) return false;

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

async function streamToString(stream: Readable, maxSize = 5 * 1024 * 1024): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > maxSize) throw new Error(`Stream exceeded max size (${maxSize} bytes) for M3U8 manifest`);
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
}

async function checkEchovideoManifest(proxyResponse: { data: Readable }): Promise<{ isManifest: boolean; content?: string }> {
    return new Promise((resolve) => {
        const stream = proxyResponse.data;
        const chunks: Buffer[] = [];
        let totalSize = 0;
        let decided = false;

        const cleanup = () => {
            stream.removeListener('data', onData);
            stream.removeListener('end', onEnd);
            stream.removeListener('error', onError);
        };

        const onData = (chunk: Buffer) => {
            if (decided) return;
            chunks.push(chunk);
            totalSize += chunk.length;

            const head = Buffer.concat(chunks).toString('utf-8', 0, Math.min(totalSize, 4096));
            if (head.includes('#EXTM3U')) {
                if (totalSize > 2 * 1024 * 1024) {
                    decided = true;
                    cleanup();
                    resolve({ isManifest: true, content: Buffer.concat(chunks).toString('utf-8') });
                }
            } else if (totalSize >= 512 || head.includes('#EXTINF') || head.startsWith('G') || head.includes('ftyp') || head.includes('moov')) {
                decided = true;
                cleanup();

                const passThrough = new PassThrough();
                for (const c of chunks) {
                    passThrough.write(c);
                }
                stream.pipe(passThrough);
                proxyResponse.data = passThrough as any;

                resolve({ isManifest: false });
            }
        };

        const onEnd = () => {
            if (decided) return;
            decided = true;
            cleanup();
            const fullStr = Buffer.concat(chunks).toString('utf-8');
            if (fullStr.includes('#EXTM3U')) {
                resolve({ isManifest: true, content: fullStr });
            } else {
                resolve({ isManifest: false });
            }
        };

        const onError = () => {
            if (decided) return;
            decided = true;
            cleanup();
            resolve({ isManifest: false });
        };

        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onError);
    });
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
        const remoteResp = await axios({ method: 'get', url: remoteTarget, responseType: 'stream', timeout: 15000, maxRedirects: 5 });
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
    if (query.eps && episodeId.toLowerCase().startsWith('aniwaves-') && !episodeId.includes('&eps=')) {
        return `${episodeId}&eps=${String(query.eps)}`;
    }
    if (!query.ep || episodeId.includes('?ep=')) return episodeId;
    // Do not corrupt fully-formed AnimeKai IDs with a stray ?ep=
    if (episodeId.includes('$ep=') && episodeId.includes('$token=')) return episodeId;
    
    return `${episodeId}?ep=${String(query.ep)}`;
}

/**
 * @route GET /api/stream/diag/proxy-config
 * @description Show what proxy base URL the server is using (diagnostic).
 */
router.get('/diag/proxy-config', (req: Request, res: Response): void => {
    const proxyBase = getProxyBaseUrl(req);
    res.json({
        proxyBase,
        env: {
            BASE_URL: process.env.BASE_URL || null,
            RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL || null,
            CLEVER_APP_URL: process.env.CLEVER_APP_URL || null,
            NODE_ENV: process.env.NODE_ENV || null,
        },
        requestHeaders: {
            host: req.headers.host || null,
            'x-forwarded-host': req.headers['x-forwarded-host'] || null,
            'x-forwarded-proto': req.headers['x-forwarded-proto'] || null,
        },
        isAbsolute: proxyBase.startsWith('http'),
    });
});

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

    const { category, proxy: useProxy = 'true', ep: epToken, ep_num: epNumRaw, title: queryTitle } = req.query;
    const explicitServer = normalizeStreamServerQuery(req.query.server);
    
    // Parse episode number - prioritize ep_num, fallback to ep if it's numeric
    let episodeNum: number | undefined;
    if (epNumRaw) {
        episodeNum = parseInt(String(epNumRaw), 10);
    } else if (epToken && /^\d+$/.test(String(epToken))) {
        episodeNum = parseInt(String(epToken), 10);
    }
    if (episodeNum != null && isNaN(episodeNum)) episodeNum = undefined;
    const anilistId = req.query.anilist_id ? parseInt(String(req.query.anilist_id), 10) || undefined : undefined;
    const requestId = (req as any).id;
    const shouldProxy = useProxy !== 'false';
    const proxyBase = getProxyBaseUrl(req);
    const categoryStr = String(category || 'sub');
    const isDubRequested = categoryStr === 'dub';
    const cat = isDubRequested ? 'dub' : 'sub';
    const noCache = req.query.nocache === 'true';

    const cacheKey = streamCacheKey(episodeId, explicitServer, categoryStr);
    const cached = streamCacheGet(cacheKey);
    if (cached && !noCache) {
        logger.info(`[STREAM] Cache hit for ${episodeId}`, { requestId });
        res.set('Cache-Control', 'private, max-age=300');
        res.set('X-Stream-Cache', 'HIT');
        res.json(cached);
        return;
    }

    logger.info(`[STREAM] Fetching stream for episode: ${episodeId}`, {
        episodeId, server: explicitServer ?? 'auto', category: categoryStr, episodeNum, shouldProxy, requestId,
    });

    const preferredSource = explicitServer || (req.query.preferred_source as string) || undefined;

    let streamData: any = { sources: [], subtitles: [] };
    let lastError: string | null = null;

    try {
        logger.info(`[STREAM] Calling sourceManager.getStreamingLinks with:`, {
            episodeId, preferredSource, cat, episodeNum, anilistId, queryTitle
        });
        streamData = await sourceManager.getStreamingLinks(episodeId, preferredSource, cat, episodeNum, anilistId, queryTitle as string);
    } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : String(e);
    }

    // If no dub sources found, fall back to sub sequentially
    if (!streamData?.sources?.length && isDubRequested) {
        try {
            logger.info(`[STREAM] Sequential sub fallback for dub request ${episodeId}`, { requestId });
            const subFallback = await sourceManager.getStreamingLinks(episodeId, preferredSource, 'sub', episodeNum, anilistId, queryTitle as string);
            if (subFallback?.sources?.length) {
                streamData = { ...subFallback, category: 'sub', dubFallback: true };
                logger.info(`[STREAM] Sequential sub fallback succeeded for ${episodeId}`, { requestId });
            }
        } catch (e: unknown) {
            lastError = e instanceof Error ? e.message : String(e);
        }
    }

    if (streamData?.sources?.length) {
        logger.info(`[STREAM] Source resolved (${streamData.source ?? 'unknown'}, cat=${streamData.category ?? cat}) for ${episodeId}`, { requestId });
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
    const response: StreamingData & { server?: string; triedServers?: string[]; audioLanguage?: string; dubFallback?: boolean; category?: string } = {
        ...streamData,
        audioLanguage: isDubRequested ? 'en' : 'ja',
    };

    // Hardening: If DUB was requested but the resolved stream is SUB category, force dubFallback to true
    if (isDubRequested && (streamData.category === 'sub' || streamData.dubFallback === true)) {
        response.dubFallback = true;
        response.category = 'sub';
    }

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

    const isFallback = response.dubFallback === true || response.sources.some(s => s.isEmbed);
    streamCacheSet(cacheKey, response, isFallback ? 10000 : undefined);
    res.set('Cache-Control', isFallback ? 'private, no-cache, no-store, must-revalidate' : 'private, max-age=900');
    res.set('X-Stream-Cache', 'MISS');
    res.json(response);
});

/**
 * @route GET /api/stream/proxy
 * @description Proxy HLS manifests and media segments to avoid CORS/domain
 *   blocking. Supports Range requests for seeking.
 */
router.get('/proxy', async (req: Request, res: Response): Promise<void> => {
    let url = (req.query.url || req.body.url) as string | undefined;
    const requestId = (req as any).id;
    const proxyBase = getProxyBaseUrl(req);
    let refererParam = (req.query.referer || req.body.referer) as string | undefined;
    if (refererParam !== undefined) {
        refererParam = refererParam.trim();
        if (refererParam === '') {
            refererParam = undefined;
        }
    }

    if (url) logger.info(`[PROXY] Request: ${url.substring(0, 100)}${url.length > 100 ? '...' : ''} (Referer: ${refererParam})`, { requestId });

    if (!url || typeof url !== 'string') {
        res.set('Access-Control-Allow-Origin', '*').status(400).json({ error: 'URL parameter is required' });
        return;
    }

    url = unwrapProxyTarget(url);

    if (!/^https?:\/\//i.test(url)) {
        res.set('Access-Control-Allow-Origin', '*').status(400).json({ error: 'Invalid streaming URL' });
        return;
    }

    let urlObj: URL;
    try { urlObj = new URL(url); } catch {
        res.set('Access-Control-Allow-Origin', '*').status(400).json({ error: 'Malformed URL' });
        return;
    }
    const domain = urlObj.hostname;

    // Preserve the original URL before any rewrites — the remote proxy (Vercel)
    // might have better connectivity to the original CDN domain.
    const originalUrlBeforeRewrite = url;

    // Removing dead CDN domain rewrites since megaup.cc subdomains are globally dead.

    // Check for dead domains AFTER rewrite to catch any that couldn't be fixed
    if (isDeadDomain(url)) {
        res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Dead domain', reason: 'dead_domain', domain });
        return;
    }
    const isM3u8 = url.includes('.m3u8');
    // Megaup CDN uses obfuscated extensions (.gif, .jpg, .png) for real video segments
    const isMegaupDomain = /megaup\.(cc|nl|live|to)|tech20hub|lab27core|code29wave|net22lab|pro25zone|hub26link|hub27link|shop21pro|burntburst45|rrr\.|xm8\.|dev\d*app/i.test(domain);
    const hasObfuscatedExt = /\.(gif|jpg|jpeg|png|webp)$/i.test(urlObj.pathname);
    // Echovideo CDN segments don't have extensions - they're just CDN URLs
    const isEchovideoSegment = /echovideo\.(to|ru)/.test(domain) && !url.includes('.m3u8');
    const isSegment = url.includes('.ts') || url.includes('.m4s') || (isMegaupDomain && hasObfuscatedExt) || isEchovideoSegment;
    const isVideo = url.endsWith('.mp4');

    // Serve cached manifests without hitting upstream
    if (isM3u8 && !req.headers.range) {
        const cachedManifest = manifestCacheGet(url);
        if (cachedManifest) {
            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            res.set('Content-Length', String(cachedManifest.length));
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Cache-Control', 'public, max-age=300');
            res.set('X-Manifest-Cache', 'HIT');
            res.status(200).send(cachedManifest);
            logger.info(`[PROXY] Manifest cache HIT: ${url.substring(0, 80)}...`, { requestId });
            return;
        }
    }

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
        res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Dead domain', reason: 'dead_domain', domain });
        return;
    }

    // Fast-path for ISP-blocked domains
    if (process.env.IS_REMOTE_PROXY !== 'true' && isIspBlockedDomain(domain)) {
        logger.info(`[PROXY] ISP-blocked ${domain} — routing to remote proxy`, { domain, requestId });
        const ok = await forwardToRemoteProxy(res, url, refererParam, domain, requestId, 'ISP fast-path');
        if (ok) return;
        logger.warn(`[PROXY] Remote proxy failed for ISP-blocked ${domain} — falling back to local rotation`, { requestId });
    }

    // Process media requests locally with persistent keepAlive agent.
    // Unresolvable or ISP-blocked domains are forwarded to remote proxy in the checks below.

    const isResolvable = await isDomainResolvable(domain);
    if (!isResolvable) {
        if (process.env.IS_REMOTE_PROXY !== 'true' && !isIspBlockedDomain(domain)) {
            logger.info(`[PROXY] Unresolvable ${domain} — routing to remote proxy`, { domain, requestId });
            const ok = await forwardToRemoteProxy(res, url, refererParam, domain, requestId, 'Unresolvable fast-path');
            if (ok) return;
        }

        if (!isMegaupDomain) {
            res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Domain not resolvable', reason: 'dns_error', domain });
            return;
        }
        // Let megaup domains fall through so the catch block can handle rotation
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
        addCombo('https://megaup.nl/', 'https://megaup.nl');
        addCombo('https://megaup.cc/', 'https://megaup.cc');
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
        'hub26link': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'hub27link': { referer: 'https://animekai.to/', origin: 'https://animekai.to' },
        'xm8.': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
        'rrr.': { referer: 'https://megaup.nl/', origin: 'https://megaup.nl' },
        'gogocdn': { referer: 'https://gogoanime.run/' },
        'fast4speed': { referer: 'https://allanime.day', origin: 'https://allanime.day' },
        'echovideo': { referer: 'https://play.echovideo.ru/', origin: 'https://play.echovideo.ru' },
        'hlsxszt': { referer: 'https://play.echovideo.ru/', origin: 'https://play.echovideo.ru' },
        'roburnt': { referer: 'https://play.echovideo.ru/', origin: 'https://play.echovideo.ru' },
        'dpopdrop': { referer: 'https://play.echovideo.ru/', origin: 'https://play.echovideo.ru' },
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Referer': combo.referer,
            'Origin': combo.origin || combo.referer.replace(/\/$/, ''),
            'Connection': 'keep-alive',
        };
        if (req.headers.range) headers['Range'] = req.headers.range as string;

        const agentOptions = relaxedTls
            ? { rejectUnauthorized: false, ciphers: 'DEFAULT:@SECLEVEL=0' }
            : undefined;

        // Segments must be fast — 15s timeout to match client-side for zero lag
        // Matches client-side fragLoadingTimeOut (15s) to prevent server timeout before client
        // Manifests are infrequent so stay at 20s.
        const timeoutMs = (isSegment && !isM3u8) ? 15_000 : 20_000;

        return axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers,
            timeout: timeoutMs,
            maxRedirects: 5,
            validateStatus: (s: number) => s < 400,
            // Use the persistent keepAlive agent for segment fetches;
            // relax TLS when requested.
            ...(agentOptions
                ? { httpsAgent: new https.Agent({ ...agentOptions }) }
                : { httpsAgent: proxyKeepAliveAgent }),
        });
    };

    /**
     * CDN subdomain rotation: when a megaup CDN URL fails (e.g. rrr.megaup.cc 502),
     * try alternative subdomains and base domains that are known to serve the same content.
     * Covers both segments AND manifests.
     */
    const MEGAUP_SUBDOMAIN_ALTERNATIVES = ['rrr', 'xm8', 'cdn', 'stream', 'media', 'file', 'videos', 'play', 'watch'];
    const MEGAUP_BASE_ALTERNATIVES = ['megaup.cc', 'megaup.nl', 'megaup.to', 'megaup.live', 'megaup.net', 'megaup.org'];

    // In-memory blacklist for failing mirrors (lasts 60s)
    const mirrorBlacklist = new Map<string, number>();
    const MIRROR_BLACKLIST_TTL = 60 * 1000;
    const MIRROR_TRY_MAX = 8; // Max rotation candidates to try per URL

    const buildCdnRotationUrls = (failedUrl: string): string[] => {
        if (!isMegaupDomain) return [];
        try {
            const u = new URL(failedUrl);
            const parts = u.hostname.split('.');
            const currentSub = parts[0];
            const currentBase = parts.slice(1).join('.');

            const alternatives: string[] = [];
            for (const base of MEGAUP_BASE_ALTERNATIVES) {
                for (const sub of MEGAUP_SUBDOMAIN_ALTERNATIVES) {
                    if (alternatives.length >= MIRROR_TRY_MAX) break;
                    const altHostname = `${sub}.${base}`;
                    if (altHostname === u.hostname) continue;

                    // Skip blacklisted mirrors
                    if ((mirrorBlacklist.get(altHostname) || 0) > Date.now()) continue;

                    const newUrl = new URL(failedUrl);
                    newUrl.hostname = altHostname;
                    alternatives.push(newUrl.toString());
                }
                if (alternatives.length >= MIRROR_TRY_MAX) break;
            }
            // Shuffle to distribute attempt load across mirrors
            return alternatives.sort(() => Math.random() - 0.5);
        } catch { return []; }
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
            const status = (err as any).response?.status;
            // If it failed with Range header, try once more WITHOUT Range for segments
            if (req.headers.range && isSegment && !isM3u8 && (status === 502 || status === 403 || status === 416)) {
                try {
                    logger.warn(`[PROXY] Segment failed with Range (${status}) — retrying without Range`, { requestId });
                    proxyResponse = await axios({
                        method: 'get',
                        url: url,
                        responseType: 'stream',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                            'Referer': combo.referer,
                            'Origin': combo.origin || combo.referer.replace(/\/$/, ''),
                        },
                        timeout: 15000,
                        validateStatus: (s) => s < 400
                    });
                    logger.info(`[PROXY] Success without Range for ${domain}`, { requestId });
                    break;
                } catch { /* proceed to normal rotation */ }
            }
            
            lastProxyError = err;
            const errMsg = err instanceof Error ? err.message : String(err);
            const errCode = (err as NodeJS.ErrnoException).code;
            const isTlsError =
                errCode === 'EPROTO' || errCode === 'ECONNRESET' || errCode === 'ECONNREFUSED' ||
                errCode === 'CERT_REVOKED' ||
                errMsg.includes('EPROTO') || errMsg.includes('wrong version number') ||
                errMsg.includes('socket hang up') || errMsg.includes('alert protocol version') ||
                errMsg.includes('revoked');

            let rotationTried = false;

            // CDN subdomain rotation for 403/502/503 or connection errors on megaup
            // Works for BOTH segments and manifests — tries each rotation candidate
            // through the FULL referer combo cycle, then falls back to the original URL.
            if (isMegaupDomain && !rotationTried && (
                (isSegment && !isM3u8) || isM3u8
            ) && (
                status === 403 || status === 502 || status === 503 || status === 504 ||
                errCode === 'ECONNREFUSED' || errCode === 'ECONNRESET' ||
                errCode === 'ECONNABORTED' || errCode === 'ETIMEDOUT' ||
                errCode === 'ENOTFOUND' || errMsg.includes('timeout') || errMsg.includes('502')
            )) {
                rotationTried = true;
                const altUrls = buildCdnRotationUrls(url);
                logger.warn(`[PROXY] Megaup error ${status || errCode || 'timeout'} on ${domain} (${isM3u8 ? 'manifest' : 'segment'}) — trying ${altUrls.length} rotated URLs x ${refererCombos.length} referer combos`, { requestId });

                // Try EACH rotation candidate through the FULL referer combo list
                for (const altUrl of altUrls) {
                    const altDomain = new URL(altUrl).hostname;
                    for (const rotateCombo of refererCombos) {
                        try {
                            proxyResponse = await makeProxyRequest(altUrl, rotateCombo, false);
                            logger.info(`[PROXY] Rotation success: ${domain} → ${altDomain} (referer: ${rotateCombo.referer})`, { requestId });
                            mirrorBlacklist.delete(altDomain); // Clear any prior blacklist entry on success
                            break; // Break inner referer loop
                        } catch (altErr: any) {
                            const altStatus = altErr.response?.status;
                            mirrorBlacklist.set(altDomain, Date.now() + MIRROR_BLACKLIST_TTL);
                            logger.warn(`[PROXY] Rotation fail: ${altDomain} with ${rotateCombo.referer} (${altStatus || altErr.code})`, { requestId });
                        }
                    }
                    if (proxyResponse) break; // Break outer altUrl loop on success
                }

                // If all rotation candidates failed, still try the ORIGINAL URL with remaining combos
                if (!proxyResponse) {
                    logger.warn(`[PROXY] All ${altUrls.length} rotated URLs failed for ${domain}. Retrying original URL through remaining combos.`, { requestId });
                }
            }

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
            } else if (!rotationTried && status === 403 && isMegaupDomain) {
                // CDN access denied — no referer will fix this. Break immediately.
                // (Skip when rotation was already tried — rotation is our best shot.)
                logger.warn(`[PROXY] CDN 403 for ${domain}. Skipping remaining referer combos.`, { requestId });
                break;
            } else if (!rotationTried && (errCode === 'ECONNABORTED' || errCode === 'ETIMEDOUT' || errMsg.includes('timeout'))) {
                // Timeouts are network-level. Changing referer won't fix it.
                // (Skip when rotation was already tried.)
                logger.warn(`[PROXY] Network timeout for ${domain}. Skipping remaining combos.`, { requestId });
                break;
            }
            logger.warn(`[PROXY] Attempt ${attempt + 1}/${refererCombos.length} failed (${combo.referer}): ${errMsg}${status ? ` (Status: ${status})` : ''} (Code: ${errCode})`, { requestId });
            // Shorter delay between retries to reduce client-side buffering stalls.
            // Manifests: 400ms (was 800ms). Segments: 100ms (was 300ms).
            if (attempt < refererCombos.length - 1) await new Promise(r => setTimeout(r, isM3u8 ? 400 : 100));
        }
    }

    if (!proxyResponse) {
        // Try remote proxy with BOTH the rewritten URL and the original URL.
        // The remote proxy (Vercel/Render) may have better network connectivity
        // to the original CDN domain that's ISP-blocked locally.
        const urlsToTry = [url];
        if (originalUrlBeforeRewrite !== url) urlsToTry.push(originalUrlBeforeRewrite);

        let remoteOk = false;
        for (const tryUrl of urlsToTry) {
            const tryDomain = (() => { try { return new URL(tryUrl).hostname; } catch { return domain; } })();
            logger.info(`[PROXY] Trying remote proxy for ${tryDomain}`, { domain: tryDomain, requestId });
            remoteOk = await forwardToRemoteProxy(res, tryUrl, refererParam, tryDomain, requestId, 'Remote fallback');
            if (remoteOk) break;
        }

        if (!remoteOk) {
            const err = lastProxyError;
            const errMsg = err instanceof Error ? err.message : String(err);
            const errCode = (err as NodeJS.ErrnoException | undefined)?.code;

            logger.error(`
🚨 [PROXY FAILURE] 502 Bad Gateway
=========================================
• Domain:       ${domain}
• Target URL:   ${url}
• Original URL: ${originalUrlBeforeRewrite}
• Referer Parameter: ${refererParam || 'none'}
• Error Code:   ${errCode || 'N/A'}
• Error Message: ${errMsg}
• Status:       Local attempts and remote fallbacks all failed to reach the upstream CDN.
=========================================
`, err instanceof Error ? err : undefined, { requestId });

                res.set('Access-Control-Allow-Origin', '*').status(502).json({
                    error: 'Failed to proxy stream',
                    reason: errCode === 'EPROTO' ? 'tls_error' : errCode === 'ECONNABORTED' || errCode === 'ETIMEDOUT' ? 'timeout' : 'connection_error',
                    domain,
                    message: process.env.NODE_ENV === 'development' ? errMsg : undefined,
                });
        }
        return;
    }

    if (proxyResponse!.status >= 400) {
        proxyResponse!.data?.resume?.();
        res.set('Access-Control-Allow-Origin', '*').status(proxyResponse!.status).json({ error: 'Upstream error', status: proxyResponse!.status, domain });
        return;
    }

    // ---------- M3U8 manifest handling ----------
    const upstreamCt = proxyResponse!.headers['content-type'] || '';
    const isUpstreamM3u8 =
        upstreamCt.includes('x-mpegurl') ||
        upstreamCt.includes('vnd.apple.mpegurl') ||
        url.includes('.m3u8') ||
        (domain.includes('shop21pro.site') && !url.includes('.ts') && !url.includes('.m4s'));

    // For echovideo, we need to check the actual content to distinguish between manifests and segments
    // Echovideo segment manifests don't have .m3u8 extension but contain HLS playlist content
    let isEchovideoManifest = false;
    if (isEchovideoSegment && !isUpstreamM3u8) {
        try {
            const check = await checkEchovideoManifest(proxyResponse!);
            if (check.isManifest && check.content) {
                isEchovideoManifest = true;
                const content = check.content;
                // Reject manifests whose segments resolve to known ad CDNs
                if (isAdPoisonedManifest(content, url)) {
                    logger.warn(`⚠️ [MANIFEST AD-POISONED] Manifest from ${domain} contains ad CDN segments instead of real video data. Rejecting stream.`, { url: url.substring(0, 200), requestId });
                    res.set('Access-Control-Allow-Origin', '*').status(502).json({
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
                res.set('Vary', 'Origin');
                res.send(rewritten);
                logger.info(`[PROXY] Rewrote m3u8 from ${domain}`, { domain, originalSize: content.length, requestId });
                return;
            }
        } catch (err) {
            logger.error(`[PROXY] Failed checking Echovideo manifest`, err as Error);
        }
    }

    if (isUpstreamM3u8) {
        try {
            const content = await streamToString(proxyResponse!.data);

            // A real HLS manifest always begins with #EXTM3U. If the upstream
            // returned HTML/JSON (ad page, ISP block, error body), reject it so
            // the client fails over to the next server instead of loading garbage.
            if (!content.includes('#EXTM3U') && !(isEchovideoSegment && content.includes('#EXTINF'))) {
                logger.warn(`⚠️ [MANIFEST NOT-HLS] Upstream returned a non-manifest body from ${domain} (first bytes: ${content.slice(0, 40).replace(/\s+/g, ' ').substring(0, 40)}). Rejecting.`, { requestId });
                proxyResponse!.data?.resume?.();
                res.set('Access-Control-Allow-Origin', '*').status(502).json({
                    error: 'Non-manifest body rejected',
                    reason: 'body_not_hls',
                    domain,
                });
                return;
            }

            // Reject manifests whose segments resolve to known ad CDNs
            if (isAdPoisonedManifest(content, url)) {
                logger.warn(`⚠️ [MANIFEST AD-POISONED] Manifest from ${domain} contains ad CDN segments instead of real video data. Rejecting stream.`, { url: url.substring(0, 200), requestId });
                res.set('Access-Control-Allow-Origin', '*').status(502).json({
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
            res.set('Vary', 'Origin');
            res.send(rewritten);
            logger.info(`[PROXY] Rewrote m3u8 from ${domain}`, { domain, originalSize: content.length, requestId });
        } catch (err) {
            logger.error(`[PROXY] Failed to process m3u8 from ${domain}`, err as Error);
            res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Failed to process manifest' });
        }
        return;
    }

    // ---------- Body-level sanity check (anti-poison) ----------
    // Headers alone are unreliable: ad/block pages often arrive as
    // application/octet-stream or with NO content-type, which sneaks past
    // the header checks below and reaches HLS.js — producing a corrupt
    // blob (ERR_FILE_NOT_FOUND / NotSupportedError: "no supported
    // source found") that poisons the media buffer and stalls playback.
    // HLS segments are MPEG-TS (sync byte 0x47) or fMP4 (starts with
    // an MP4 box like "ftyp"/"moov"/"mdat"). Anything starting with
    // '<' (HTML/XML) or '{' (JSON) is NOT video — reject it so the
    // client fails over to the next server instead of buffering garbage.
    const looksLikeSegment =
      isSegment || url.includes('.ts') || url.includes('.m4s') ||
      url.endsWith('.mp4') || isEchovideoSegment;
    const looksLikeManifest = isM3u8 || isUpstreamM3u8 || isEchovideoManifest;

    // When the byte-sniffer below rejects a non-video body, set this so the
    // rest of the handler bails instead of processing a destroyed stream.
    let bodyRejected = false;

    if (looksLikeSegment || looksLikeManifest) {
      // Minimal destructive peek: read the first ~16 bytes to sniff the body.
      const head: Buffer[] = [];
      let headBytes = 0;
      let poisoned = false;
      const MAX_HEAD = 16;
      const sniff = (chunk: Buffer): boolean => {
        head.push(chunk);
        headBytes += chunk.length;
        if (headBytes >= MAX_HEAD) {
          const joined = Buffer.concat(head);
          const first = joined[0];
          const second = joined[1];
          // HTML/XML starts with '<'
          if (first === 0x3c /* '<' */) poisoned = true;
          // JSON starts with '{' or '['
          if (first === 0x7b /* '{' */ || first === 0x5b /* '[' */) poisoned = true;
          // MPEG-TS sync byte
          const isTs = first === 0x47;
          // fMP4 boxes start with a 4-byte big-endian size then "ftyp"/"moov"...
          const isFmp4 =
            (joined.length >= 8) &&
            (joined.slice(4, 8).toString('latin1').includes('ftyp') ||
             joined.slice(4, 8).toString('latin1').includes('moov') ||
             joined.slice(4, 8).toString('latin1').includes('mdat'));
          void second;
          if (!isTs && !isFmp4) {
            // Not an obvious video signature AND looks like text — reject.
            if (poisoned || joined.toString('latin1', 0, Math.min(headBytes, 8)).match(/[<>{}]/)) {
              poisoned = true;
            }
          }
          return true; // stop sniffing
        }
        return false;
      };

      const origStream = proxyResponse!.data;
      const sniffer = new PassThrough();
      let aborted = false;
      const rejectPoison = (reason: string) => {
        if (aborted) return;
        aborted = true;
        bodyRejected = true;
        try { origStream.destroy(); } catch { /* ignore */ }
        try { sniffer.destroy(); } catch { /* ignore */ }
        logger.warn(`[PROXY] Rejected ${looksLikeManifest ? 'manifest' : 'segment'} with non-video body from ${domain} (${reason})`, { requestId });
        if (!res.headersSent) {
          res.set('Access-Control-Allow-Origin', '*')
            .status(502)
            .json({ error: 'Non-video body rejected', reason: 'body_not_video', domain });
        } else {
          res.end();
        }
      };

      origStream.on('data', (chunk: Buffer) => {
        if (aborted) return;
        if (!sniffer.write(chunk)) { /* backpressure */ }
        if (sniff(chunk)) {
          if (poisoned) {
            rejectPoison(looksLikeManifest ? 'manifest_html_or_json' : 'segment_html_or_json');
          }
        }
      });
      origStream.on('end', () => { if (!aborted) sniffer.end(); });
      origStream.on('error', (err: any) => {
        if (aborted) return;
        aborted = true;
        bodyRejected = true;
        try { sniffer.destroy(); } catch { /* ignore */ }
        if (!res.headersSent) {
          res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Stream error', domain });
        } else { res.end(); }
        logger.error(`[PROXY] Upstream stream error for ${domain}`, err);
      });

      // Replace the stream the rest of the handler will pipe.
      (proxyResponse! as any).data = sniffer;
    }

    // A non-video body was rejected above — stop before processing a dead stream.
    if (bodyRejected) return;

    // ---------- Video/binary content ----------

    // Guard: reject responses from ad CDN domains (ad blobs disguised as segments)
    if (isAdCdnUrl(url)) {
        proxyResponse!.data?.resume?.();
        logger.warn(`[PROXY] Blocked ad CDN segment: ${domain}`, { url: url.substring(0, 200), requestId });
        res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Ad CDN content blocked', reason: 'ad_cdn', domain });
        return;
    }

    // Guard: reject non-video content types when the request looks like a segment
    const expectingVideoSegment = isSegment || (!isM3u8 && !isVideo && !url.includes('.vtt') && !url.includes('.srt'));
    if (expectingVideoSegment && upstreamCt) {
        const ctLower = upstreamCt.toLowerCase();
        
        // Strict block for non-media types (HTML/JSON/JS)
        if (NON_VIDEO_CONTENT_TYPES.some(bad => ctLower.includes(bad))) {
            proxyResponse!.data?.resume?.();
            logger.warn(`[PROXY] Blocked strict non-video content type: ${upstreamCt}`, { domain, requestId });
            res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Non-video content type blocked', contentType: upstreamCt, domain });
            return;
        }

        // Image handling: allow if from known video CDN (obfuscation), block if from ad CDN
        if (IMAGE_CONTENT_TYPES.some(img => ctLower.includes(img))) {
            const isKnownCdn = Object.keys(proxyCdnConfig).some(key => domain.includes(key));
            const isAdDomain = isAdCdnUrl(url);

            if (isAdDomain) {
                proxyResponse!.data?.resume?.();
                logger.warn(`[PROXY] Blocked ad image segment: ${domain}`, { url: url.substring(0, 100), requestId });
                res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Ad image segment blocked', domain });
                return;
            }

            if (!isKnownCdn) {
                // Potential ad disguised as image on unknown domain - check size
                const size = parseInt(proxyResponse!.headers['content-length'] || '0', 10);
                if (size > 0 && size < 100 * 1024) { // < 100KB on unknown domain
                    proxyResponse!.data?.resume?.();
                    logger.warn(`[PROXY] Blocked small unknown image segment (${size} bytes): ${domain}`, { requestId });
                    res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Small unknown image segment blocked', domain });
                    return;
                }
            }
            
            // It's likely an obfuscated video segment - allow it
            logger.info(`[PROXY] Allowing obfuscated image segment (${upstreamCt}) from ${domain}`, { requestId });
            // Set normalized video content type for the Accept-Ranges check below
            req._normalizedCt = 'video/MP2T';
        }
    }

    const effectiveCt = req._normalizedCt || upstreamCt.toLowerCase();

    if (proxyResponse!.headers['content-length'] && !proxyResponse!.headers['content-encoding']) {
        res.set('Content-Length', proxyResponse!.headers['content-length']);
    }
    if (proxyResponse!.headers['content-range']) res.set('Content-Range', proxyResponse!.headers['content-range']);

    const hasAcceptRanges = proxyResponse!.headers['accept-ranges'];
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

    if (isSegment || (isImage && (isKnownVideoCdn || url.includes('/cdn/')))) {
        // Force video content type for all HLS segments & obfuscated images so HLS.js/Player accepts them without corruption errors
        res.set('Content-Type', 'video/MP2T');
    } else if (isOctetStream) {
        res.set('Content-Type', isVideo ? 'video/mp4' : 'video/MP2T');
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
    // Segments are immutable — same URL always returns the same bytes.
    // immutable tells browsers to never revalidate even on reload.
    res.set('Cache-Control', isSegment || isVideo ? 'public, max-age=86400, immutable' : 'public, max-age=3600');
    if (isSegment && !proxyResponse!.headers['content-length']) {
        res.set('Transfer-Encoding', 'chunked');
    }
    res.status(proxyResponse!.status);

    // Buffer cacheable segments; pipe everything else directly
    if (isSegment && !req.headers.range && proxyResponse!.status === 200) {
        const MAX_CACHE_SEGMENT = 4 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let total = 0;
        let overflow = false;

        proxyResponse!.data.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_CACHE_SEGMENT) { overflow = true; return; }
            chunks.push(chunk);
        });
        proxyResponse!.data.on('end', () => {
            if (!overflow && total > 0) {
                const buf = Buffer.concat(chunks);
                segmentCacheSet(url!, buf, upstreamCt || 'video/MP2T');
            }
        });
        proxyResponse!.data.on('error', (err: Error) => logger.error(`[PROXY] Segment buffer error from ${domain}`, err));
        proxyResponse!.data.pipe(res);
    } else if (isM3u8 && !req.headers.range && proxyResponse!.status === 200) {
        // Cache m3u8 manifests to improve startup performance
        const chunks: Buffer[] = [];
        let total = 0;

        proxyResponse!.data.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            total += chunk.length;
        });
        proxyResponse!.data.on('end', () => {
            if (total > 0 && total < 1024 * 1024) { // Only cache manifests < 1MB
                const manifest = Buffer.concat(chunks).toString('utf-8');
                manifestCacheSet(url!, manifest);
                logger.info(`[PROXY] Manifest cached: ${url!.substring(0, 80)}... (${total} bytes)`, { requestId });
            }
        });
        proxyResponse!.data.on('error', (err: Error) => logger.error(`[PROXY] Manifest buffer error from ${domain}`, err));
        proxyResponse!.data.pipe(res);
    } else {
        proxyResponse!.data.pipe(res);
    }

    proxyResponse!.data.on('error', (err: Error) => {
        logger.error(`[PROXY] Stream error from ${domain}`, err);
        if (!res.headersSent) res.set('Access-Control-Allow-Origin', '*').status(502).json({ error: 'Stream error' });
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

/**
 * @route POST /api/stream/proxy
 * @description Proxy HLS manifests and media segments via POST (for long URLs).
 */
router.post('/proxy', (req, res, next) => {
    // The GET handler now handles both query and body
    const getHandler = router.stack.find(s => s.route?.path === '/proxy' && (s.route as any)?.methods?.get)?.handle;
    if (getHandler) return getHandler(req, res, next);
    res.status(404).end();
});

router.get('/debug/test-sources', async (req: Request, res: Response): Promise<void> => {
    const results: any = {};
    const sm = sourceManager;
    const sourcesToTest = ['Gogoanime', 'AllAnime', '9Anime', 'Aniwaves'];
    
    for (const name of sourcesToTest) {
        const src = sm['sources'].get(name);
        if (!src) {
            results[name] = 'Not registered';
            continue;
        }
        try {
            console.log(`[DEBUG] Testing source ${name}`);
            const searchRes = await src.search('Re Zero', 1);
            results[name] = {
                ok: true,
                count: searchRes.results?.length ?? 0,
                results: searchRes.results?.map((r: any) => ({ id: r.id, title: r.title })) ?? []
            };
        } catch (err: any) {
            results[name] = {
                ok: false,
                error: err.message,
                stack: err.stack,
                code: err.code
            };
        }
    }
    res.json(results);
});

export default router;
