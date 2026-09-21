import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import animeRoutes from './routes/anime.js';
import hentaiRoutes from './routes/hentai.js';
import { start as startHentaiIndex } from './services/hentai-index.js';
import sourcesRoutes from './routes/sources.js';
import streamingRoutes from './routes/streaming.js';
import monitoringRoutes from './routes/monitoring.js';
import { logger, createRequestContext, PerformanceTimer } from './utils/logger.js';
import { reliabilityMiddleware, healthCheckMiddleware } from './middleware/reliability.js';
import { REGISTERED_SOURCE_NAMES } from './registered-sources.js';
import { initDatabase } from './lib/db.js';
import { anilistSlot, anilistThrottled, anilistOk, anilistGap } from './lib/anilist-pace.js';
import { streamExtractor } from './services/stream-extractor.js';
import { SwrCache } from './lib/swr-cache.js';
// Extend Request interface to include id and reliability utilities
interface ExtendedRequest extends Request {
    id: string;
    reliableRequest?: any;
    retry?: any;
    withTimeout?: any;
    withCircuitBreaker?: any;
}

const app = express();
const PORT = process.env.PORT || 3001;

// Performance optimizations
app.set('etag', 'strong');
app.set('x-powered-by', false);

// Behind a reverse proxy (Caddy, nginx, a platform router) every request arrives from
// the proxy's address. Trusting N hops makes req.ip the real client, so per-IP rate
// limits and logs mean something. Off by default — trusting it without a proxy would
// let clients spoof X-Forwarded-For.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isFinite(hops) ? hops : process.env.TRUST_PROXY);
}

// CORS configuration
// Explicitly allow all known frontend origins plus any wildcard from env.
// The safety-net middleware below guarantees headers are present on EVERY response.
const KNOWN_ORIGINS = [
    'https://anifoxwatch.web.app',
    'https://anifoxwatch.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8081',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8081',
];
const CORS_ALLOWED = process.env.CORS_ORIGIN || '*';

const corsOptions: cors.CorsOptions = {
    origin: (requestOrigin, callback) => {
        // Always allow: reflect the requesting origin so browsers accept the response.
        // Known origins are whitelisted explicitly; unknown origins are also allowed
        // for API accessibility (public API).
        if (!requestOrigin) {
            // Non-browser requests (curl, server-to-server) — allow
            callback(null, '*');
        } else if (CORS_ALLOWED === '*' || KNOWN_ORIGINS.includes(requestOrigin)) {
            callback(null, requestOrigin);
        } else {
            // Unknown origin — still allow for public API accessibility
            callback(null, requestOrigin);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID', 'Range', 'Accept'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
    credentials: true,
    maxAge: 86400 // 24 hours preflight cache
};

// CORS safety-net: guarantee Access-Control-Allow-Origin is present on EVERY response.
// This runs BEFORE all routes and middleware to ensure headers are always set
app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    // Set CORS headers FIRST before any processing
    res.set('Access-Control-Allow-Origin', origin || '*');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, Range, Accept');
    res.set('Access-Control-Max-Age', '86400');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Vary', 'Origin');
    
    // Handle preflight OPTIONS immediately
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Reliability middleware with circuit breaker, timeouts, and retries
app.use(reliabilityMiddleware);

// Per-request timeout — must run before route handlers (middleware registered after routes never runs for matched paths).
app.use((req: Request, res: Response, next: NextFunction) => {
    const REQUEST_TIMEOUT_MS = 90_000;
    res.setTimeout(REQUEST_TIMEOUT_MS, () => {
        console.error(`⚠️ Request timeout: ${req.method} ${req.path}`);
        if (!res.headersSent) {
            res.status(504).json({ error: 'Request timeout' });
        }
    });
    next();
});

// Advanced request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    // Add unique request ID
    (req as ExtendedRequest).id = uuidv4();

    const context = createRequestContext(req);
    const timer = new PerformanceTimer(`${req.method} ${req.path}`, context);

    logger.apiRequest(req.method, req.path, context);

    // Log response
    res.on('finish', () => {
        const duration = timer.end();
        const responseContext = { ...context, duration, statusCode: res.statusCode };
        logger.apiResponse(res.statusCode, responseContext);

        // Log slow requests
        if (duration > 2000) {
            logger.warn(`Slow request detected`, responseContext);
        }
    });

    next();
});

// Root — Render and other platforms often probe `/` (HEAD/GET); avoid noisy 404s in logs.
app.get('/', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ ok: true, service: 'anistream-hub-api', docs: '/api', health: '/health' });
});
app.head('/', (_req: Request, res: Response) => {
    res.status(200).end();
});

// Health check endpoint (fast response)
app.get('/health', (_req: Request, res: Response) => {
    // Explicit CORS headers as safety net — this endpoint is probed by the frontend
    const origin = _req.headers.origin;
    res.set('Access-Control-Allow-Origin', origin || '*');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Cache-Control', 'no-cache');
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
    });
});

// API health check endpoint
app.get('/api/health', healthCheckMiddleware);

// Lightweight image proxy — used as a fallback when direct image loads fail (CORS / referrer blocks)
app.get('/api/image-proxy', async (req: Request, res: Response) => {
    const url = req.query.url as string;
    if (!url) { res.status(400).json({ error: 'url param required' }); return; }
    try {
        const { default: axios } = await import('axios');
        const resp = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: { 'Referer': new URL(url).origin, 'User-Agent': 'Mozilla/5.0' },
        });
        const ct = resp.headers['content-type'] || 'image/jpeg';
        res.set('Content-Type', ct);
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(resp.data);
    } catch {
        res.status(502).json({ error: 'Image proxy failed' });
    }
});

// API routes
app.use('/api/anime', animeRoutes);
app.use('/api/hentai', hentaiRoutes);
// Warm the playback index (loads the saved copy, refreshes in the background).
startHentaiIndex();
void import('./services/hentai-catalog.js').then((m) => m.warm());
app.use('/api/sources', sourcesRoutes);
app.use('/api/stream', streamingRoutes);
app.use('/api/monitoring', monitoringRoutes);

// AniList GraphQL proxy — browsers can't call graphql.anilist.co directly due to CORS;
// route all queries through here so they originate from the server.
const ANILIST_CACHE_TTL = 3 * 60 * 1000;
// Detect Render environment for memory optimization
const IS_RENDER = process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL;
const ANILIST_CACHE_MAX = IS_RENDER ? 50 : (process.env.NODE_ENV === 'production' ? 100 : 500); // Lower limit on Render

/**
 * Stale-while-revalidate, because the pace limiter behind this proxy is a process-wide queue and
 * must not sit in front of an answer we already hold. Measured on the live homepage before this:
 * three uncached shelf queries ran strictly back to back for 9.8s, while the other five requests
 * of the same page load finished inside 548ms.
 *
 * Half an hour of stale tolerance against a 3 minute TTL: shelf contents are the same for every
 * visitor and move slowly, so nobody can tell a row is a few minutes old, and everybody can tell
 * when it takes ten seconds. Persisted so the first visitor after an idle restart — which on a
 * free tier is most first visitors — does not pay for a cold cache.
 */
const anilistProxyCache = new SwrCache<unknown>('AniListProxy', {
    ttlMs: ANILIST_CACHE_TTL,
    maxAgeMs: 30 * 60 * 1000,
    maxEntries: ANILIST_CACHE_MAX,
    persistPath: '.cache/anilist-proxy.json',
});

const ANILIST_MAX_RETRIES = 3;

async function executeAnilistRequest(request: any, retryCount = 0): Promise<any> {
    try {
        // One pace for every AniList request this process makes (lib/anilist-pace). This used to be a
        // serial queue with a fixed 1s sleep between requests, so a page needing ten queries waited
        // ten seconds — and it counted only its own traffic against AniList's limit.
        await anilistSlot();
        const { default: axios } = await import('axios');
        const response = await axios.post('https://graphql.anilist.co', request.body, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: 10000,
        });

        if (response.status === 429) {
            if (retryCount < ANILIST_MAX_RETRIES) {
                const backoffTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
                console.log(`[AniList] Rate limited, retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${ANILIST_MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, backoffTime));
                return executeAnilistRequest(request, retryCount + 1);
            }
            throw new Error('AniList rate limit exceeded after retries');
        }

        anilistOk();
        return response.data;
    } catch (error: any) {
        if (error.response?.status === 429) anilistThrottled(parseInt(error.response.headers?.['retry-after'], 10) || undefined);
        if (error.response?.status === 429 && retryCount < ANILIST_MAX_RETRIES) {
            const backoffTime = Math.pow(2, retryCount) * 1000;
            console.log(`[AniList] Rate limited, retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${ANILIST_MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, backoffTime));
            return executeAnilistRequest(request, retryCount + 1);
        }
        throw error;
    }
}

app.post('/api/anilist/graphql', async (req: Request, res: Response): Promise<void> => {
    // Generate better cache key based on query hash (more efficient than full body)
    const query = req.body.query || '';
    const variables = req.body.variables || {};
    const cacheKey = `${query.substring(0, 100)}:${JSON.stringify(variables)}`;

    try {
        const { value, state, ageMs } = await anilistProxyCache.getWithState(cacheKey, () =>
            executeAnilistRequest({ body: req.body })
        );
        res.set('Cache-Control', 'public, max-age=300');
        res.set('X-AniList-Cache', state);
        if (state !== 'MISS') res.set('X-AniList-Cache-Age', String(Math.round(ageMs / 1000)));
        res.json(value);
    } catch (err: unknown) {
        // Only reachable with nothing cached at all: with a stored value, however old, the cache
        // serves it rather than surfacing the failure.
        const axiosErr = err as { response?: { status?: number; data?: unknown } };
        const status = axiosErr?.response?.status || 500;
        res.status(status).json(axiosErr?.response?.data || { error: 'AniList proxy error' });
    }
});

/**
 * Cache effectiveness, so the effect of the SWR layer is something you can read rather than
 * assume. `hitRate` is the share of lookups answered without the caller waiting on AniList.
 */
app.get('/api/anilist/cache-stats', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ anilistProxy: anilistProxyCache.stats(), anilistGapMs: anilistGap() });
});

// API documentation
app.get('/api', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
        name: 'AniStream Hub API',
        version: '1.0.0',
        description: 'Multi-source anime streaming API with real-time video sources',
        endpoints: {
            anime: {
                search: 'GET /api/anime/search?q={query}&page={page}&source={source}',
                searchAll: 'GET /api/anime/search-all?q={query}&page={page}',
                trending: 'GET /api/anime/trending?page={page}&source={source}',
                heroSpotlight: 'GET /api/anime/hero-spotlight — AniList banners + synopsis (Jikan fill-in)',
                latest: 'GET /api/anime/latest?page={page}&source={source}',
                topRated: 'GET /api/anime/top-rated?page={page}&limit={limit}&source={source}',
                details: 'GET /api/anime/:id',
                episodes: 'GET /api/anime/:id/episodes'
            },
            streaming: {
                servers: 'GET /api/stream/servers/:episodeId',
                watch: 'GET /api/stream/watch/:episodeId?server={server}',
                proxy: 'GET /api/stream/proxy?url={hlsUrl}'
            },
            sources: {
                list: 'GET /api/sources',
                health: 'GET /api/sources/health',
                check: 'POST /api/sources/check',
                setPreferred: 'POST /api/sources/preferred'
            }
        },
        availableSources: [...REGISTERED_SOURCE_NAMES]
    });
});

// 404 handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler with advanced logging
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const context = createRequestContext(req);
    logger.error('Unhandled error', err, context);

    // Don't crash the server on errors, just log and respond
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
        requestId: (req as ExtendedRequest).id
    });
});

// ============================================
// PROCESS CRASH PROTECTION
// ============================================

// Prevent uncaught exceptions from killing the process
process.on('uncaughtException', (err: Error) => {
    console.error('⚠️ UNCAUGHT EXCEPTION (process kept alive):', err.message);
    console.error(err.stack);
    logger.error('Uncaught exception', err, { fatal: false });
});

// Prevent unhandled promise rejections from killing the process
process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('⚠️ UNHANDLED REJECTION (process kept alive):', message);
    logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(message), { fatal: false });
});

// Start server
let activeServer: ReturnType<typeof app.listen> | null = null;

const startServer = async (port: number) => {
    // Initialize database in background (non-blocking)
    if (process.env.POSTGRES_URL) {
        initDatabase().catch(error => {
            console.error('❌ Failed to initialize database:', error);
        });
    } else {
        console.log('⚠️  POSTGRES_URL not set - using in-memory caching only');
    }

    // Behind the Rust data plane (see deploy/start.sh) this binds loopback, so the proxy is the
    // only public listener and nothing can reach the API by skipping it. Unset, it binds all
    // interfaces as before, which is what a single-process deployment needs.
    const host = process.env.HOST;
    const onListening = () => {
        const isProduction = process.env.NODE_ENV === 'production';
        const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

        console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🎬 AniStream Hub API Server v1.0.0                             ║
║   ───────────────────────────────────────                        ║
║   Server: ${baseUrl}                                ║
║   API Docs: ${baseUrl}/api                          ║
║   Health: ${baseUrl}/api/health                       ║
║   Port: ${port} ${isProduction ? '(Production)' : '(Local)'}                 ║
║                                                                  ║
║   ⚡ Features:                                                    ║
║   • Real-time streaming URLs                                     ║
║   • Auto-failover between sources                                ║
║   • In-memory caching for speed                                  ║
║   • HLS proxy for CORS                                           ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
        `);
        console.log(`📡 Registered sources (same as SourceManager constructor): ${REGISTERED_SOURCE_NAMES.join(' → ')}`);
        // Pre-warm Puppeteer (used by Aniwaves embed extractor) in the background so the
        // first /api/stream/watch request does not block on browser launch (~10–15 s cold start).
        // Not on Render's free tier: there it competes with boot for a fraction of a CPU and
        // ~512 MB, times out, and — worse — holds Chromium's memory for sources that mostly
        // don't need it. The browser starts on demand instead. PUPPETEER_WARMUP=true forces it.
        if (process.env.PUPPETEER_WARMUP === 'true' || !(process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL)) {
            void streamExtractor.warmBrowser();
        }
    };

    const server = host ? app.listen(port, host, onListening) : app.listen(port, onListening);

    // Connection timeout settings to prevent hanging connections
    server.keepAliveTimeout = 65000; // Slightly higher than typical LB timeout (60s)
    server.headersTimeout = 70000; // Must be higher than keepAliveTimeout
    server.timeout = 300000; // 5 min max request time (increased from 2 min)
    server.maxConnections = 1000; // Increased from 500

    activeServer = server;

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            console.error(
                `❌ Port ${port} is already in use. Another process is bound to this port, so the API cannot start.\n` +
                    `Fix: stop the other listener on port ${port} (netstat -ano | findstr :${port}) or run 'npm run dev' which kills it automatically.`
            );
            process.exit(1);
        } else {
            console.error('SERVER ERROR:', err);
            // Don't exit on other errors, keep server alive
        }
    });

    // Self-ping keep-alive to prevent idle shutdown on Render/Koyeb/Clever Cloud free tiers
    if (process.env.NODE_ENV === 'production') {
        const externalUrl =
            process.env.RENDER_EXTERNAL_URL ||
            process.env.CLEVER_APP_URL ||
            process.env.BASE_URL;
        const KEEP_ALIVE_INTERVAL = 3 * 60 * 1000; // 3 minutes — keeps origin warm

        if (!externalUrl) {
            // Idle shutdown is decided by traffic arriving at the platform's router, so a ping
            // to our own loopback address is invisible to it: it keeps nothing awake and only
            // makes the logs look as though something is. Say so rather than pretending to work
            // — the fix is to set RENDER_EXTERNAL_URL (or BASE_URL) to the public URL.
            console.log(
                '🏓 Keep-alive disabled: no external URL configured. A loopback self-ping cannot ' +
                'prevent idle shutdown — set RENDER_EXTERNAL_URL or BASE_URL to the public URL.'
            );
        } else {
            setInterval(async () => {
                try {
                    const res = await fetch(`${externalUrl}/health`);
                    console.log(`🏓 Keep-alive ping: ${res.status}`);
                } catch (err) {
                    console.log(`🏓 Keep-alive ping failed (non-fatal): ${(err as Error).message}`);
                }
            }, KEEP_ALIVE_INTERVAL);
            console.log(`🏓 Keep-alive pinger started for ${externalUrl} (every ${KEEP_ALIVE_INTERVAL / 60000} min)`);
        }
    }
};

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    if (activeServer) {
        activeServer.close(() => {
            console.log('✅ Server closed. Exiting.');
            process.exit(0);
        });
        // Force exit after 10s if connections don't close
        setTimeout(() => {
            console.log('⚠️ Forcing exit after timeout');
            process.exit(1);
        }, 10000).unref();
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export app for Vercel serverless function
export default app;

// Start server for development (only when run directly)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startServer(Number(PORT));
}

