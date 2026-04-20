import './polyfills.js';
import { Hono } from 'hono';
import { HiAnime } from 'aniwatch';
import { logger } from './utils/logger.js';
import { CloudflareSourceManager } from './services/source-manager-cloudflare.js';
import { REGISTERED_SOURCE_NAMES } from './registered-sources.js';
import { createAnimeRoutes } from './routes-worker/anime-routes.js';
import { createStreamingRoutes } from './routes-worker/streaming-routes.js';
import { createHianimeRestProxyRoutes } from './routes-worker/hianime-rest-proxy-routes.js';
import { createSourcesRoutes } from './routes-worker/sources-routes.js';
import { reliableRequest, getCircuitBreakerStates } from './utils/workers-reliability.js';

/**
 * Modular Cloudflare Worker
 * Uses CloudflareSourceManager with fetch-based sources for Workers compatibility
 * No Node.js dependencies (axios, http.Agent, aniwatch package) required
 */

const app = new Hono();
const hianime = new HiAnime.Scraper();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function createCacheKey(path: string, params: Record<string, string>): string {
    return `${path}:${Object.entries(params).sort().join('&')}`;
}

function parsePage(query: Record<string, string>, defaultPage = 1): number {
    const page = query.page;
    if (!page) return defaultPage;
    const parsed = parseInt(page, 10);
    return isNaN(parsed) ? defaultPage : parsed;
}

// Initialize CloudflareSourceManager (uses fetch-based sources)
const sourceManager = new CloudflareSourceManager();

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
    version: '1.0.0-modular',
    circuitBreakers: getCircuitBreakerStates()
}));

// ============================================
// Image Proxy (fallback for CORS / referrer-blocked images)
// ============================================
app.get('/api/image-proxy', async (c) => {
    const url = c.req.query('url');
    if (!url) return c.json({ error: 'url param required' }, 400);
    try {
        const resp = await fetch(url, {
            headers: {
                'Referer': new URL(url).origin,
                'User-Agent': 'Mozilla/5.0',
            },
        });
        if (!resp.ok) return c.json({ error: 'Image proxy failed' }, 502);
        const ct = resp.headers.get('content-type') || 'image/jpeg';
        return new Response(resp.body, {
            status: 200,
            headers: {
                'Content-Type': ct,
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch {
        return c.json({ error: 'Image proxy failed' }, 502);
    }
});

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
        hianimeRest: {
            episodeSources:
                'GET /api/hianime-rest/episode/sources?animeEpisodeId={slug?ep=id}&server={hd-1|...}&category={sub|dub}'
        },
        sources: {
            list: 'GET /api/sources',
            health: 'GET /api/sources/health',
            check: 'POST /api/sources/check',
            setPreferred: 'POST /api/sources/preferred'
        }
    },
    availableSources: [...REGISTERED_SOURCE_NAMES],
    note: 'Worker uses CloudflareSourceManager; `availableSources` matches Express `npm run dev` registry.'
}));

// ============================================
// Mount Route Modules (registered FIRST so /api/anime/* routes win over HiAnime /:id catch-all)
// ============================================

const animeRoutes = createAnimeRoutes(sourceManager);
app.route('/api/anime', animeRoutes);

const streamingRoutes = createStreamingRoutes(sourceManager, hianime);
app.route('/api/stream', streamingRoutes);

const hianimeRestProxyRoutes = createHianimeRestProxyRoutes();
app.route('/api/hianime-rest', hianimeRestProxyRoutes);

const sourcesRoutes = createSourcesRoutes(sourceManager);
app.route('/api/sources', sourcesRoutes);

logger.info('All route modules loaded successfully', {
    routes: ['anime', 'streaming', 'hianime-rest', 'sources', 'hianime']
}, 'Worker');

// ============================================
// HiAnime direct routes (for streaming; note: these use HiAnime slug IDs, not AniList IDs)
// Mounted AFTER modular routes so /api/anime/* handlers above take priority
// ============================================

app.get('/api/home', async (c) => {
    const page = parsePage(c.req.query());
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getHomePage',
            () => hianime.getHomePage(),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/search', async (c) => {
    const query = c.req.query('q') || '';
    const page = parsePage(c.req.query());
    try {
        const data = await reliableRequest(
            'HiAnime',
            'search',
            () => hianime.search(query, page),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/azlist/:sortOption', async (c) => {
    const sortOption = c.req.param('sortOption');
    const page = parsePage(c.req.query());
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getAZList',
            () => hianime.getAZList(sortOption as any, page),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/qtip/:animeId', async (c) => {
    const animeId = c.req.param('animeId');
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getQtipInfo',
            () => hianime.getQtipInfo(animeId),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/category/:name', async (c) => {
    const categoryName = c.req.param('name');
    const page = parsePage(c.req.query());
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getCategoryAnime',
            () => hianime.getCategoryAnime(categoryName as any, page),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/genre/:name', async (c) => {
    const genreName = c.req.param('name');
    const page = parsePage(c.req.query());
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getGenreAnime',
            () => hianime.getGenreAnime(genreName, page),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/producer/:name', async (c) => {
    const producerName = c.req.param('name');
    const page = parsePage(c.req.query());
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getProducerAnimes',
            () => hianime.getProducerAnimes(producerName, page),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/schedule', async (c) => {
    const date = c.req.query('date') || '';
    const tzOffset = parseInt(c.req.query('tzOffset') || '-330', 10);
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getEstimatedSchedule',
            () => hianime.getEstimatedSchedule(date, tzOffset),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/search/suggestion', async (c) => {
    const query = c.req.query('q') || '';
    try {
        const data = await reliableRequest(
            'HiAnime',
            'searchSuggestions',
            () => hianime.searchSuggestions(query),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/hianime/:animeId', async (c) => {
    const animeId = c.req.param('animeId');
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getInfo',
            () => hianime.getInfo(animeId),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/episode/servers', async (c) => {
    const animeEpisodeId = c.req.query('animeEpisodeId') || '';
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getEpisodeServers',
            () => hianime.getEpisodeServers(animeEpisodeId),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/episode/sources', async (c) => {
    const animeEpisodeId = c.req.query('animeEpisodeId') || '';
    const server = (c.req.query('server') || 'vidstreaming') as any;
    const category = (c.req.query('category') || 'sub') as 'sub' | 'dub' | 'raw';
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getEpisodeSources',
            () => hianime.getEpisodeSources(animeEpisodeId, server, category),
            { maxAttempts: 2, timeout: 15000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/hianime/:animeId/episodes', async (c) => {
    const animeId = c.req.param('animeId');
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getEpisodes',
            () => hianime.getEpisodes(animeId),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

app.get('/api/hianime/:animeId/next-episode-schedule', async (c) => {
    const animeId = c.req.param('animeId');
    try {
        const data = await reliableRequest(
            'HiAnime',
            'getNextEpisodeSchedule',
            () => hianime.getNextEpisodeSchedule(animeId),
            { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
        );
        return c.json({ status: 200, data });
    } catch (e: any) {
        return c.json({ status: 500, error: e.message }, 500);
    }
});

// ============================================
// Cloudflare Workers Entrypoint
// ============================================
export default {
    fetch: (request: Request, env: any, ctx: any) => {
        return app.fetch(request, env, ctx);
    }
};
