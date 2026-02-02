import './polyfills.js';
import { Hono } from 'hono';
import { logger } from './utils/logger.js';
import { SourceManager } from './services/source-manager.js';

const app = new Hono();
// Initialize SourceManager
// Note: In Cloudflare Workers, this instance might be recreated per request or reused.
// The internal caching of SourceManager will work for the lifetime of the hot worker.
const sourceManager = new SourceManager();

// CORS
app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    if (c.req.method === 'OPTIONS') {
        return c.text('', 204);
    }
    await next();
});

// Health Check
app.get('/health', (c) => c.json({
    status: 'healthy',
    environment: 'cloudflare-workers',
    timestamp: new Date().toISOString()
}));

// API Info
app.get('/api', (c) => c.json({
    name: 'AniStream Hub API',
    version: '1.0.0-worker',
    endpoints: {
        anime: '/api/anime',
        stream: '/api/stream'
    }
}));

// Anime Routes
app.get('/api/anime/search', async (c) => {
    const q = c.req.query('q') || '';
    const page = Number(c.req.query('page')) || 1;
    const mode = c.req.query('mode') as 'safe' | 'mixed' | 'adult' | undefined;

    try {
        const data = await sourceManager.search(q, page, undefined, { mode });
        return c.json(data);
    } catch (e: any) {
        logger.error('Search failed', e);
        return c.json({ error: e.message, results: [] }, 500);
    }
});

app.get('/api/anime/trending', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    try {
        const data = await sourceManager.getTrending(page);
        return c.json(data);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/latest', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    try {
        const data = await sourceManager.getLatest(page);
        return c.json(data);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/top-rated', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    try {
        const data = await sourceManager.getTopRated(page);
        return c.json(data);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/:id', async (c) => {
    const id = c.req.param('id');
    try {
        const data = await sourceManager.getAnime(id);
        if (!data) return c.json({ error: 'Anime not found' }, 404);
        return c.json(data);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/:id/episodes', async (c) => {
    const id = c.req.param('id');
    try {
        const data = await sourceManager.getEpisodes(id);
        return c.json(data);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Streaming Routes
app.get('/api/stream/servers/:episodeId', async (c) => {
    const episodeId = c.req.param('episodeId');
    try {
        // Accessing potentially missing method via TS ignore for now,
        // assuming standard SourceManager implementation has it.
        // @ts-ignore
        if (typeof sourceManager.getEpisodeServers === 'function') {
            // @ts-ignore
            const servers = await sourceManager.getEpisodeServers(episodeId);
            return c.json({ servers });
        } else {
            // Fallback if method missing
            return c.json({ servers: [] });
        }
    } catch (e: any) {
        logger.error('Get Servers failed', e);
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/stream/watch/:episodeId', async (c) => {
    const episodeId = c.req.param('episodeId');
    const server = c.req.query('server');
    const category = c.req.query('category') as 'sub' | 'dub' | undefined;

    try {
        // @ts-ignore
        if (typeof sourceManager.getStreamingLinks === 'function') {
            // @ts-ignore
            const data = await sourceManager.getStreamingLinks(episodeId, server, category);
            return c.json(data);
        } else {
            return c.json({ sources: [] });
        }
    } catch (e: any) {
        logger.error('Get Streaming Links failed', e);
        return c.json({ error: e.message }, 500);
    }
});

// Cloudflare Workers Entrypoint
export default {
    fetch: (request: Request, env: any, ctx: any) => {
        return app.fetch(request, env, ctx);
    }
};
