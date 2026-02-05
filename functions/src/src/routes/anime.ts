import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';

const router = Router();

/**
 * @route GET /api/anime/search
 * @query q - Search query string
 * @query page - Page number (default: 1)
 * @query source - Preferred source (optional)
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
    try {
        const { q, page = '1', source, mode = 'safe' } = req.query;

        if (!q || typeof q !== 'string') {
            res.status(400).json({ error: 'Query parameter "q" is required' });
            return;
        }

        const pageNum = parseInt(page as string, 10) || 1;
        const searchMode = (mode as 'safe' | 'mixed' | 'adult') || 'safe';
        const result = await sourceManager.search(q, pageNum, source as string | undefined, { mode: searchMode });
        res.json(result);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/search-all
 * @query q - Search query string
 * @query page - Page number (default: 1)
 */
router.get('/search-all', async (req: Request, res: Response): Promise<void> => {
    try {
        const { q, page = '1' } = req.query;

        if (!q || typeof q !== 'string') {
            res.status(400).json({ error: 'Query parameter "q" is required' });
            return;
        }

        const pageNum = parseInt(page as string, 10) || 1;
        const result = await sourceManager.searchAll(q, pageNum);
        res.json(result);
    } catch (error) {
        console.error('Search-all error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/trending
 * @query page - Page number (default: 1)
 * @query source - Preferred source (optional)
 */
router.get('/trending', async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = '1', source } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;
        const result = await sourceManager.getTrending(pageNum, source as string | undefined);
        res.json({ results: result, source: source || 'default' });
    } catch (error) {
        console.error('Trending error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/latest
 * @query page - Page number (default: 1)
 * @query source - Preferred source (optional)
 */
router.get('/latest', async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = '1', source } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;
        const result = await sourceManager.getLatest(pageNum, source as string | undefined);
        res.json({ results: result, source: source || 'default' });
    } catch (error) {
        console.error('Latest error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/top-rated
 * @query page - Page number (default: 1)
 * @query limit - Number of results (default: 10)
 * @query source - Preferred source (optional)
 */
router.get('/top-rated', async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = '1', limit = '10', source } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;
        const limitNum = parseInt(limit as string, 10) || 10;
        const result = await sourceManager.getTopRated(pageNum, limitNum, source as string | undefined);
        res.json({ results: result, source: source || 'default' });
    } catch (error) {
        console.error('Top-rated error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/genre/:genre
 * @param genre - Genre name
 * @query page - Page number (default: 1)
 * @query source - Preferred source (optional)
 */
router.get('/genre/:genre', async (req: Request, res: Response): Promise<void> => {
    try {
        const { genre } = req.params;
        const { page = '1', source } = req.query;

        if (!genre || typeof genre !== 'string') {
            res.status(400).json({ error: 'Genre parameter is required' });
            return;
        }

        const pageNum = parseInt(page as string, 10) || 1;
        const result = await sourceManager.getAnimeByGenre(genre, pageNum, source as string | undefined);
        res.json(result);
    } catch (error) {
        console.error('Genre search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/browse
 * @query page - Page number (default: 1)
 * @query limit - Results per page (default: 25)
 * @query type - Anime type filter (TV, Movie, OVA, etc.)
 * @query genre - Genre filter (comma-separated)
 * @query status - Status filter (Ongoing, Completed, etc.)
 * @query year - Year filter
 * @query startYear - Start year for range filter
 * @query endYear - End year for range filter
 * @query sort - Sort by (popularity, trending, recently_released, shuffle, rating, year, title)
 * @query order - Sort order (asc, desc)
 * @query source - Preferred source (optional)
 * @query mode - Content mode (safe, mixed, adult) - default: safe
 */
router.get('/browse', async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            page = '1',
            limit = '25',
            type,
            genre,
            status,
            year,
            startYear,
            endYear,
            sort = 'popularity',
            order,
            source,
            mode = 'safe'
        } = req.query;

        const pageNum = parseInt(page as string, 10) || 1;
        const limitNum = parseInt(limit as string, 10) || 25;

        const filters: any = {
            page: pageNum,
            limit: limitNum,
            sort: sort as string,
            mode: (mode as 'safe' | 'mixed' | 'adult') || 'safe'
        };

        if (type) filters.type = type as string;
        if (genre) filters.genres = (genre as string).split(',').filter(Boolean);
        if (status) filters.status = status as string;
        if (year) filters.year = parseInt(year as string, 10);
        if (startYear) filters.startYear = parseInt(startYear as string, 10);
        if (endYear) filters.endYear = parseInt(endYear as string, 10);
        if (order) filters.order = order as string;
        if (source) filters.source = source as string;

        const result = await sourceManager.browseAnime(filters);
        
        res.json({
            results: result.anime,
            totalPages: result.totalPages,
            currentPage: pageNum,
            hasNextPage: result.hasNextPage,
            totalResults: result.totalResults,
            source: source || 'default'
        });
    } catch (error) {
        console.error('Browse error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/random
 * @query source - Preferred source (optional)
 */
router.get('/random', async (req: Request, res: Response): Promise<void> => {
    try {
        const { source } = req.query;
        const result = await sourceManager.getRandomAnime(source as string | undefined);

        if (!result) {
            res.status(404).json({ error: 'No random anime found' });
            return;
        }

        res.json(result);
    } catch (error) {
        console.error('Random anime error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/:id
 * @param id - Anime ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const result = await sourceManager.getAnime(id);

        if (!result) {
            res.status(404).json({ error: 'Anime not found' });
            return;
        }

        res.json(result);
    } catch (error) {
        console.error('Get anime error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/:id/episodes
 * @param id - Anime ID
 */
router.get('/:id/episodes', async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const result = await sourceManager.getEpisodes(id);
        res.json({ episodes: result });
    } catch (error) {
        console.error('Get episodes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
