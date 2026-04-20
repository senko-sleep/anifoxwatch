import { Hono } from 'hono';
import { HiAnime } from 'aniwatch';
import { getHianimeRestBase, fetchHianimeRestData } from './hianime-rest.js';
import { anilistService } from '../services/anilist-service.js';
import { getHeroSpotlightCached } from '../services/hero-spotlight-service.js';
import { loadHianimeAnimeDetails, loadHianimeEpisodeList } from '../services/hianime-anime-details.js';
import { AnimeBase, AnimeSearchResult, Episode, BrowseFilters, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';

const hianime = new HiAnime.Scraper();

async function loadHianimeHome(env: unknown): Promise<any | null> {
    const b = getHianimeRestBase(env);
    if (b) {
        const d = await fetchHianimeRestData<any>(b, '/api/v2/hianime/home');
        if (d) return d;
    }
    try {
        return await hianime.getHomePage() as any;
    } catch {
        return null;
    }
}

async function loadHianimeSearch(env: unknown, q: string, page: number): Promise<any | null> {
    const b = getHianimeRestBase(env);
    if (b) {
        const qs = new URLSearchParams({ q, page: String(page) });
        const d = await fetchHianimeRestData<any>(b, `/api/v2/hianime/search?${qs}`);
        if (d) return d;
    }
    try {
        return await hianime.search(q, page) as any;
    } catch {
        return null;
    }
}

/** IDs that need a Node/Puppeteer backend — not available on this Worker when no proxy URL is configured. */
const RENDER_PREFIXES = ['allanime-', 'animekai-', '9anime-', 'kaido-', 'akih-', 'miruro-', 'aniwave-', 'anix-', 'zoro-', 'animefox-', 'gogoanime-', 'animepahe-', 'animeflv-'];
function needsRender(id: string): boolean {
    const lower = id.toLowerCase();
    return RENDER_PREFIXES.some(p => lower.startsWith(p));
}

/** Sources that require a full Node backend (not provided on edge-only deploys). */
const RENDER_ONLY_SOURCES = ['akih', 'allanime', '9anime', 'kaido', 'animekai', 'miruro', 'aniwave', 'anix', 'zoro', 'animefox', 'gogoanime', 'animepahe', 'animeflv'];
function sourceNeedsRender(source?: string): boolean {
    if (!source) return false;
    return RENDER_ONLY_SOURCES.some(s => source.toLowerCase() === s.toLowerCase());
}

// Use a flexible interface that works with both SourceManager and CloudflareSourceManager
interface SourceManagerLike {
    search(query: string, page?: number, sourceName?: string, options?: { mode?: string }): Promise<AnimeSearchResult>;
    getAnime(id: string): Promise<AnimeBase | null>;
    getEpisodes(animeId: string): Promise<Episode[]>;
    getTrending(page?: number, sourceName?: string): Promise<AnimeBase[]>;
    getLatest(page?: number, sourceName?: string): Promise<AnimeBase[]>;
    getTopRated(page?: number, limit?: number, sourceName?: string): Promise<AnimeBase[] | TopAnime[]>;
    getStreamingLinks?(episodeId: string, server?: string, category?: string): Promise<StreamingData | Record<string, unknown>>;
    getEpisodeServers?(episodeId: string): Promise<EpisodeServer[] | Record<string, unknown>[]>;
    // Optional methods that may not exist in CloudflareSourceManager
    getAnimeByGenre?(genre: string, page?: number, source?: string): Promise<AnimeSearchResult>;
    getAnimeByGenreAniList?(genre: string, page?: number): Promise<AnimeSearchResult>;
    getFilteredAnime?(filters: BrowseFilters): Promise<AnimeSearchResult>;
    browseAnime?(filters: BrowseFilters): Promise<AnimeSearchResult>;
    getRandomAnime?(source?: string): Promise<AnimeBase | null>;
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
        const qs = c.req.url.split('?')[1] || '';

        if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400);

        if (sourceNeedsRender(source)) {
            return c.json({ error: 'This source is not available on the edge API', results: [] }, 502);
        }

        // Adult mode always uses local hentai sources (WatchHentai/Hanime)
        if (mode === 'adult') {
            try {
                const data = await sourceManager.search(q, page, source, { mode: 'adult' });
                if (data.results.length > 0) return c.json(data);
            } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                return c.json({ error: errorMessage, results: [] }, 500);
            }
            return c.json({ results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' });
        }

        // Safe/mixed: HiAnime via optional REST (Vercel) or in-worker scraper
        try {
            const searchResults = (await loadHianimeSearch(c.env, q, page)) as any;
            const animes = searchResults?.animes || searchResults?.results || [];
            // Transform data to match expected frontend structure
            const transformed = animes.map((item: any) => ({
                id: item.id,
                title: item.title,
                image: item.poster || item.image,
                description: item.description || '',
                genres: Array.isArray(item.genres) ? item.genres.filter((g: any) => g && typeof g === 'string').map((g: string) => g.toLowerCase()) : [],
                type: item.type || 'TV',
                status: item.status || 'Ongoing',
                releaseDate: item.releaseDate || '',
                rating: item.rating || 0,
                episodes: item.episodes || 0,
                duration: item.duration || 24,
                otherInfo: item.otherInfo || {}
            }));
            if (transformed.length > 0) {
                return c.json({ results: transformed, source: 'hianime' });
            }
        } catch { /* fall through */ }

        return c.json({ results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' });
    });

    // Get hero spotlight
    app.get('/hero-spotlight', async (c) => {
        try {
            const results = await getHeroSpotlightCached();
            if (results && ((Array.isArray(results) && results.length > 0) || ((results as { results?: unknown[] }).results && (results as { results?: unknown[] }).results!.length > 0))) {
                return c.json(results);
            }
            // Empty result — return empty array
            return c.json({ results: [], count: 0 });
        } catch (error: unknown) {
            // Return empty array on error instead of 500
            return c.json({ results: [], count: 0 });
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
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage, results: [] }, 500);
        }
    });

    // Get trending anime
    app.get('/trending', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const source = c.req.query('source');

        // HiAnime via optional REST (Vercel) or in-worker scraper
        try {
            const homeData = await loadHianimeHome(c.env);
            const trending = homeData?.trendingAnimes || [];
            // Transform data to match expected frontend structure
            const transformed = trending.map((item: any) => ({
                id: item.id,
                title: item.title,
                image: item.poster || item.image,
                description: item.description || '',
                genres: Array.isArray(item.genres) ? item.genres.filter((g: any) => g && typeof g === 'string').map((g: string) => g.toLowerCase()) : [],
                type: item.type || 'TV',
                status: item.status || 'Ongoing',
                releaseDate: item.releaseDate || '',
                rating: item.rating || 0,
                episodes: item.episodes || 0,
                duration: item.duration || 24,
                otherInfo: item.otherInfo || {}
            }));
            if (transformed.length > 0) {
                return c.json({ results: transformed, source: 'hianime' });
            }
        } catch { /* fall through */ }

        return c.json({ results: [], source: 'none' });
    });

    // Get latest releases
    app.get('/latest', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const source = c.req.query('source');

        // HiAnime via optional REST (Vercel) or in-worker scraper
        try {
            const homeData = await loadHianimeHome(c.env);
            const latest = homeData?.latestEpisodeAnimes || [];
            // Transform data to match expected frontend structure
            const transformed = latest.map((item: any) => ({
                id: item.id,
                title: item.title,
                image: item.poster || item.image,
                description: item.description || '',
                genres: Array.isArray(item.genres) ? item.genres.filter((g: any) => g && typeof g === 'string').map((g: string) => g.toLowerCase()) : [],
                type: item.type || 'TV',
                status: item.status || 'Ongoing',
                releaseDate: item.releaseDate || '',
                rating: item.rating || 0,
                episodes: item.episodes || 0,
                duration: item.duration || 24,
                otherInfo: item.otherInfo || {}
            }));
            if (transformed.length > 0) {
                return c.json({ results: transformed, source: 'hianime' });
            }
        } catch { /* fall through */ }

        return c.json({ results: [], source: 'none' });
    });

    // Get top rated anime
    app.get('/top-rated', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const limit = Number(c.req.query('limit')) || 10;
        const source = c.req.query('source');

        // HiAnime via optional REST (Vercel) or in-worker scraper
        try {
            const homeData = await loadHianimeHome(c.env);
            const top10 = homeData?.top10Animes;
            let results: unknown[] = [];
            if (top10) {
                if (Array.isArray(top10)) {
                    results = top10;
                } else if (typeof top10 === 'object') {
                    results = top10.today || top10.week || top10.month || [];
                }
            }
            // Transform data to match expected frontend structure
            const transformed = results.map((item: any) => ({
                id: item.id,
                title: item.title,
                image: item.poster || item.image,
                description: item.description || '',
                genres: Array.isArray(item.genres) ? item.genres.filter((g: any) => g && typeof g === 'string').map((g: string) => g.toLowerCase()) : [],
                type: item.type || 'TV',
                status: item.status || 'Ongoing',
                releaseDate: item.releaseDate || '',
                rating: item.rating || 0,
                episodes: item.episodes || 0,
                duration: item.duration || 24,
                otherInfo: item.otherInfo || {}
            }));
            if (transformed.length > 0) {
                return c.json({ results: transformed, source: 'hianime' });
            }
        } catch { /* fall through */ }

        return c.json({ results: [] });
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
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage }, 500);
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
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage }, 500);
        }
    });

    // Get seasonal anime
    app.get('/seasonal', async (c) => {
        const year = c.req.query('year') ? Number(c.req.query('year')) : undefined;
        const season = c.req.query('season');
        const page = Number(c.req.query('page')) || 1;

        try {
            const result = await anilistService.getSeasonalAnime(year, season, page, 25);
            const seasonalResult = result as { results?: unknown[]; pageInfo?: { hasNextPage?: boolean; currentPage?: number; totalCount?: number }; hasNextPage?: boolean; currentPage?: number; totalPages?: number; seasonInfo?: { year: number; season: string } };

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
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage }, 500);
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
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage, results: [] }, 500);
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
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage }, 500);
        }
    });

    // Filter anime
    app.get('/filter', async (c) => {
        const query = c.req.query();
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 20;
        const genres = query.genre ? (query.genre as string).split(',').map(g => g.trim()) : [];

        if (sourceNeedsRender(query.source as string)) {
            return c.json({ error: 'This source is not available on the edge API', results: [] }, 502);
        }

        const filters: Record<string, string | number | string[] | undefined> = {
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
            const filteredResult = result as { anime?: unknown[]; totalPages?: number; hasNextPage?: boolean; totalResults?: number };
            return c.json({
                results: filteredResult.anime || [],
                currentPage: page,
                totalPages: filteredResult.totalPages || 1,
                hasNextPage: filteredResult.hasNextPage || false,
                totalResults: filteredResult.totalResults || 0,
                filters, source: query.source || 'default'
            });
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage }, 500);
        }
    });

    // Browse anime
    app.get('/browse', async (c) => {
        const query = c.req.query();
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const genreParam = (query.genres as string) || (query.genre as string);
        const parsedGenres = genreParam ? genreParam.split(',').map(g => g.trim()) : [];

        if (sourceNeedsRender(query.source as string)) {
            return c.json({ error: 'This source is not available on the edge API', results: [] }, 502);
        }

        const filters: Record<string, string | number | string[] | undefined> = {
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

        const browseQs = c.req.url.split('?')[1] || '';

        // Adult mode — use local hentai sources
        if (filters.mode === 'adult') {
            try {
                if (sourceManager.browseAnime) {
                    const result = await sourceManager.browseAnime(filters);
                    if (result.results?.length > 0) {
                        return c.json({ results: result.results, currentPage: page, totalPages: result.totalPages || 1, hasNextPage: result.hasNextPage || false, totalResults: result.results.length, source: result.source || 'adult' });
                    }
                }
            } catch (_) { void _; }
            return c.json({ results: [], currentPage: page, totalPages: 0, hasNextPage: false, totalResults: 0, source: 'none' });
        }

        // Safe/mixed: HiAnime via optional REST (Vercel) or in-worker scraper
        try {
            const homeData = await loadHianimeHome(c.env);
            const trending = homeData?.trendingAnimes || [];
            // Transform data to match expected frontend structure
            const transformed = trending.map((item: any) => ({
                id: item.id,
                title: item.title,
                image: item.poster || item.image,
                description: item.description || '',
                genres: Array.isArray(item.genres) ? item.genres.filter((g: any) => g && typeof g === 'string').map((g: string) => g.toLowerCase()) : [],
                type: item.type || 'TV',
                status: item.status || 'Ongoing',
                releaseDate: item.releaseDate || '',
                rating: item.rating || 0,
                episodes: item.episodes || 0,
                duration: item.duration || 24,
                otherInfo: item.otherInfo || {}
            }));
            return c.json({ results: transformed, currentPage: page, totalPages: 1, hasNextPage: false, totalResults: transformed.length, source: 'hianime' });
        } catch { /* fall through */ }

        return c.json({ results: [], currentPage: page, totalPages: 0, hasNextPage: false, totalResults: 0, source: 'none' });
    });

    // Get random anime
    app.get('/random', async (c) => {
        const source = c.req.query('source');

        // HiAnime via optional REST (Vercel) or in-worker scraper
        try {
            const homeData = await loadHianimeHome(c.env);
            const trending = homeData?.trendingAnimes || [];
            if (trending.length > 0) {
                const randomIndex = Math.floor(Math.random() * trending.length);
                const item = trending[randomIndex];
                // Transform data to match expected frontend structure
                const transformed = {
                    id: item.id,
                    title: item.title,
                    image: item.poster || item.image,
                    description: item.description || '',
                    genres: Array.isArray(item.genres) ? item.genres.filter((g: any) => g && typeof g === 'string').map((g: string) => g.toLowerCase()) : [],
                    type: item.type || 'TV',
                    status: item.status || 'Ongoing',
                    releaseDate: item.releaseDate || '',
                    rating: item.rating || 0,
                    episodes: item.episodes || 0,
                    duration: item.duration || 24,
                    otherInfo: item.otherInfo || {}
                };
                return c.json(transformed);
            }
        } catch { /* fall through */ }

        return c.json({ error: 'No anime available for random selection' }, 500);
    });

    // Get anime details (query-based)
    app.get('/', async (c) => {
        const id = c.req.query('id');
        const source = c.req.query('source');
        if (!id) return c.json({ error: 'Query parameter "id" is required' }, 400);

        if (needsRender(id) || sourceNeedsRender(source)) {
            return c.json({ error: 'This anime ID requires a full Node backend', results: [] }, 502);
        }

        try {
            let result = await sourceManager.getAnime(id);
            if (!result) {
                result = await loadHianimeAnimeDetails(c.env, id);
            }
            if (!result) {
                return c.json({ error: 'Anime not found' }, 404);
            }
            return c.json(result);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage }, 500);
        }
    });

    // Get episodes (query-based)
    app.get('/episodes', async (c) => {
        const id = c.req.query('id');
        const source = c.req.query('source');
        if (!id) return c.json({ error: 'Query parameter "id" is required' }, 400);

        if (needsRender(id) || sourceNeedsRender(source)) {
            return c.json({ error: 'This anime ID requires a full Node backend', episodes: [] }, 502);
        }

        try {
            let result = await sourceManager.getEpisodes(id);
            if (!result?.length) {
                const hi = await loadHianimeEpisodeList(c.env, id);
                if (hi.length > 0) result = hi;
            }
            return c.json({ episodes: result || [] });
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage, episodes: [] }, 500);
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

        if (needsRender(id)) {
            return c.json({ error: 'This anime ID requires a full Node backend' }, 502);
        }

        try {
            let data = await sourceManager.getAnime(id);
            if (!data) {
                data = await loadHianimeAnimeDetails(c.env, id);
            }
            if (!data) {
                return c.json({ error: 'Anime not found' }, 404);
            }
            return c.json(data);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage }, 500);
        }
    });

    // Get episodes (param-based)
    app.get('/:id/episodes', async (c) => {
        const id = decodeURIComponent(c.req.param('id'));

        if (needsRender(id)) {
            return c.json({ error: 'This anime ID requires a full Node backend', episodes: [] }, 502);
        }

        try {
            let data = await sourceManager.getEpisodes(id);
            if (!data?.length) {
                const hi = await loadHianimeEpisodeList(c.env, id);
                if (hi.length > 0) data = hi;
            }
            return c.json({ episodes: data || [] });
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return c.json({ error: errorMessage, episodes: [] }, 500);
        }
    });

    return app;
}
