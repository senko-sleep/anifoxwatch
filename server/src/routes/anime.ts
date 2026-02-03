import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';
import { anilistService } from '../services/anilist-service.js';

const router = Router();

/**
 * @route GET /api/anime/search
 * @query q - Search query string
 * @query page - Page number (default: 1)
 * @query source - Preferred source (optional)
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
        const { q, page = '1', source, mode = 'mixed' } = req.query;

        if (!q || typeof q !== 'string') {
            res.status(400).json({
                error: 'Query parameter "q" is required',
                results: [],
                totalPages: 0,
                currentPage: 1,
                hasNextPage: false
            });
            return;
        }

        const pageNum = parseInt(page as string, 10) || 1;
        const query = q.trim();
        const searchMode = (mode as 'safe' | 'mixed' | 'adult');

        console.log(`[AnimeRoutes] 🔍 Search: "${query}" page ${pageNum} source: ${source || 'auto'} mode: ${searchMode}`);

        const result = await sourceManager.search(query, pageNum, source as string | undefined, { mode: searchMode });

        const duration = Date.now() - startTime;
        console.log(`[AnimeRoutes] ✅ Search completed: "${query}" returned ${result.results?.length || 0} results in ${duration}ms`);

        const totalResults = result.results?.length ? result.results.length * (result.totalPages || 1) : 0;
        res.json({
            results: result.results || [],
            totalPages: result.totalPages || 0,
            currentPage: result.currentPage || pageNum,
            hasNextPage: result.hasNextPage || false,
            totalResults,
            source: result.source || 'unknown'
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        const { q } = req.query;
        console.error(`[AnimeRoutes] ❌ Search error for "${q}":`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const isTimeout = errorMessage.includes('timeout');

        res.status(isTimeout ? 504 : 500).json({
            error: isTimeout ? 'Search timed out. Please try again.' : 'Search failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
            results: [],
            totalPages: 0,
            currentPage: 1,
            hasNextPage: false,
            retryAfter: 5
        });
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
        const { page = '1', limit = '10' } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;
        const limitNum = parseInt(limit as string, 10) || 10;

        // Use AniList for top rated as it provides better "All Time Best" data with ratings
        const result = await anilistService.getTopRated(75, pageNum, limitNum);

        // Map to TopAnime structure expected by frontend
        const topAnime = result.results.map((anime, index) => ({
            rank: ((pageNum - 1) * limitNum) + index + 1,
            anime
        }));

        res.json({ results: topAnime, source: 'AniList', pageInfo: result.pageInfo });
    } catch (error) {
        console.error('Top-rated error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/schedule
 * @query start_date - Start date in YYYY-MM-DD format (default: Monday of current week)
 * @query end_date - End date in YYYY-MM-DD format (default: Sunday of current week)
 * @query page - Page number (default: 1)
 * @description Get anime airing schedule for a date range from AniList with daily groupings
 */
router.get('/schedule', async (req: Request, res: Response): Promise<void> => {
    try {
        const { start_date, end_date, page = '1' } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;

        console.log(`[AnimeRoutes] 📅 Fetching airing schedule, start: ${start_date || 'current week'}, end: ${end_date || 'current week'}, page ${pageNum}`);

        const result = await anilistService.getAiringSchedule(
            start_date as string | undefined,
            end_date as string | undefined,
            pageNum,
            50
        );

        // Group schedule by day of week using lowercase keys for frontend
        const groupedByDay: Record<string, typeof result.schedule> = {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
        };
        const dayMapping: Record<number, string> = {
            0: 'sunday',
            1: 'monday',
            2: 'tuesday',
            3: 'wednesday',
            4: 'thursday',
            5: 'friday',
            6: 'saturday'
        };

        result.schedule.forEach(item => {
            const date = new Date(item.airingAt * 1000);
            const dayName = dayMapping[date.getDay()];
            if (groupedByDay[dayName]) {
                groupedByDay[dayName].push(item);
            }
        });

        // Sort each day's schedule by air time
        Object.keys(groupedByDay).forEach(day => {
            groupedByDay[day].sort((a, b) => a.airingAt - b.airingAt);
        });

        // Calculate countdown data for each item
        const now = Date.now() / 1000;
        const scheduleWithCountdown = result.schedule.map(item => ({
            ...item,
            countdown: Math.max(0, item.airingAt - now),
            timeUntilAiring: item.airingAt - now
        }));

        res.json({
            schedule: scheduleWithCountdown,
            groupedByDay,
            metadata: {
                totalShows: result.schedule.length,
                dateRange: {
                    start: start_date || 'current-week-start',
                    end: end_date || 'current-week-end'
                },
                pageInfo: result.pageInfo
            },
            hasNextPage: result.hasNextPage,
            currentPage: pageNum
        });
    } catch (error) {
        console.error('Schedule error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/leaderboard
 * @query page - Page number (default: 1)
 * @query type - Leaderboard type: 'trending' or 'top-rated' (default: 'trending')
 * @description Get weekly leaderboard from AniList with movement indicators
 */
router.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
    try {
        const { page = '1', type = 'trending' } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;

        console.log(`[AnimeRoutes] 🏆 Fetching leaderboard, type: ${type}, page ${pageNum}`);

        let result;
        if (type === 'top-rated') {
            result = await anilistService.getTopRatedAnime(pageNum, 10);
        } else {
            result = await anilistService.getTrendingThisWeek(pageNum, 10);
        }

        // Handle both old AnimeSearchResult and new pageInfo format
        const pageInfo = 'pageInfo' in result ? result.pageInfo : {
            hasNextPage: result.hasNextPage,
            currentPage: result.currentPage,
            totalCount: (result.results?.length || 0) * (result.totalPages || 1)
        };

        res.json({
            results: result.results,
            pageInfo: {
                hasNextPage: pageInfo.hasNextPage,
                currentPage: pageInfo.currentPage,
                totalPages: 'totalPages' in result ? result.totalPages : Math.ceil(pageInfo.totalCount / 10)
            },
            type,
            source: 'AniList'
        });
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/seasonal
 * @query year - Year (default: current year)
 * @query season - Season: 'winter', 'spring', 'summer', 'fall' (default: current season)
 * @query page - Page number (default: 1)
 * @description Get seasonal anime from AniList with pagination metadata
 */
router.get('/seasonal', async (req: Request, res: Response): Promise<void> => {
    try {
        const { year, season, page = '1' } = req.query;
        const pageNum = parseInt(page as string, 10) || 1;
        const yearNum = year ? parseInt(year as string, 10) : undefined;

        console.log(`[AnimeRoutes] 🌸 Fetching seasonal anime: ${season || 'current'} ${yearNum || 'current'}, page ${pageNum}`);

        const result = await anilistService.getSeasonalAnime(yearNum, season as string | undefined, pageNum, 25);

        // Extract results and pageInfo based on the response structure
        const seasonalResult = result as {
            results: import('../types/anime.js').AnimeBase[];
            pageInfo?: { hasNextPage: boolean; currentPage: number; totalCount: number };
            seasonInfo?: { year: number; season: string };
            hasNextPage?: boolean;
            currentPage?: number;
            totalPages?: number;
        };

        res.json({
            results: seasonalResult.results,
            pageInfo: {
                hasNextPage: seasonalResult.pageInfo?.hasNextPage ?? seasonalResult.hasNextPage ?? false,
                currentPage: seasonalResult.pageInfo?.currentPage ?? seasonalResult.currentPage ?? pageNum,
                totalPages: seasonalResult.pageInfo?.totalCount
                    ? Math.ceil(seasonalResult.pageInfo.totalCount / 25)
                    : (seasonalResult.totalPages ?? 1),
                totalItems: seasonalResult.pageInfo?.totalCount ?? seasonalResult.results?.length ?? 0
            },
            seasonInfo: seasonalResult.seasonInfo ?? {
                year: yearNum ?? new Date().getFullYear(),
                season: (season as string) ?? 'current'
            },
            source: 'AniList'
        });
    } catch (error) {
        console.error('Seasonal error:', error);
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
 * @route GET /api/anime/genre-anilist/:genre
 * @param genre - Genre name
 * @query page - Page number (default: 1)
 * @description Search anime by genre using AniList API (most accurate)
 */
router.get('/genre-anilist/:genre', async (req: Request, res: Response): Promise<void> => {
    try {
        const { genre } = req.params;
        const { page = '1' } = req.query;

        if (!genre || typeof genre !== 'string') {
            res.status(400).json({ error: 'Genre parameter is required' });
            return;
        }

        const pageNum = parseInt(page as string, 10) || 1;
        console.log(`[AnimeRoutes] Searching AniList for genre: ${genre}, page: ${pageNum}`);

        const result = await sourceManager.getAnimeByGenreAniList(genre, pageNum);
        res.json(result);
    } catch (error) {
        console.error('AniList genre search error:', error);
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
    const startTime = Date.now();
    try {
        const {
            type,
            genre,
            genres,
            status,
            year,
            startYear,
            endYear,
            page = '1',
            limit = '25',
            sort = 'popularity',
            order = 'desc',
            source,
            mode = 'mixed'
        } = req.query;

        const pageNum = parseInt(page as string, 10) || 1;
        const limitNum = parseInt(limit as string, 10) || 25;

        const genreParam = (genres as string) || (genre as string);
        const parsedGenres = genreParam ? genreParam.split(',').map(g => g.trim()) : [];
        const browseMode = (mode as 'safe' | 'mixed' | 'adult');

        console.log(`[AnimeRoutes] 📋 Browse: type=${type || 'all'} genres=${parsedGenres.join(',') || 'none'} sort=${sort} mode=${browseMode}`);

        const isGenreOnlySearch = parsedGenres.length === 1 &&
            !type && !status && !year && !startYear && !endYear &&
            sort === 'popularity' && order === 'desc';

        if (isGenreOnlySearch) {
            console.log(`[AnimeRoutes] 🎯 Using AniList for genre-only: ${parsedGenres[0]}`);
            const result = await sourceManager.getAnimeByGenreAniList(parsedGenres[0], pageNum);
            res.json({
                results: result.results || [],
                currentPage: result.currentPage || pageNum,
                totalPages: result.totalPages || 1,
                hasNextPage: result.hasNextPage || false,
                totalResults: (result.results?.length || 0) * (result.totalPages || 1),
                filters: { type, genre: parsedGenres[0], status, year, startYear, endYear, sort, order },
                source: 'AniList'
            });
            return;
        }

        const filters = {
            type: type as string,
            genres: parsedGenres.length > 0 ? parsedGenres : undefined,
            status: status as string,
            year: year ? parseInt(year as string, 10) : undefined,
            startYear: startYear ? parseInt(startYear as string, 10) : undefined,
            endYear: endYear ? parseInt(endYear as string, 10) : undefined,
            sort: sort as string,
            order: order as string,
            limit: limitNum,
            page: pageNum,
            source: source as string,
            mode: browseMode
        };

        Object.keys(filters).forEach(key => {
            if (filters[key as keyof typeof filters] === undefined) {
                delete filters[key as keyof typeof filters];
            }
        });

        const result = await sourceManager.browseAnime(filters);
        const duration = Date.now() - startTime;
        console.log(`[AnimeRoutes] ✅ Browse completed: ${result.anime?.length || 0} results in ${duration}ms`);

        res.json({
            results: result.anime || [],
            currentPage: pageNum,
            totalPages: result.totalPages || 1,
            hasNextPage: result.hasNextPage || false,
            totalResults: result.totalResults || result.anime?.length || 0,
            filters: { type, genre, status, year, startYear, endYear, sort, order },
            source: source || 'default'
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[AnimeRoutes] ❌ Browse error after ${duration}ms:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const isTimeout = errorMessage.includes('timeout');

        res.status(isTimeout ? 504 : 500).json({
            error: isTimeout ? 'Browse operation timed out' : 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
            results: [],
            currentPage: 1,
            totalPages: 0,
            hasNextPage: false,
            retryAfter: 5
        });
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
        // Comprehensive list of genres available on HiAnime
        const genres = [
            'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance',
            'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Yuri', 'Yaoi',
            'Ecchi', 'Harem', 'Mecha', 'Music', 'Psychological', 'Historical', 'Parody',
            'Samurai', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids', 'Police', 'Military',
            'School', 'Demons', 'Game', 'Magic', 'Vampire', 'Space', 'Martial Arts',
            'Isekai', 'Gore', 'Survival', 'Cyberpunk', 'Super Power', 'Mythology',
            'Work Life', 'Adult Cast', 'Anthropomorphic', 'CGDCT', 'Childcare', 'Combat Sports',
            'Crossdressing', 'Delinquents', 'Detective', 'Educational', 'Gag Humor', 'Gender Bender',
            'Gore', 'High Stakes Game', 'Idols (Female)', 'Idols (Male)', 'Isekai', 'Iyashikei',
            'Love Polygon', 'Magical Sex Shift', 'Mahou Shoujo', 'Medical', 'Memoir', 'Mythology',
            'Organized Crime', 'Otaku Culture', 'Performing Arts', 'Pets', 'Reincarnation', 'Reverse Harem',
            'Romantic Subtext', 'Showbiz', 'Space', 'Strategy Game', 'Super Power', 'Survival',
            'Team Sports', 'Time Travel', 'Vampire', 'Video Game', 'Visual Arts', 'Workplace'
        ];

        // Remove duplicates and sort alphabetically
        const uniqueGenres = [...new Set(genres)].sort();

        res.json({ genres: uniqueGenres });
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
 * @route GET /api/anime
 * @query id - Anime ID (as query param to handle IDs with /)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.query.id as string;

        if (!id) {
            res.status(400).json({ error: 'Query parameter "id" is required' });
            return;
        }

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
 * @route GET /api/anime/:id
 * @param id - Anime ID
 * @deprecated Use GET /api/anime?id=... instead for IDs with / characters
 */
router.get('/episodes', async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.query.id as string;

        if (!id) {
            res.status(400).json({ error: 'Query parameter "id" is required' });
            return;
        }

        const result = await sourceManager.getEpisodes(id);
        res.json({ episodes: result });
    } catch (error) {
        console.error('Get episodes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/anime/:id
 * @param id - Anime ID
 * @deprecated Use GET /api/anime?id=... instead for IDs with / characters
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        // Decode the ID - Express doesn't automatically decode URL-encoded params
        const id = decodeURIComponent(req.params.id as string);
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
 * @deprecated Use GET /api/anime/episodes?id=... instead for IDs with / characters
 */
router.get('/:id/episodes', async (req: Request, res: Response): Promise<void> => {
    try {
        // Decode the ID - Express doesn't automatically decode URL-encoded params
        const id = decodeURIComponent(req.params.id as string);
        const result = await sourceManager.getEpisodes(id);
        res.json({ episodes: result });
    } catch (error) {
        console.error('Get episodes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
