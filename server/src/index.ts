import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import animeRoutes from './routes/anime.js';
import sourcesRoutes from './routes/sources.js';
import streamingRoutes from './routes/streaming.js';
import { logger, createRequestContext, PerformanceTimer } from './utils/logger.js';
import { reliabilityMiddleware, healthCheckMiddleware } from './middleware/reliability.js';
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

// CORS configuration
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400 // 24 hours preflight cache
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Compression for responses
app.use((req: Request, res: Response, next: NextFunction) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    next();
});

// Reliability middleware with circuit breaker, timeouts, and retries
app.use(reliabilityMiddleware);

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

// Health check endpoint (fast response)
app.get('/health', (_req: Request, res: Response) => {
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

// API routes
app.use('/api/anime', animeRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/stream', streamingRoutes);

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
        availableSources: ['9Anime', 'Aniwave', 'Aniwatch', 'Gogoanime', 'Consumet', 'Jikan']
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

const startServer = (port: number) => {
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
║   📡 Streaming Sources (Priority Order):                         ║
║   • HiAnimeDirect - Primary, HD Sub/Dub (Most Reliable)          ║
║   • HiAnime - Backup, HD Sub/Dub                                 ║
║   • Gogoanime - Fallback, Sub/Dub                                ║
║   • 9Anime - Fallback, HD Sub/Dub                                ║
║   • + 24 more backup sources for failover                        ║
║   • Consumet - Multi-provider aggregator                         ║
║                                                                  ║
║   ⚡ Features:                                                    ║
║   • Real-time streaming URLs                                     ║
║   • Auto-failover between sources                                ║
║   • In-memory caching for speed                                  ║
║   • HLS proxy for CORS                                           ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
        `);
    });

    // Connection timeout settings to prevent hanging connections
    server.keepAliveTimeout = 65000; // Slightly higher than typical LB timeout (60s)
    server.headersTimeout = 70000; // Must be higher than keepAliveTimeout
    server.timeout = 120000; // 2 min max request time
    server.maxConnections = 500;

    activeServer = server;

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('SERVER ERROR:', err);
        }
    });

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
};

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

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

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startServer(Number(PORT));
}

export default app;

