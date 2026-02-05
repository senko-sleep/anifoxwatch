import { Hono } from 'hono';
import { anilistService } from '../services/anilist-service.js';

// Use a flexible interface that works with both SourceManager and CloudflareSourceManager
interface SourceManagerLike {
    search(query: string, page?: number, sourceName?: string, options?: { mode?: string }): Promise<any>;
    getAnime(id: string): Promise<any>;
    getEpisodes(animeId: string): Promise<any[]>;
    getTrending(page?: number, sourceName?: string): Promise<any[]>;
    getLatest(page?: number, sourceName?: string): Promise<any[]>;
    getTopRated(page?: number, limit?: number, sourceName?: string): Promise<any[]>;
    getStreamingLinks?(episodeId: string, server?: string, category?: string): Promise<any>;
    getEpisodeServers?(episodeId: string): Promise<any[]>;
    // Optional methods that may not exist in CloudflareSourceManager
    getAnimeByGenre?(genre: string, page?: number, source?: string): Promise<any>;
    getAnimeByGenreAniList?(genre: string, page?: number): Promise<any>;
    getFilteredAnime?(filters: any): Promise<any>;
    browseAnime?(filters: any): Promise<any>;
    getRandomAnime?(source?: string): Promise<any>;
}

/**
 * Anime routes for Cloudflare Worker (Hono)
 * Mirrors the Express anime routes functionality
 * Compatible with both SourceManager and CloudflareSourceManager
 */
export function createAnimeRoutes(sourceManager: SourceManagerLike) {
    const app = new Hono();

    // Search anime
    app.get('/search', async (c) => {
        const q = c.req.query('q') || '';
        const page = Number(c.req.query('page')) || 1;
        const source = c.req.query('source');
        const mode = c.req.query('mode') as 'safe' | 'mixed' | 'adult' | undefined;

        if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400);

        try {
            const data = await sourceManager.search(q, page, source, { mode: mode || 'safe' });
            return c.json(data);
        } catch (e: any) {
            return c.json({ error: e.message, results: [] }, 500);
        }
    });

    // Search all sources
    app.get('/search-all', async (c) => {
        const q = c.req.query('q') || '';
        const page = Number(c.req.query('page')) || 1;

        if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400);

        try {
            const data = await sourceManager.search(q, page, undefined, { mode: 'safe' });
            return c.json(data);
        } catch (e: any) {
            return c.json({ error: e.message, results: [] }, 500);
        }
    });

    // Get trending anime
    app.get('/trending', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const source = c.req.query('source');
        
        try {
            const data = await sourceManager.getTrending(page, source);
            return c.json({ results: data, source: source || 'default' });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get latest releases
    app.get('/latest', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const source = c.req.query('source');
        
        try {
            const data = await sourceManager.getLatest(page, source);
            return c.json({ results: data, source: source || 'default' });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get top rated anime
    app.get('/top-rated', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const limit = Number(c.req.query('limit')) || 10;
        const source = c.req.query('source');
        
        try {
            const data = await sourceManager.getTopRated(page, limit, source);
            return c.json({ results: data });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get airing schedule
    app.get('/schedule', async (c) => {
        const start_date = c.req.query('start_date');
        const end_date = c.req.query('end_date');
        const page = Number(c.req.query('page')) || 1;

        try {
            const result = await anilistService.getAiringSchedule(start_date, end_date, page, 50);

            // Group by day
            const groupedByDay: Record<string, typeof result.schedule> = {
                monday: [], tuesday: [], wednesday: [], thursday: [],
                friday: [], saturday: [], sunday: []
            };
            const dayMapping: Record<number, string> = {
                0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
                4: 'thursday', 5: 'friday', 6: 'saturday'
            };

            result.schedule.forEach(item => {
                const date = new Date(item.airingAt * 1000);
                const dayName = dayMapping[date.getDay()];
                if (groupedByDay[dayName]) groupedByDay[dayName].push(item);
            });

            Object.keys(groupedByDay).forEach(day => {
                groupedByDay[day].sort((a, b) => a.airingAt - b.airingAt);
            });

            const now = Date.now() / 1000;
            const scheduleWithCountdown = result.schedule.map(item => ({
                ...item,
                countdown: Math.max(0, item.airingAt - now),
                timeUntilAiring: item.airingAt - now
            }));

            return c.json({
                schedule: scheduleWithCountdown,
                groupedByDay,
                metadata: {
                    totalShows: result.schedule.length,
                    dateRange: { start: start_date || 'current-week-start', end: end_date || 'current-week-end' },
                    pageInfo: result.pageInfo
                },
                hasNextPage: result.hasNextPage,
                currentPage: page
            });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get leaderboard
    app.get('/leaderboard', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const type = c.req.query('type') || 'trending';

        try {
            let result;
            if (type === 'top-rated') {
                result = await anilistService.getTopRatedAnime(page, 10);
            } else {
                result = await anilistService.getTrendingThisWeek(page, 10);
            }

            const pageInfo = 'pageInfo' in result ? result.pageInfo : {
                hasNextPage: result.hasNextPage,
                currentPage: result.currentPage,
                totalCount: (result.results?.length || 0) * (result.totalPages || 1)
            };

            return c.json({
                results: result.results,
                pageInfo: {
                    hasNextPage: pageInfo.hasNextPage,
                    currentPage: pageInfo.currentPage,
                    totalPages: 'totalPages' in result ? result.totalPages : Math.ceil(pageInfo.totalCount / 10)
                },
                type, source: 'AniList'
            });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get seasonal anime
    app.get('/seasonal', async (c) => {
        const year = c.req.query('year') ? Number(c.req.query('year')) : undefined;
        const season = c.req.query('season');
        const page = Number(c.req.query('page')) || 1;

        try {
            const result = await anilistService.getSeasonalAnime(year, season, page, 25);
            const seasonalResult = result as any;

            return c.json({
                results: seasonalResult.results,
                pageInfo: {
                    hasNextPage: seasonalResult.pageInfo?.hasNextPage ?? seasonalResult.hasNextPage ?? false,
                    currentPage: seasonalResult.pageInfo?.currentPage ?? seasonalResult.currentPage ?? page,
                    totalPages: seasonalResult.pageInfo?.totalCount ? Math.ceil(seasonalResult.pageInfo.totalCount / 25) : (seasonalResult.totalPages ?? 1),
                    totalItems: seasonalResult.pageInfo?.totalCount ?? seasonalResult.results?.length ?? 0
                },
                seasonInfo: seasonalResult.seasonInfo ?? { year: year ?? new Date().getFullYear(), season: season ?? 'current' },
                source: 'AniList'
            });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get anime by genre
    app.get('/genre/:genre', async (c) => {
        const genre = c.req.param('genre');
        const page = Number(c.req.query('page')) || 1;
        const source = c.req.query('source');

        try {
            if (!sourceManager.getAnimeByGenre) {
                return c.json({ error: 'Genre browsing not available in this environment', results: [] }, 501);
            }
            const data = await sourceManager.getAnimeByGenre(genre, page, source);
            return c.json(data);
        } catch (e: any) {
            return c.json({ error: e.message, results: [] }, 500);
        }
    });

    // Get anime by genre (AniList)
    app.get('/genre-anilist/:genre', async (c) => {
        const genre = c.req.param('genre');
        const page = Number(c.req.query('page')) || 1;

        if (!genre) return c.json({ error: 'Genre parameter is required' }, 400);

        try {
            if (!sourceManager.getAnimeByGenreAniList) {
                // Fallback to AniList service directly
                const result = await anilistService.searchByGenre(genre, page, 25);
                return c.json(result);
            }
            const result = await sourceManager.getAnimeByGenreAniList(genre, page);
            return c.json(result);
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Filter anime
    app.get('/filter', async (c) => {
        const query = c.req.query();
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 20;
        const genres = query.genre ? (query.genre as string).split(',').map(g => g.trim()) : [];

        const filters: any = {
            type: query.type,
            genres: genres.length > 0 ? genres : undefined,
            status: query.status,
            year: query.year ? parseInt(query.year as string, 10) : undefined,
            season: query.season,
            sort: query.sort || 'rating',
            order: query.order || 'desc',
            limit, page,
            source: query.source
        };

        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) delete filters[key];
        });

        try {
            if (!sourceManager.getFilteredAnime) {
                // Fallback to trending
                const trending = await sourceManager.getTrending(page);
                return c.json({
                    results: trending || [],
                    currentPage: page,
                    totalPages: 1,
                    hasNextPage: false,
                    totalResults: trending?.length || 0,
                    filters, source: 'fallback'
                });
            }
            const result = await sourceManager.getFilteredAnime(filters);
            return c.json({
                results: result.anime || [],
                currentPage: page,
                totalPages: result.totalPages || 1,
                hasNextPage: result.hasNextPage || false,
                totalResults: result.totalResults || 0,
                filters, source: query.source || 'default'
            });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Browse anime
    app.get('/browse', async (c) => {
        const query = c.req.query();
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const genreParam = (query.genres as string) || (query.genre as string);
        const parsedGenres = genreParam ? genreParam.split(',').map(g => g.trim()) : [];

        const filters: any = {
            type: query.type,
            genres: parsedGenres.length > 0 ? parsedGenres : undefined,
            status: query.status,
            year: query.year ? parseInt(query.year as string, 10) : undefined,
            startYear: query.startYear ? parseInt(query.startYear as string, 10) : undefined,
            endYear: query.endYear ? parseInt(query.endYear as string, 10) : undefined,
            sort: query.sort || 'popularity',
            order: query.order || 'desc',
            limit, page,
            source: query.source,
            mode: query.mode as 'safe' | 'mixed' | 'adult'
        };

        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) delete filters[key];
        });

        try {
            if (!sourceManager.browseAnime) {
                // Fallback to trending
                const trending = await sourceManager.getTrending(page);
                return c.json({
                    results: trending || [],
                    currentPage: page,
                    totalPages: 1,
                    hasNextPage: false,
                    totalResults: trending?.length || 0,
                    filters: { type: query.type, genre: query.genre, status: query.status, year: query.year, sort: query.sort, order: query.order },
                    source: 'fallback'
                });
            }
            const result = await sourceManager.browseAnime(filters);
            return c.json({
                results: result.anime || [],
                currentPage: page,
                totalPages: result.totalPages || 1,
                hasNextPage: result.hasNextPage || false,
                totalResults: result.totalResults || result.anime?.length || 0,
                filters: { type: query.type, genre: query.genre, status: query.status, year: query.year, sort: query.sort, order: query.order },
                source: query.source || 'default'
            });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get random anime
    app.get('/random', async (c) => {
        const source = c.req.query('source');
        
        try {
            if (!sourceManager.getRandomAnime) {
                // Fallback: get trending and pick random
                const trending = await sourceManager.getTrending(1);
                if (!trending || trending.length === 0) {
                    return c.json({ error: 'No random anime found' }, 404);
                }
                const randomIndex = Math.floor(Math.random() * trending.length);
                return c.json(trending[randomIndex]);
            }
            const data = await sourceManager.getRandomAnime(source);
            if (!data) return c.json({ error: 'No random anime found' }, 404);
            return c.json(data);
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get anime details (query-based)
    app.get('/', async (c) => {
        const id = c.req.query('id');
        if (!id) return c.json({ error: 'Query parameter "id" is required' }, 400);

        try {
            const result = await sourceManager.getAnime(id);
            if (!result) return c.json({ error: 'Anime not found' }, 404);
            return c.json(result);
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get episodes (query-based)
    app.get('/episodes', async (c) => {
        const id = c.req.query('id');
        if (!id) return c.json({ error: 'Query parameter "id" is required' }, 400);

        try {
            const result = await sourceManager.getEpisodes(id);
            return c.json({ episodes: result });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Utility endpoints
    app.get('/types', (c) => {
        const types = [
            { value: 'TV', label: 'TV Series', description: 'Television series' },
            { value: 'Movie', label: 'Movies', description: 'Feature films' },
            { value: 'OVA', label: 'OVAs', description: 'Original Video Animation' },
            { value: 'ONA', label: 'ONAs', description: 'Original Net Animation' },
            { value: 'Special', label: 'Specials', description: 'Special episodes' }
        ];
        return c.json({ types });
    });

    app.get('/genres', (c) => {
        const genres = [
            'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance',
            'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Yuri', 'Yaoi',
            'Ecchi', 'Harem', 'Mecha', 'Music', 'Psychological', 'Historical', 'Parody',
            'Samurai', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids', 'Police', 'Military',
            'School', 'Demons', 'Game', 'Magic', 'Vampire', 'Space', 'Martial Arts',
            'Isekai', 'Gore', 'Survival', 'Cyberpunk', 'Super Power', 'Mythology'
        ];
        return c.json({ genres: [...new Set(genres)].sort() });
    });

    app.get('/statuses', (c) => {
        const statuses = [
            { value: 'Ongoing', label: 'Ongoing', description: 'Currently airing' },
            { value: 'Completed', label: 'Completed', description: 'Finished airing' },
            { value: 'Upcoming', label: 'Upcoming', description: 'Not yet aired' }
        ];
        return c.json({ statuses });
    });

    app.get('/seasons', (c) => {
        const seasons = [
            { value: 'Winter', label: 'Winter', months: 'Jan, Feb, Mar' },
            { value: 'Spring', label: 'Spring', months: 'Apr, May, Jun' },
            { value: 'Summer', label: 'Summer', months: 'Jul, Aug, Sep' },
            { value: 'Fall', label: 'Fall', months: 'Oct, Nov, Dec' }
        ];
        return c.json({ seasons });
    });

    app.get('/years', (c) => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let year = currentYear; year >= 1970; year--) {
            years.push({ value: year, label: year.toString(), decade: `${Math.floor(year / 10) * 10}s` });
        }
        return c.json({ years });
    });

    // Get anime details (param-based)
    app.get('/:id', async (c) => {
        const id = decodeURIComponent(c.req.param('id'));
        
        try {
            const data = await sourceManager.getAnime(id);
            if (!data) return c.json({ error: 'Anime not found' }, 404);
            return c.json(data);
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get episodes (param-based)
    app.get('/:id/episodes', async (c) => {
        const id = decodeURIComponent(c.req.param('id'));
        
        try {
            const data = await sourceManager.getEpisodes(id);
            return c.json({ episodes: data });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    return app;
}
