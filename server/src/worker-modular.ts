import './polyfills.js';
import { Hono } from 'hono';
import { logger } from './utils/logger.js';
import { SourceManager } from './services/source-manager.js';
import { createAnimeRoutes } from './routes-worker/anime-routes.js';
import { createStreamingRoutes } from './routes-worker/streaming-routes.js';
import { createSourcesRoutes } from './routes-worker/sources-routes.js';

/**
 * Modular Cloudflare Worker
 * Uses the same route structure as the Express server
 * 
 * This worker imports routes dynamically and only includes what's needed,
 * making it maintainable and avoiding code duplication.
 */

const app = new Hono();

// Initialize SourceManager (shared instance)
const sourceManager = new SourceManager();

logger.info('Cloudflare Worker initialized with modular routing', undefined, 'Worker');

// ============================================
// CORS Middleware
// ============================================
app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    
    if (c.req.method === 'OPTIONS') {
        return new Response(null, { status: 204 });
    }
    
    await next();
});

// ============================================
// Health Check
// ============================================
app.get('/health', (c) => c.json({
    status: 'healthy',
    environment: 'cloudflare-workers',
    timestamp: new Date().toISOString(),
    version: '1.0.0-modular'
}));

// ============================================
// API Documentation
// ============================================
app.get('/api', (c) => c.json({
    name: 'AniStream Hub API',
    version: '1.0.0-worker-modular',
    description: 'Modular Cloudflare Worker with dynamic route loading',
    architecture: 'Mirrors Express server structure for maintainability',
    endpoints: {
        anime: {
            search: 'GET /api/anime/search?q={query}&page={page}&source={source}&mode={mode}',
            searchAll: 'GET /api/anime/search-all?q={query}&page={page}',
            trending: 'GET /api/anime/trending?page={page}&source={source}',
            latest: 'GET /api/anime/latest?page={page}&source={source}',
            topRated: 'GET /api/anime/top-rated?page={page}&limit={limit}&source={source}',
            schedule: 'GET /api/anime/schedule?start_date={date}&end_date={date}&page={page}',
            leaderboard: 'GET /api/anime/leaderboard?page={page}&type={trending|top-rated}',
            seasonal: 'GET /api/anime/seasonal?year={year}&season={season}&page={page}',
            genre: 'GET /api/anime/genre/{genre}?page={page}&source={source}',
            genreAnilist: 'GET /api/anime/genre-anilist/{genre}?page={page}',
            filter: 'GET /api/anime/filter?type={type}&genre={genre}&status={status}&year={year}',
            browse: 'GET /api/anime/browse?type={type}&genres={genres}&sort={sort}&mode={mode}',
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
        }
    },
    availableSources: ['HiAnimeDirect', 'HiAnime', 'Gogoanime', '9Anime', 'Aniwave', 'Aniwatch', 'Consumet', 'WatchHentai']
}));

// ============================================
// Mount Route Modules
// ============================================

// Anime routes
const animeRoutes = createAnimeRoutes(sourceManager);
app.route('/api/anime', animeRoutes);

// Streaming routes
const streamingRoutes = createStreamingRoutes(sourceManager);
app.route('/api/stream', streamingRoutes);

// Sources routes
const sourcesRoutes = createSourcesRoutes(sourceManager);
app.route('/api/sources', sourcesRoutes);

logger.info('All route modules loaded successfully', {
    routes: ['anime', 'streaming', 'sources']
}, 'Worker');

// ============================================
// Cloudflare Workers Entrypoint
// ============================================
export default {
    fetch: (request: Request, env: any, ctx: any) => {
        return app.fetch(request, env, ctx);
    }
};
