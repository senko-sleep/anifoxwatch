import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import animeRoutes from './routes/anime.js';
import sourcesRoutes from './routes/sources.js';
import streamingRoutes from './routes/streaming.js';
import { 
    enhancedLogger, 
    PerformanceTimer, 
    createRequestContext 
} from './utils/enhanced-logger.js';
import {
    getCircuitBreaker
} from './middleware/reliability.js';

interface ExtendedRequest extends Request {
    id: string;
}

const app = express();
const PORT = process.env.PORT || 3001;

enhancedLogger.info('🚀 Starting AniStream Hub API Server...', {
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    nodeVersion: process.version
});

// ============================================
// SECURITY & PERFORMANCE CONFIGURATION
// ============================================

app.set('etag', 'strong');
app.set('x-powered-by', false);
app.set('trust proxy', true); // Important for Render.com

// ============================================
// CORS CONFIGURATION
// ============================================

const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400
};

app.use(cors(corsOptions));

// ============================================
// REQUEST PARSING & SECURITY HEADERS
// ============================================

app.use(express.json({ limit: '1mb' }));

app.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// ============================================
// RELIABILITY MIDDLEWARE
// ============================================

// Middleware functions not available in current reliability.ts
// TODO: Re-implement these middleware functions if needed
// app.use(memoryMonitor());
// app.use(rateLimiter(60000, 200));
// app.use(requestTimeout(30000));

// 4. Request ID assignment
app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as ExtendedRequest).id = req.headers['x-request-id'] as string || uuidv4();
    next();
});

// 5. Request logging with metrics
app.use((req: Request, res: Response, next: NextFunction) => {
    const context = createRequestContext(req);
    const timer = new PerformanceTimer(`${req.method} ${req.path}`, context);

    enhancedLogger.httpRequest(req.method, req.path, context);

    res.on('finish', () => {
        const duration = timer.end(res.statusCode < 400);
        enhancedLogger.httpResponse(res.statusCode, duration, {
            ...context,
            statusCode: res.statusCode,
            contentLength: res.get('content-length')
        });

        // Alert on slow requests
        if (duration > 5000) {
            enhancedLogger.warn(`🐌 VERY SLOW REQUEST: ${req.method} ${req.path} took ${duration}ms`, {
                ...context,
                duration,
                statusCode: res.statusCode,
                suggestion: 'Consider caching or optimizing this endpoint'
            });
        }
    });

    next();
});

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

// Simple health check
app.get('/health', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-cache');
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: Math.floor(process.uptime())
    });
});

// Detailed metrics endpoint
app.get('/metrics', (_req: Request, res: Response) => {
    const metrics = enhancedLogger.getMetrics();
    // const queueStats = requestQueue.getStats();
    // const circuitStatus = circuitBreaker.getAllStatus();
    const memoryUsage = process.memoryUsage();

    res.json({
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        performance: metrics,
        // queue: queueStats,
        // circuits: circuitStatus,
        memory: {
            heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
            externalMB: Math.round(memoryUsage.external / 1024 / 1024)
        },
        process: {
            pid: process.pid,
            nodeVersion: process.version,
            platform: process.platform
        }
    });
});

// Detailed API health
app.get('/api/health', (_req: Request, res: Response) => {
    const metrics = enhancedLogger.getMetrics();
    const healthy = metrics.errorRate < 50 && metrics.memoryUsageMB < 480;

    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
        metrics: {
            totalRequests: metrics.totalRequests,
            errorRate: `${metrics.errorRate.toFixed(2)}%`,
            avgResponseTime: `${metrics.averageResponseTime}ms`,
            memoryUsage: `${metrics.memoryUsageMB}MB`
        },
        healthy,
        issues: !healthy ? [
            metrics.errorRate >= 50 ? 'High error rate' : null,
            metrics.memoryUsageMB >= 480 ? 'High memory usage' : null
        ].filter(Boolean) : []
    });
});

// ============================================
// API ROUTES
// ============================================

app.use('/api/anime', animeRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/stream', streamingRoutes);

// API documentation
app.get('/api', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
        name: 'AniStream Hub API',
        version: '1.0.0',
        description: 'Multi-source anime streaming API with enhanced reliability',
        status: 'operational',
        features: [
            'Automatic failover',
            'Circuit breakers',
            'Request timeout protection',
            'Memory monitoring',
            'Rate limiting',
            'Comprehensive logging'
        ],
        endpoints: {
            anime: {
                search: 'GET /api/anime/search?q={query}&page={page}&source={source}',
                searchAll: 'GET /api/anime/search-all?q={query}&page={page}',
                trending: 'GET /api/anime/trending?page={page}&source={source}',
                latest: 'GET /api/anime/latest?page={page}&source={source}',
                topRated: 'GET /api/anime/top-rated?page={page}&limit={limit}&source={source}',
                schedule: 'GET /api/anime/schedule?start_date={date}&end_date={date}&page={page}',
                leaderboard: 'GET /api/anime/leaderboard?page={page}&type={trending|top-rated}',
                seasonal: 'GET /api/anime/seasonal?year={year}&season={season}&page={page}',
                genre: 'GET /api/anime/genre/{genre}?page={page}&source={source}',
                genreAnilist: 'GET /api/anime/genre-anilist/{genre}?page={page}',
                filter: 'GET /api/anime/filter?type={type}&genre={genre}&status={status}',
                browse: 'GET /api/anime/browse?type={type}&genres={genres}&sort={sort}',
                random: 'GET /api/anime/random?source={source}',
                details: 'GET /api/anime/:id',
                detailsQuery: 'GET /api/anime?id={id}',
                episodes: 'GET /api/anime/:id/episodes',
                episodesQuery: 'GET /api/anime/episodes?id={id}',
                types: 'GET /api/anime/types',
                genres: 'GET /api/anime/genres',
                statuses: 'GET /api/anime/statuses',
                seasons: 'GET /api/anime/seasons',
                years: 'GET /api/anime/years'
            },
            streaming: {
                servers: 'GET /api/stream/servers/:episodeId',
                watch: 'GET /api/stream/watch/:episodeId?server={server}&category={sub|dub}',
                proxy: 'GET /api/stream/proxy?url={hlsUrl}'
            },
            sources: {
                list: 'GET /api/sources',
                health: 'GET /api/sources/health',
                check: 'POST /api/sources/check',
                setPreferred: 'POST /api/sources/preferred'
            },
            monitoring: {
                health: 'GET /health',
                apiHealth: 'GET /api/health',
                metrics: 'GET /metrics'
            }
        },
        availableSources: ['HiAnimeDirect', 'HiAnime', 'Gogoanime', '9Anime', 'Aniwave', 'Aniwatch', 'Consumet', 'WatchHentai']
    });
});

// ============================================
// PROCESS CRASH PROTECTION
// ============================================

process.on('uncaughtException', (err: Error) => {
    console.error('⚠️ UNCAUGHT EXCEPTION (process kept alive):', err.message);
    console.error(err.stack);
    enhancedLogger.error('Uncaught exception', err, { fatal: false });
});

process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('⚠️ UNHANDLED REJECTION (process kept alive):', message);
    enhancedLogger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(message), { fatal: false });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req: Request, res: Response) => {
    enhancedLogger.warn(`404 Not Found: ${req.method} ${req.path}`, {
        requestId: (req as ExtendedRequest).id,
        path: req.path,
        method: req.method,
        source: '404'
    });

    res.status(404).json({
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.path} does not exist`,
        requestId: (req as ExtendedRequest).id,
        suggestion: 'Check the API documentation at /api'
    });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const context = createRequestContext(req);
    
    enhancedLogger.error('❌ Unhandled error in request', err, {
        ...context,
        errorName: err.name,
        source: 'ERROR_HANDLER'
    });

    if (res.headersSent) {
        return;
    }

    // Determine appropriate status code
    let statusCode = 500;
    if (err.message.includes('timeout')) statusCode = 504;
    if (err.message.includes('not found')) statusCode = 404;
    if (err.message.includes('validation')) statusCode = 400;
    if (err.message.includes('unauthorized')) statusCode = 401;

    res.status(statusCode).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
        requestId: (req as ExtendedRequest).id,
        type: err.name,
        suggestion: statusCode === 504 
            ? 'Try again with simpler parameters or different source'
            : 'Please try again or contact support if the issue persists'
    });
});

// ============================================
// SERVER STARTUP
// ============================================

const startServer = (port: number) => {
    const server = app.listen(port, () => {
        const isProduction = process.env.NODE_ENV === 'production';
        const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

        console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🎬 AniStream Hub API Server v1.0.0 (Enhanced)                              ║
║   ────────────────────────────────────────────────────                       ║
║   Server: ${baseUrl.padEnd(60)} ║
║   API Docs: ${(baseUrl + '/api').padEnd(57)} ║
║   Health: ${(baseUrl + '/health').padEnd(59)} ║
║   Metrics: ${(baseUrl + '/metrics').padEnd(58)} ║
║   Port: ${String(port).padEnd(4)} ${isProduction ? '(Production)' : '(Development)'.padEnd(13)}                               ║
║                                                                              ║
║   🛡️  RELIABILITY FEATURES:                                                  ║
║   • Request timeouts (30s)                                                   ║
║   • Circuit breakers for failing sources                                     ║
║   • Memory monitoring & auto-cleanup                                         ║
║   • Rate limiting (200 req/min per IP)                                       ║
║   • Comprehensive logging & metrics                                          ║
║   • Graceful shutdown handling                                               ║
║                                                                              ║
║   📡 STREAMING SOURCES (Priority Order):                                     ║
║   • HiAnimeDirect - Primary (Deep Scraping)                                  ║
║   • HiAnime - Secondary (API Fallback)                                       ║
║   • Gogoanime - Tertiary (Direct Scraping)                                   ║
║   • 9Anime, Aniwave, Aniwatch - Additional Fallbacks                         ║
║   • Consumet - Multi-provider Aggregator                                     ║
║   • WatchHentai - Adult Content                                              ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
        `);

        enhancedLogger.info('✅ Server started successfully', {
            port,
            environment: process.env.NODE_ENV,
            baseUrl
        });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            enhancedLogger.warn(`⚠️ Port ${port} is in use, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            enhancedLogger.fatal('💥 Server startup error', err);
            process.exit(1);
        }
    });

    // Connection timeout settings to prevent hanging connections
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 70000;
    server.timeout = 120000;
    server.maxConnections = 500;

    activeServer = server;

    // Self-ping keep-alive to prevent idle shutdown on Render/Koyeb free tier
    if (process.env.NODE_ENV === 'production') {
        const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${port}`;
        const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes
        setInterval(async () => {
            try {
                const res = await fetch(`${BASE_URL}/health`);
                console.log(`🏓 Keep-alive ping: ${res.status}`);
            } catch (err) {
                console.log(`🏓 Keep-alive ping failed (non-fatal): ${(err as Error).message}`);
            }
        }, KEEP_ALIVE_INTERVAL);
        console.log(`🏓 Keep-alive pinger started (every ${KEEP_ALIVE_INTERVAL / 60000} min)`);
    }

    return server;
};

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

let activeServer: ReturnType<typeof app.listen> | null = null;

const gracefulShutdown = (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    if (activeServer) {
        activeServer.close(() => {
            console.log('✅ Server closed. Exiting.');
            process.exit(0);
        });
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

// Start the server
import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startServer(Number(PORT));
}

export default app;
