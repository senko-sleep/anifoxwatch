import './polyfills.js';
import { Hono } from 'hono';
import { logger } from './utils/logger.js';
import { SourceManager } from './services/source-manager.js';
import { anilistService } from './services/anilist-service.js';

const app = new Hono();
// Initialize SourceManager
// Note: In Cloudflare Workers, this instance might be recreated per request or reused.
// The internal caching of SourceManager will work for the lifetime of the hot worker.
const sourceManager = new SourceManager();

// Helper to get proxy base URL
const getProxyBaseUrl = (c: any): string => {
    const url = new URL(c.req.url);
    return `${url.protocol}//${url.host}/api/stream/proxy`;
};

// Helper proxy URL generator
const proxyUrl = (url: string, proxyBase: string): string => {
    return `${proxyBase}?url=${encodeURIComponent(url)}`;
};

// CORS
app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    if (c.req.method === 'OPTIONS') {
        return new Response(null, { status: 204 });
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
        anime: {
            search: 'GET /api/anime/search?q={query}&page={page}&source={source}',
            searchAll: 'GET /api/anime/search-all?q={query}&page={page}',
            trending: 'GET /api/anime/trending?page={page}&source={source}',
            latest: 'GET /api/anime/latest?page={page}&source={source}',
            topRated: 'GET /api/anime/top-rated?page={page}&limit={limit}&source={source}',
            schedule: 'GET /api/anime/schedule?start_date={date}&end_date={date}&page={page}',
            leaderboard: 'GET /api/anime/leaderboard?page={page}&type={trending|top-rated}',
            seasonal: 'GET /api/anime/seasonal?year={year}&season={season}&page={page}',
            genre: 'GET /api/anime/genre/{genre}?page={page}&source={source}',
            genreAnilist: 'GET /api/anime/genre-anilist/{genre}?page={page}',
            filter: 'GET /api/anime/filter?type={type}&genre={genre}&status={status}&year={year}&page={page}',
            browse: 'GET /api/anime/browse?type={type}&genre={genre}&status={status}&year={year}&sort={sort}&page={page}',
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
            watch: 'GET /api/stream/watch/:episodeId?server={server}',
            proxy: 'GET /api/stream/proxy?url={hlsUrl}'
        },
        sources: {
            list: 'GET /api/sources',
            health: 'GET /api/sources/health',
            check: 'POST /api/sources/check',
            setPreferred: 'POST /api/sources/preferred'
        }
    },
    availableSources: ['9Anime', 'Aniwave', 'Aniwatch', 'Gogoanime', 'Consumet', 'Jikan']
}));

// ==========================================
// Anime Routes
// ==========================================

app.get('/api/anime/search', async (c) => {
    const q = c.req.query('q') || '';
    const page = Number(c.req.query('page')) || 1;
    const source = c.req.query('source');
    const mode = c.req.query('mode') as 'safe' | 'mixed' | 'adult' | undefined;

    if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400);

    try {
        const data = await sourceManager.search(q, page, source, { mode });
        return c.json(data);
    } catch (e: any) {
        logger.error('Search failed', e);
        return c.json({ error: e.message, results: [] }, 500);
    }
});

app.get('/api/anime/search-all', async (c) => {
    const q = c.req.query('q') || '';
    const page = Number(c.req.query('page')) || 1;

    if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400);

    try {
        // We will default to calling search with no source specified which fulfills "search all"
        const data = await sourceManager.search(q, page, undefined, { mode: 'safe' });
        return c.json(data);
    } catch (e: any) {
        logger.error('Search All failed', e);
        return c.json({ error: e.message, results: [] }, 500);
    }
});

app.get('/api/anime/trending', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const source = c.req.query('source');
    try {
        const data = await sourceManager.getTrending(page, source);
        return c.json({ results: data, source: source || 'default' });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/latest', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const source = c.req.query('source');
    try {
        const data = await sourceManager.getLatest(page, source);
        return c.json({ results: data, source: source || 'default' });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/top-rated', async (c) => {
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

app.get('/api/anime/genre/:genre', async (c) => {
    const genre = c.req.param('genre');
    const page = Number(c.req.query('page')) || 1;
    const source = c.req.query('source');

    try {
        const data = await sourceManager.getAnimeByGenre(genre, page, source as string | undefined);
        return c.json(data);
    } catch (e: any) {
        logger.error('Genre search failed', e);
        return c.json({ error: e.message, results: [] }, 500);
    }
});

app.get('/api/anime/random', async (c) => {
    const source = c.req.query('source');
    try {
        const data = await sourceManager.getRandomAnime(source as string | undefined);
        if (!data) return c.json({ error: 'No random anime found' }, 404);
        return c.json(data);
    } catch (e: any) {
        logger.error('Random anime failed', e);
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/schedule', async (c) => {
    const start_date = c.req.query('start_date');
    const end_date = c.req.query('end_date');
    const page = Number(c.req.query('page')) || 1;

    try {
        const result = await anilistService.getAiringSchedule(
            start_date,
            end_date,
            page,
            50
        );

        // Group schedule by day of week
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

        // Calculate countdown data
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
                dateRange: {
                    start: start_date || 'current-week-start',
                    end: end_date || 'current-week-end'
                },
                pageInfo: result.pageInfo
            },
            hasNextPage: result.hasNextPage,
            currentPage: page
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/leaderboard', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const type = c.req.query('type') || 'trending';

    try {
        let result;
        if (type === 'top-rated') {
            result = await anilistService.getTopRatedAnime(page, 10);
        } else {
            result = await anilistService.getTrendingThisWeek(page, 10);
        }

        // Handle both old AnimeSearchResult and new pageInfo format
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
            type,
            source: 'AniList'
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/seasonal', async (c) => {
    const year = c.req.query('year') ? Number(c.req.query('year')) : undefined;
    const season = c.req.query('season');
    const page = Number(c.req.query('page')) || 1;

    try {
        const result = await anilistService.getSeasonalAnime(year, season, page, 25);

        // Extract results and pageInfo based on the response structure
        const seasonalResult = result as {
            results: any[];
            pageInfo?: { hasNextPage: boolean; currentPage: number; totalCount: number };
            seasonInfo?: { year: number; season: string };
            hasNextPage?: boolean;
            currentPage?: number;
            totalPages?: number;
        };

        return c.json({
            results: seasonalResult.results,
            pageInfo: {
                hasNextPage: seasonalResult.pageInfo?.hasNextPage ?? seasonalResult.hasNextPage ?? false,
                currentPage: seasonalResult.pageInfo?.currentPage ?? seasonalResult.currentPage ?? page,
                totalPages: seasonalResult.pageInfo?.totalCount
                    ? Math.ceil(seasonalResult.pageInfo.totalCount / 25)
                    : (seasonalResult.totalPages ?? 1),
                totalItems: seasonalResult.pageInfo?.totalCount ?? seasonalResult.results?.length ?? 0
            },
            seasonInfo: seasonalResult.seasonInfo ?? {
                year: year ?? new Date().getFullYear(),
                season: season ?? 'current'
            },
            source: 'AniList'
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/genre-anilist/:genre', async (c) => {
    const genre = c.req.param('genre');
    const page = Number(c.req.query('page')) || 1;

    if (!genre) {
        return c.json({ error: 'Genre parameter is required' }, 400);
    }

    try {
        const result = await sourceManager.getAnimeByGenreAniList(genre, page);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/filter', async (c) => {
    try {
        const query = c.req.query();
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 20;

        // Parse multiple genres if comma-separated
        const genres = query.genre ? (query.genre as string).split(',').map(g => g.trim()) : [];

        // Build filter object
        const filters = {
            type: query.type,
            genres: genres.length > 0 ? genres : undefined,
            status: query.status,
            year: query.year ? parseInt(query.year as string, 10) : undefined,
            season: query.season,
            sort: query.sort || 'rating',
            order: query.order || 'desc',
            limit,
            page,
            source: query.source
        };

        // Remove undefined filters
        Object.keys(filters).forEach(key => {
            if (filters[key as keyof typeof filters] === undefined) {
                delete filters[key as keyof typeof filters];
            }
        });

        const result = await sourceManager.getFilteredAnime(filters);
        return c.json({
            results: result.anime || [],
            currentPage: page,
            totalPages: result.totalPages || 1,
            hasNextPage: result.hasNextPage || false,
            totalResults: result.totalResults || 0,
            filters,
            source: query.source || 'default'
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/browse', async (c) => {
    try {
        const query = c.req.query();
        const filters = {
            type: query.type,
            genres: query.genres ? query.genres.split(',') : (query.genre ? query.genre.split(',') : undefined),
            status: query.status,
            year: query.year ? parseInt(query.year) : undefined,
            startYear: query.startYear ? parseInt(query.startYear) : undefined,
            endYear: query.endYear ? parseInt(query.endYear) : undefined,
            sort: query.sort,
            order: query.order,
            limit: query.limit ? parseInt(query.limit) : 25,
            page: query.page ? parseInt(query.page) : 1,
            source: query.source,
            mode: query.mode as 'safe' | 'mixed' | 'adult'
        };

        // Clean undefined
        Object.keys(filters).forEach(key => filters[key as keyof typeof filters] === undefined && delete filters[key as keyof typeof filters]);

        const result = await sourceManager.browseAnime(filters);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});


app.get('/api/anime/:id', async (c) => {
    const id = c.req.param('id');
    try {
        // Decode ID
        const decodedId = decodeURIComponent(id);
        const data = await sourceManager.getAnime(decodedId);
        if (!data) return c.json({ error: 'Anime not found' }, 404);
        return c.json(data);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/:id/episodes', async (c) => {
    const id = c.req.param('id');
    try {
        const decodedId = decodeURIComponent(id);
        const data = await sourceManager.getEpisodes(decodedId);
        return c.json({ episodes: data });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Query-based routes (for IDs with / characters)
app.get('/api/anime', async (c) => {
    const id = c.req.query('id');

    if (!id) {
        return c.json({ error: 'Query parameter "id" is required' }, 400);
    }

    try {
        const result = await sourceManager.getAnime(id);
        if (!result) {
            return c.json({ error: 'Anime not found' }, 404);
        }
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/anime/episodes', async (c) => {
    const id = c.req.query('id');

    if (!id) {
        return c.json({ error: 'Query parameter "id" is required' }, 400);
    }

    try {
        const result = await sourceManager.getEpisodes(id);
        return c.json({ episodes: result });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Utility endpoints
app.get('/api/anime/types', (c) => {
    const types = [
        { value: 'TV', label: 'TV Series', description: 'Television series' },
        { value: 'Movie', label: 'Movies', description: 'Feature films' },
        { value: 'OVA', label: 'OVAs', description: 'Original Video Animation' },
        { value: 'ONA', label: 'ONAs', description: 'Original Net Animation' },
        { value: 'Special', label: 'Specials', description: 'Special episodes' }
    ];
    return c.json({ types });
});

app.get('/api/anime/genres', (c) => {
    const genres = [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance',
        'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Yuri', 'Yaoi',
        'Ecchi', 'Harem', 'Mecha', 'Music', 'Psychological', 'Historical', 'Parody',
        'Samurai', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids', 'Police', 'Military',
        'School', 'Demons', 'Game', 'Magic', 'Vampire', 'Space', 'Martial Arts',
        'Isekai', 'Gore', 'Survival', 'Cyberpunk', 'Super Power', 'Mythology',
        'Work Life', 'Adult Cast', 'Anthropomorphic', 'CGDCT', 'Childcare', 'Combat Sports',
        'Crossdressing', 'Delinquents', 'Detective', 'Educational', 'Gag Humor', 'Gender Bender',
        'High Stakes Game', 'Idols (Female)', 'Idols (Male)', 'Iyashikei',
        'Love Polygon', 'Magical Sex Shift', 'Mahou Shoujo', 'Medical', 'Memoir',
        'Organized Crime', 'Otaku Culture', 'Performing Arts', 'Pets', 'Reincarnation', 'Reverse Harem',
        'Romantic Subtext', 'Showbiz', 'Strategy Game', 'Team Sports', 'Time Travel',
        'Video Game', 'Visual Arts', 'Workplace'
    ];
    const uniqueGenres = [...new Set(genres)].sort();
    return c.json({ genres: uniqueGenres });
});

app.get('/api/anime/statuses', (c) => {
    const statuses = [
        { value: 'Ongoing', label: 'Ongoing', description: 'Currently airing' },
        { value: 'Completed', label: 'Completed', description: 'Finished airing' },
        { value: 'Upcoming', label: 'Upcoming', description: 'Not yet aired' }
    ];
    return c.json({ statuses });
});

app.get('/api/anime/seasons', (c) => {
    const seasons = [
        { value: 'Winter', label: 'Winter', months: 'Jan, Feb, Mar' },
        { value: 'Spring', label: 'Spring', months: 'Apr, May, Jun' },
        { value: 'Summer', label: 'Summer', months: 'Jul, Aug, Sep' },
        { value: 'Fall', label: 'Fall', months: 'Oct, Nov, Dec' }
    ];
    return c.json({ seasons });
});

app.get('/api/anime/years', (c) => {
    const currentYear = new Date().getFullYear();
    const years = [];

    for (let year = currentYear; year >= 1970; year--) {
        years.push({
            value: year,
            label: year.toString(),
            decade: `${Math.floor(year / 10) * 10}s`
        });
    }

    return c.json({ years });
});

// ==========================================
// Streaming Routes
// ==========================================

app.get('/api/stream/servers/:episodeId', async (c) => {
    const episodeId = decodeURIComponent(c.req.param('episodeId'));
    try {
        if (typeof sourceManager.getEpisodeServers === 'function') {
            const servers = await sourceManager.getEpisodeServers(episodeId);
            return c.json({ servers });
        }
        return c.json({ servers: [] });
    } catch (e: any) {
        logger.error('Get Servers failed', e);
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/stream/watch/:episodeId', async (c) => {
    const episodeId = decodeURIComponent(c.req.param('episodeId'));
    const server = c.req.query('server');
    const category = c.req.query('category') as 'sub' | 'dub' | undefined;
    const tryAll = c.req.query('tryAll') !== 'false';
    const useProxy = c.req.query('proxy') !== 'false';
    const proxyBase = getProxyBaseUrl(c);

    try {
        if (typeof sourceManager.getStreamingLinks === 'function') {
            // Try specific server first if provided
            if (server) {
                const data = await sourceManager.getStreamingLinks(episodeId, server, category);
                if (data.sources?.length) {
                    if (useProxy) {
                        data.sources = data.sources.map((s: any) => ({ ...s, url: proxyUrl(s.url, proxyBase) }));
                    }
                    return c.json(data);
                }
            }

            // Try fallback
            if (tryAll && !server) {
                // Priority: hd-2, hd-1, hd-3
                const servers = ['hd-2', 'hd-1', 'hd-3'];
                for (const srv of servers) {
                    try {
                        const data = await sourceManager.getStreamingLinks(episodeId, srv, category);
                        if (data.sources?.length) {
                            if (useProxy) {
                                data.sources = data.sources.map((s: any) => ({ ...s, url: proxyUrl(s.url, proxyBase) }));
                            }
                            return c.json({ ...data, server: srv });
                        }
                    } catch (e) { continue; }
                }
            }

            // If we're here, we failed or found nothing
            return c.json({ sources: [] });
        }
        return c.json({ sources: [] });
    } catch (e: any) {
        logger.error('Get Streaming Links failed', e);
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/stream/proxy', async (c) => {
    const url = c.req.query('url');
    if (!url) return c.json({ error: 'URL is required' }, 400);

    const proxyBase = getProxyBaseUrl(c);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': new URL(url).origin
            }
        });

        if (!response.ok) {
            return c.json({ error: 'Upstream error', status: response.status }, response.status as any); // Cast for Hono type joy
        }

        const contentType = response.headers.get('content-type') || '';
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');

        // Rewrite m3u8 if needed
        if (contentType.includes('mpegurl') || url.includes('.m3u8')) {
            const text = await response.text();
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            const rewritten = text.replace(/^(?!#)(.+)$/gm, (line) => {
                if (!line.trim()) return line;
                const absoluteUrl = line.startsWith('http') ? line : baseUrl + line;
                return proxyUrl(absoluteUrl, proxyBase);
            });

            return c.body(rewritten, 200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*'
            });
        }

        // Stream other content
        return new Response(response.body, {
            status: response.status,
            headers: newHeaders
        });
    } catch (e: any) {
        return c.json({ error: 'Proxy failed', message: e.message }, 502);
    }
});

app.options('/api/stream/proxy', (c) => {
    return c.text('', 204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Origin, Accept',
        'Access-Control-Max-Age': '86400'
    });
});

// ==========================================
// Sources Routes
// ==========================================

app.get('/api/sources', (c) => {
    const sources = sourceManager.getAvailableSources();
    return c.json({ sources });
});

app.get('/api/sources/health', (c) => {
    const health = sourceManager.getHealthStatus();
    return c.json({ sources: health });
});

app.post('/api/sources/check', async (c) => {
    const health = await sourceManager.checkAllHealth();
    return c.json({ sources: Array.from(health.values()) });
});

app.post('/api/sources/preferred', async (c) => {
    try {
        const body = await c.req.json();
        const { source } = body;

        if (!source || typeof source !== 'string') {
            return c.json({ error: 'Source name is required' }, 400);
        }

        const success = sourceManager.setPreferredSource(source);

        if (!success) {
            return c.json({ error: 'Source not found' }, 404);
        }

        return c.json({ message: `Preferred source set to ${source}` });
    } catch (e: any) {
        logger.error('Set preferred source failed', e);
        return c.json({ error: e.message }, 500);
    }
});


// Cloudflare Workers Entrypoint
export default {
    fetch: (request: Request, env: any, ctx: any) => {
        return app.fetch(request, env, ctx);
    }
};
