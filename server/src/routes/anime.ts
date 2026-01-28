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
        const { q, page = '1', source } = req.query;

        if (!q || typeof q !== 'string') {
            res.status(400).json({ error: 'Query parameter "q" is required' });
            return;
        }

        const pageNum = parseInt(page as string, 10) || 1;
        const result = await sourceManager.search(q, pageNum, source as string | undefined);
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
 * @route GET /api/anime/filter
 * @query type - Anime type (TV, Movie, OVA, ONA, Special)
 * @query genre - Genre name(s) - can be comma-separated for multiple
 * @query status - Anime status (Ongoing, Completed, Upcoming)
 * @query year - Release year
 * @query season - Season (Winter, Spring, Summer, Fall)
 * @query page - Page number (default: 1)
 * @query limit - Results per page (default: 20)
 * @query sort - Sort by (rating, year, title, episodes)
 * @query order - Sort order (asc, desc)
 * @query source - Preferred source (optional)
 */
router.get('/filter', async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            type,
            genre,
            status,
            year,
            season,
            page = '1',
            limit = '20',
            sort = 'rating',
            order = 'desc',
            source
        } = req.query;

        const pageNum = parseInt(page as string, 10) || 1;
        const limitNum = parseInt(limit as string, 10) || 20;

        // Parse multiple genres if comma-separated
        const genres = genre ? (genre as string).split(',').map(g => g.trim()) : [];

        // Build filter object
        const filters = {
            type: type as string,
            genres: genres.length > 0 ? genres : undefined,
            status: status as string,
            year: year ? parseInt(year as string, 10) : undefined,
            season: season as string,
            sort: sort as string,
            order: order as string,
            limit: limitNum,
            page: pageNum,
            source: source as string
        };

        // Remove undefined filters
        Object.keys(filters).forEach(key => {
            if (filters[key as keyof typeof filters] === undefined) {
                delete filters[key as keyof typeof filters];
            }
        });

        const result = await sourceManager.getFilteredAnime(filters);
        res.json({
            results: result.anime || [],
            currentPage: pageNum,
            totalPages: result.totalPages || 1,
            hasNextPage: result.hasNextPage || false,
            totalResults: result.totalResults || 0,
            filters: filters,
            source: source || 'default'
        });
    } catch (error) {
        console.error('Filter error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/browse
 * @query type - Anime type (TV, Movie, OVA, ONA, Special)
 * @query genre - Genre name(s) - comma-separated for multiple
 * @query status - Anime status (Ongoing, Completed, Upcoming)
 * @query year - Release year
 * @query startYear - Start year for date range filter
 * @query endYear - End year for date range filter
 * @query page - Page number (default: 1)
 * @query limit - Results per page (default: 25)
 * @query sort - Sort by (popularity, trending, recently_released, shuffle, rating, year, title)
 * @query order - Sort order (asc, desc) - default desc
 * @query source - Preferred source (optional)
 */
router.get('/browse', async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            type,
            genre,
            status,
            year,
            startYear,
            endYear,
            page = '1',
            limit = '25',
            sort = 'popularity',
            order = 'desc',
            source
        } = req.query;

        const pageNum = parseInt(page as string, 10) || 1;
        const limitNum = Math.min(parseInt(limit as string, 10) || 25, 50); // Cap at 50

        // Parse multiple genres if provided
        const genres = genre ? (genre as string).split(',').map(g => g.trim()) : [];

        // Build filter object
        const filters = {
            type: type as string,
            genres: genres.length > 0 ? genres : undefined,
            status: status as string,
            year: year ? parseInt(year as string, 10) : undefined,
            startYear: startYear ? parseInt(startYear as string, 10) : undefined,
            endYear: endYear ? parseInt(endYear as string, 10) : undefined,
            sort: sort as string,
            order: order as string,
            limit: limitNum,
            page: pageNum,
            source: source as string
        };

        // Remove undefined filters
        Object.keys(filters).forEach(key => {
            if (filters[key as keyof typeof filters] === undefined) {
                delete filters[key as keyof typeof filters];
            }
        });

        const result = await sourceManager.browseAnime(filters);

        res.json({
            results: result.anime || [],
            currentPage: pageNum,
            totalPages: result.totalPages || 1,
            hasNextPage: result.hasNextPage || false,
            totalResults: result.totalResults || 0,
            filters: { type, genre, status, year, startYear, endYear, sort, order },
            source: source || 'default'
        });
    } catch (error) {
        console.error('Browse error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/types
 * @description Get all available anime types
 */
router.get('/types', async (req: Request, res: Response): Promise<void> => {
    try {
        const types = [
            { value: 'TV', label: 'TV Series', description: 'Television series' },
            { value: 'Movie', label: 'Movies', description: 'Feature films' },
            { value: 'OVA', label: 'OVAs', description: 'Original Video Animation' },
            { value: 'ONA', label: 'ONAs', description: 'Original Net Animation' },
            { value: 'Special', label: 'Specials', description: 'Special episodes' }
        ];

        res.json({ types });
    } catch (error) {
        console.error('Types error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/genres
 * @description Get all available genres
 */
router.get('/genres', async (req: Request, res: Response): Promise<void> => {
    try {
        const genres = [
            'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance',
            'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Yuri', 'Yaoi',
            'Ecchi', 'Harem', 'Mecha', 'Music', 'Psychological', 'Historical', 'Parody',
            'Samurai', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids', 'Police', 'Military',
            'School', 'Demons', 'Game', 'Magic', 'Vampire', 'Space', 'Time Travel', 'Martial Arts'
        ];

        res.json({ genres });
    } catch (error) {
        console.error('Genres error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/statuses
 * @description Get all available statuses
 */
router.get('/statuses', async (req: Request, res: Response): Promise<void> => {
    try {
        const statuses = [
            { value: 'Ongoing', label: 'Ongoing', description: 'Currently airing' },
            { value: 'Completed', label: 'Completed', description: 'Finished airing' },
            { value: 'Upcoming', label: 'Upcoming', description: 'Not yet aired' }
        ];

        res.json({ statuses });
    } catch (error) {
        console.error('Statuses error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/seasons
 * @description Get all available seasons
 */
router.get('/seasons', async (req: Request, res: Response): Promise<void> => {
    try {
        const seasons = [
            { value: 'Winter', label: 'Winter', months: 'Jan, Feb, Mar' },
            { value: 'Spring', label: 'Spring', months: 'Apr, May, Jun' },
            { value: 'Summer', label: 'Summer', months: 'Jul, Aug, Sep' },
            { value: 'Fall', label: 'Fall', months: 'Oct, Nov, Dec' }
        ];

        res.json({ seasons });
    } catch (error) {
        console.error('Seasons error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/years
 * @description Get available years (current year back to 1970)
 */
router.get('/years', async (req: Request, res: Response): Promise<void> => {
    try {
        const currentYear = new Date().getFullYear();
        const years = [];

        for (let year = currentYear; year >= 1970; year--) {
            years.push({
                value: year,
                label: year.toString(),
                decade: `${Math.floor(year / 10) * 10}s`
            });
        }

        res.json({ years });
    } catch (error) {
        console.error('Years error:', error);
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
