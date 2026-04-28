import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import animeRoutes from './routes/anime.js';
import sourcesRoutes from './routes/sources.js';
import streamingRoutes from './routes/streaming.js';
import hianimeRestProxyRoutes from './routes/hianime-rest-proxy.js';
import monitoringRoutes from './routes/monitoring.js';
import { logger, createRequestContext, PerformanceTimer } from './utils/logger.js';
import { reliabilityMiddleware, healthCheckMiddleware } from './middleware/reliability.js';
import { REGISTERED_SOURCE_NAMES } from './registered-sources.js';
import { initDatabase } from './lib/db.js';
const app = express();
const PORT = process.env.PORT || 3001;
// Performance optimizations
app.set('etag', 'strong');
app.set('x-powered-by', false);
// CORS configuration
// Explicitly allow all known frontend origins plus any wildcard from env.
// The safety-net middleware below guarantees headers are present on EVERY response.
const KNOWN_ORIGINS = [
    'https://anifoxwatch.web.app',
    'https://anifoxwatch.firebaseapp.com',
    'https://anifox-frontend.onrender.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:5173',
];
const CORS_ALLOWED = process.env.CORS_ORIGIN || '*';
const corsOptions = {
    origin: (requestOrigin, callback) => {
        // Always allow: reflect the requesting origin so browsers accept the response.
        // Known origins are whitelisted explicitly; unknown origins are also allowed
        // for API accessibility (public API).
        if (!requestOrigin) {
            // Non-browser requests (curl, server-to-server) — allow
            callback(null, '*');
        }
        else if (CORS_ALLOWED === '*' || KNOWN_ORIGINS.includes(requestOrigin)) {
            callback(null, requestOrigin);
        }
        else {
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
app.use((req, res, next) => {
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
// Advanced request logging middleware
app.use((req, res, next) => {
    // Add unique request ID
    req.id = uuidv4();
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
app.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ ok: true, service: 'anistream-hub-api', docs: '/api', health: '/health' });
});
app.head('/', (_req, res) => {
    res.status(200).end();
});
// Health check endpoint (fast response)
app.get('/health', (_req, res) => {
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
app.get('/api/image-proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        res.status(400).json({ error: 'url param required' });
        return;
    }
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
    }
    catch {
        res.status(502).json({ error: 'Image proxy failed' });
    }
});
// API routes
app.use('/api/anime', animeRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/stream', streamingRoutes);
app.use('/api/hianime-rest', hianimeRestProxyRoutes);
app.use('/api/monitoring', monitoringRoutes);
// AniList GraphQL proxy — browsers can't call graphql.anilist.co directly due to CORS;
// route all queries through here so they originate from the server.
app.post('/api/anilist/graphql', async (req, res) => {
    try {
        const { default: axios } = await import('axios');
        const response = await axios.post('https://graphql.anilist.co', req.body, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: 10000,
        });
        res.set('Cache-Control', 'public, max-age=300');
        res.json(response.data);
    }
    catch (err) {
        const status = err?.response?.status || 500;
        res.status(status).json(err?.response?.data || { error: 'AniList proxy error' });
    }
});
// API documentation
app.get('/api', (_req, res) => {
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
            hianimeRest: {
                episodeServers: 'GET /api/hianime-rest/episode/servers?animeEpisodeId={slug?ep=id}',
                episodeSources: 'GET /api/hianime-rest/episode/sources?animeEpisodeId={slug?ep=id}&server=&category='
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
app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});
// Error handler with advanced logging
app.use((err, req, res, _next) => {
    const context = createRequestContext(req);
    logger.error('Unhandled error', err, context);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
        requestId: req.id
    });
});
// ============================================
// PROCESS CRASH PROTECTION
// ============================================
// Prevent uncaught exceptions from killing the process
process.on('uncaughtException', (err) => {
    console.error('⚠️ UNCAUGHT EXCEPTION (process kept alive):', err.message);
    console.error(err.stack);
    logger.error('Uncaught exception', err, { fatal: false });
});
// Prevent unhandled promise rejections from killing the process
process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('⚠️ UNHANDLED REJECTION (process kept alive):', message);
    logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(message), { fatal: false });
});
// Start server
let activeServer = null;
const startServer = async (port) => {
    // Initialize database in background (non-blocking)
    if (process.env.POSTGRES_URL) {
        initDatabase().catch(error => {
            console.error('❌ Failed to initialize database:', error);
        });
    }
    else {
        console.log('⚠️  POSTGRES_URL not set - using in-memory caching only');
    }
    const server = app.listen(port, () => {
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
    });
    // Connection timeout settings to prevent hanging connections
    server.keepAliveTimeout = 65000; // Slightly higher than typical LB timeout (60s)
    server.headersTimeout = 70000; // Must be higher than keepAliveTimeout
    server.timeout = 120000; // 2 min max request time
    server.maxConnections = 500;
    activeServer = server;
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            // Auto-incrementing ports breaks the Vite dev proxy (defaults to :3001) and looks like random 500s.
            // Opt in only when you intentionally run off-default and will point Vite at `VITE_API_PROXY_TARGET`.
            if (process.env.ALLOW_PORT_FALLBACK !== '1') {
                console.error(`❌ Port ${port} is already in use. Another process is bound to this port, so the API cannot start.\n` +
                    `Fix: stop the other listener on port ${port}, or set PORT to a free port and set Vite's VITE_API_PROXY_TARGET / VITE_API_PROXY_PORT to match.\n` +
                    `Rare escape hatch: ALLOW_PORT_FALLBACK=1`);
                process.exit(1);
            }
            console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
            startServer(port + 1);
        }
        else {
            console.error('SERVER ERROR:', err);
        }
    });
    // Self-ping keep-alive to prevent idle shutdown on Render/Koyeb free tier
    if (process.env.NODE_ENV === 'production') {
        const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${port}`;
        const KEEP_ALIVE_INTERVAL = 3 * 60 * 1000; // 3 minutes — keeps Render warm (idles after ~15 min)
        setInterval(async () => {
            try {
                const res = await fetch(`${BASE_URL}/health`);
                console.log(`🏓 Keep-alive ping: ${res.status}`);
            }
            catch (err) {
                console.log(`🏓 Keep-alive ping failed (non-fatal): ${err.message}`);
            }
        }, KEEP_ALIVE_INTERVAL);
        console.log(`🏓 Keep-alive pinger started (every ${KEEP_ALIVE_INTERVAL / 60000} min)`);
    }
};
// ============================================
// GRACEFUL SHUTDOWN
// ============================================
const gracefulShutdown = (signal) => {
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
    }
    else {
        process.exit(0);
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startServer(Number(PORT));
}
export default app;
//# sourceMappingURL=index.js.map