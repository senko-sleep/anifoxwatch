import { Router, type Request, type Response } from 'express';
import { browse, getGenres, getHome, getTitle, indexInfo, search } from '../services/hentai-catalog.js';
import type { AdultSort } from '../services/anilist-adult.js';
import { logger } from '../utils/logger.js';

/**
 * The adult catalog's own API — the counterpart to /api/anime for the WatchHentai
 * source. Defaults, browse, search and titles all come from one place.
 *
 *   GET /api/hentai/home            featured + curated shelves (the default screen)
 *   GET /api/hentai/browse          ?genre=<slug>&page=<n>
 *   GET /api/hentai/search          ?q=<text>&page=<n>
 *   GET /api/hentai/genres
 *   GET /api/hentai/title/:slug     details + episodes (with stills) in one call
 */
const router = Router();

const fail = (res: Response, where: string, error: unknown, empty: object = {}) => {
    logger.error(`[hentai] ${where} failed`, error as Error);
    if (res.headersSent) return; // a slow request the timeout already answered
    res.status(502).json({ error: 'The adult catalog is unavailable right now.', ...empty });
};

const SORTS: Record<AdultSort, true> = { popular: true, trending: true, rating: true, newest: true, title: true };

const pageOf = (req: Request): number => Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);

router.get('/home', async (_req, res) => {
    try {
        res.set('Cache-Control', 'public, max-age=120');
        res.json(await getHome());
    } catch (e) {
        fail(res, 'home', e, { featured: [], sections: [], genres: [] });
    }
});

router.get('/browse', async (req, res) => {
    try {
        const genre = typeof req.query.genre === 'string' ? req.query.genre : undefined;
        const sort = typeof req.query.sort === 'string' && req.query.sort in SORTS ? (req.query.sort as AdultSort) : undefined;
        const result = await browse({ genre, sort, page: pageOf(req), watchable: req.query.watchable === '1' });
        res.set('Cache-Control', 'public, max-age=120');
        res.json({ totalResults: result.results.length, ...result });
    } catch (e) {
        fail(res, 'browse', e, { results: [], totalPages: 0, currentPage: 1, hasNextPage: false });
    }
});

router.get('/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) {
        res.json({ results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 });
        return;
    }
    try {
        const result = await search(q, pageOf(req));
        res.json({ ...result, totalResults: result.results.length });
    } catch (e) {
        fail(res, 'search', e, { results: [], totalPages: 0, currentPage: 1, hasNextPage: false });
    }
});

/** Debug: how much of each site the index holds. */
router.get('/index', (_req, res) => {
    res.json(indexInfo());
});

router.get('/genres', async (_req, res) => {
    try {
        res.set('Cache-Control', 'public, max-age=3600');
        res.json({ genres: await getGenres() });
    } catch (e) {
        fail(res, 'genres', e, { genres: [] });
    }
});

router.get('/title/:slug', async (req, res) => {
    try {
        const title = await getTitle(req.params.slug.replace(/^series-/i, ''));
        if (!title) {
            res.status(404).json({ error: 'Title not found' });
            return;
        }
        res.set('Cache-Control', 'public, max-age=300');
        res.json(title);
    } catch (e) {
        fail(res, 'title', e);
    }
});

export default router;
