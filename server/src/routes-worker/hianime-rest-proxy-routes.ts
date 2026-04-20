import { Hono } from 'hono';
import { normalizeAnimeEpisodeIdForHianimeRest } from '../utils/hianime-rest-servers.js';
import { getHianimeRestBase } from './hianime-rest.js';

/**
 * Server-side proxy to Vercel aniwatch-api (`HIANIME_REST_URL`).
 * The browser must not call Vercel directly — error responses often omit CORS headers.
 */
export function createHianimeRestProxyRoutes() {
    const app = new Hono();

    app.get('/episode/servers', async (c) => {
        const base = getHianimeRestBase(c.env);
        if (!base) {
            return c.json({ status: 503, error: 'HIANIME_REST_URL not configured' }, 503);
        }
        const raw = c.req.query('animeEpisodeId');
        if (!raw?.trim()) {
            return c.json({ status: 400, error: 'animeEpisodeId required' }, 400);
        }
        const animeEpisodeId = normalizeAnimeEpisodeIdForHianimeRest(raw.trim());
        const qs = new URLSearchParams();
        qs.set('animeEpisodeId', animeEpisodeId);
        const url = `${base}/api/v2/hianime/episode/servers?${qs}`;
        try {
            const resp = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            const text = await resp.text();
            return new Response(text, {
                status: resp.status,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e) {
            return c.json(
                { status: 502, error: 'Upstream fetch failed', message: String(e) },
                502
            );
        }
    });

    app.get('/episode/sources', async (c) => {
        const base = getHianimeRestBase(c.env);
        if (!base) {
            return c.json({ status: 503, error: 'HIANIME_REST_URL not configured' }, 503);
        }
        const rawEp = c.req.query('animeEpisodeId');
        if (!rawEp?.trim()) {
            return c.json({ status: 400, error: 'animeEpisodeId required' }, 400);
        }
        const animeEpisodeId = normalizeAnimeEpisodeIdForHianimeRest(rawEp.trim());
        const server = c.req.query('server');
        const category = c.req.query('category');
        const qs = new URLSearchParams();
        qs.set('animeEpisodeId', animeEpisodeId);
        if (server) qs.set('server', server);
        if (category) qs.set('category', category);
        const url = `${base}/api/v2/hianime/episode/sources?${qs}`;
        try {
            const resp = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            const text = await resp.text();
            return new Response(text, {
                status: resp.status,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e) {
            return c.json(
                { status: 502, error: 'Upstream fetch failed', message: String(e) },
                502
            );
        }
    });

    return app;
}
