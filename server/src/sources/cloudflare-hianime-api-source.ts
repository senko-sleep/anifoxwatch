/**
 * Cloudflare HiAnime API Source - Uses native fetch to call external aniwatch APIs
 * This source is designed specifically for Cloudflare Workers environment
 * No Node.js dependencies (axios, http.Agent) required
 * 
 * Uses external aniwatch-api instances for streaming data extraction
 */

import { BaseAnimeSource, GenreAwareSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

// ============ API RESPONSE INTERFACES ============

interface HiAnimeAPIResponse {
    success?: boolean;
    status?: number;
    data?: unknown;
}

interface AnimeInfoRaw {
    id: string;
    name?: string;
    title?: string;
    jname?: string;
    poster?: string;
    image?: string;
    description?: string;
    type?: string;
    status?: string;
    rating?: string;
    malscore?: string;
    episodes?: {
        sub?: number;
        dub?: number;
    };
    totalEpisodes?: number;
    duration?: string;
    genres?: string[];
    studios?: string[];
    season?: string;
    aired?: string;
    rank?: number;
}

interface AnimeDetailResponse {
    anime?: {
        info?: AnimeInfoRaw;
        moreInfo?: {
            genres?: string[];
            studios?: string;
            status?: string;
        };
    } | AnimeInfoRaw;
}

interface SearchResponse {
    animes?: AnimeInfoRaw[];
    totalPages?: number;
    currentPage?: number;
    hasNextPage?: boolean;
}

interface HomeResponse {
    trendingAnimes?: AnimeInfoRaw[];
    spotlightAnimes?: AnimeInfoRaw[];
    latestEpisodeAnimes?: AnimeInfoRaw[];
    top10Animes?: {
        today?: AnimeInfoRaw[];
        week?: AnimeInfoRaw[];
    };
}

interface CategoryResponse {
    animes?: AnimeInfoRaw[];
    totalPages?: number;
    currentPage?: number;
    hasNextPage?: boolean;
}

interface EpisodeRaw {
    episodeId: string;
    number?: number;
    title?: string;
    isFiller?: boolean;
}

interface EpisodesResponse {
    episodes?: EpisodeRaw[];
}

interface ServerRaw {
    serverName?: string;
    server_name?: string;
    name?: string;
    type?: 'sub' | 'dub';
}

interface ServersResponse {
    sub?: ServerRaw[];
    dub?: ServerRaw[];
}

interface SourceRaw {
    url: string;
    quality?: string;
    label?: string;
    isM3U8?: boolean;
}

interface SubtitleRaw {
    url: string;
    lang?: string;
    language?: string;
    label?: string;
}

interface StreamSourcesResponse {
    sources?: SourceRaw[];
    subtitles?: SubtitleRaw[];
    headers?: Record<string, string>;
    intro?: {
        start: number;
        end: number;
    };
    outro?: {
        start: number;
        end: number;
    };
}

/**
 * CloudflareHiAnimeAPISource - Cloudflare Workers compatible HiAnime source
 * Uses native fetch API to call external aniwatch-api instances
 */
export class CloudflareHiAnimeAPISource extends BaseAnimeSource implements GenreAwareSource {
    name = 'CloudflareHiAnimeAPI';
    baseUrl: string;

    // Smart caching with TTL
    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = {
        home: 5 * 60 * 1000,        // 5 min
        search: 3 * 60 * 1000,      // 3 min
        anime: 15 * 60 * 1000,      // 15 min
        episodes: 10 * 60 * 1000,   // 10 min
        stream: 2 * 60 * 60 * 1000, // 2 hours
        servers: 60 * 60 * 1000,    // 1 hour
    };

    // List of API instances to try (in order of preference)
    private apiInstances = [
        'https://anifoxwatch-api.anifoxwatch.workers.dev',
        'https://api-aniwatch.onrender.com',
        'https://aniwatch-api.onrender.com',
        'https://hianime-api-chi.vercel.app',
    ];
    private currentApiIndex = 0;

    constructor(apiUrl?: string) {
        super();
        this.baseUrl = apiUrl || this.apiInstances[0];
    }

    // ============ CACHING ============

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.data as T;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: unknown, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    // ============ NATIVE FETCH API REQUEST WITH FALLBACK ============

    private async apiRequest<T>(path: string, params?: Record<string, unknown>, options?: SourceRequestOptions): Promise<T> {
        let lastError: Error | null = null;
        if (options?.signal?.aborted) throw new Error('Aborted');

        for (let i = 0; i < this.apiInstances.length; i++) {
            const apiIndex = (this.currentApiIndex + i) % this.apiInstances.length;
            const apiUrl = this.apiInstances[apiIndex];

            try {
                // Build URL with query params
                const url = new URL(`${apiUrl}/api/v2/hianime${path}`);
                if (params) {
                    Object.entries(params).forEach(([key, value]) => {
                        if (value !== undefined && value !== null) {
                            url.searchParams.set(key, String(value));
                        }
                    });
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 15000);

                // Combine signals if provided
                if (options?.signal) {
                    options.signal.addEventListener('abort', () => controller.abort());
                }

                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'AniStreamHub/1.0'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`API returned status: ${response.status}`);
                }

                const data = await response.json() as HiAnimeAPIResponse;
                const isSuccess = data?.success === true || data?.status === 200;

                if (isSuccess) {
                    // Update current API index to this working one
                    this.currentApiIndex = apiIndex;
                    return (data.data || data) as T;
                }
                throw new Error(`API returned success: false or status: ${data?.status}`);
            } catch (error) {
                if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted')) throw error;
                const err = error as Error;
                lastError = err;
                logger.warn(`API ${apiUrl} failed: ${err.message}`, { path, params }, this.name);
                continue;
            }
        }

        throw lastError || new Error('All API instances failed');
    }

    // ============ DATA MAPPING ============

    private mapAnime(data: AnimeInfoRaw): AnimeBase {
        return {
            id: `hianime-${data.id}`,
            title: data.name || data.title || 'Unknown',
            titleJapanese: data.jname,
            image: data.poster || data.image || '',
            cover: data.poster || data.image,
            description: data.description?.replace(/<[^>]*>/g, '').trim() || 'No description available.',
            type: this.mapType(data.type),
            status: this.mapStatus(data.status),
            rating: data.rating ? parseFloat(data.rating) : (data.malscore ? parseFloat(data.malscore) : undefined),
            episodes: data.episodes?.sub || data.totalEpisodes || 0,
            episodesAired: data.episodes?.sub || 0,
            duration: data.duration || '24m',
            genres: data.genres || [],
            studios: data.studios || [],
            season: data.season,
            year: data.aired ? parseInt(data.aired) : undefined,
            subCount: data.episodes?.sub || 0,
            dubCount: data.episodes?.dub || 0,
            isMature: data.rating === 'R+' || data.rating === 'R-17+',
            source: this.name
        };
    }

    private mapAnimeFromSearch(data: AnimeInfoRaw): AnimeBase {
        return {
            id: `hianime-${data.id}`,
            title: data.name || 'Unknown',
            titleJapanese: data.jname,
            image: data.poster || '',
            cover: data.poster,
            description: 'No description available.',
            type: this.mapType(data.type),
            status: 'Completed',
            rating: data.rating ? parseFloat(data.rating) : undefined,
            episodes: data.episodes?.sub || 0,
            episodesAired: data.episodes?.sub || 0,
            duration: data.duration || '24m',
            genres: [],
            studios: [],
            subCount: data.episodes?.sub || 0,
            dubCount: data.episodes?.dub || 0,
            isMature: false,
            source: this.name
        };
    }

    private mapType(type?: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = (type || '').toUpperCase();
        if (t.includes('MOVIE')) return 'Movie';
        if (t.includes('OVA')) return 'OVA';
        if (t.includes('ONA')) return 'ONA';
        if (t.includes('SPECIAL')) return 'Special';
        return 'TV';
    }

    private mapStatus(status?: string): 'Ongoing' | 'Completed' | 'Upcoming' {
        const s = (status || '').toLowerCase();
        if (s.includes('ongoing') || s.includes('airing') || s.includes('currently')) return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not yet')) return 'Upcoming';
        return 'Completed';
    }

    private normalizeQuality(quality: string): VideoSource['quality'] {
        if (!quality) return 'auto';
        const q = quality.toLowerCase();
        if (q.includes('1080') || q.includes('fhd')) return '1080p';
        if (q.includes('720') || q.includes('hd')) return '720p';
        if (q.includes('480') || q.includes('sd')) return '480p';
        if (q.includes('360')) return '360p';
        return 'auto';
    }

    // ============ API METHODS ============

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            await this.apiRequest<HomeResponse>('/home', {}, {
                ...options,
                timeout: options?.timeout || 5000
            });
            this.isAvailable = true;
            return true;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.apiRequest<SearchResponse>('/search', { q: query, page }, options);

            const result: AnimeSearchResult = {
                results: (data.animes || []).map((a) => this.mapAnimeFromSearch(a)),
                totalPages: data.totalPages || 1,
                currentPage: data.currentPage || page,
                hasNextPage: data.hasNextPage || false,
                source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const cacheKey = `anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const animeId = id.replace('hianime-', '');
            const data = await this.apiRequest<AnimeDetailResponse>(`/anime/${animeId}`, {}, options);
            
            const animeInfo = (typeof data.anime === 'object' && 'info' in data.anime)
                ? data.anime.info
                : data.anime || data as unknown as AnimeInfoRaw;

            const anime = this.mapAnime(animeInfo as AnimeInfoRaw);

            if (typeof data.anime === 'object' && 'moreInfo' in data.anime && data.anime.moreInfo) {
                anime.genres = data.anime.moreInfo.genres || anime.genres;
                anime.studios = data.anime.moreInfo.studios ? [data.anime.moreInfo.studios] : anime.studios;
                anime.status = this.mapStatus(data.anime.moreInfo.status || '');
            }

            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cacheKey = `episodes:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const id = animeId.replace('hianime-', '');
            const data = await this.apiRequest<EpisodesResponse>(`/anime/${id}/episodes`, {}, options);

            const episodes: Episode[] = (data.episodes || []).map((ep) => ({
                id: ep.episodeId,
                number: ep.number || 1,
                title: ep.title || `Episode ${ep.number || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: true,
                thumbnail: undefined
            }));

            this.setCache(cacheKey, episodes, this.cacheTTL.episodes);
            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        try {
            let servers: EpisodeServer[] = [];

            try {
                const data = await this.apiRequest<ServersResponse>('/episode/servers', { animeEpisodeId: episodeId }, options);
                if (data.sub) {
                    data.sub.forEach((s) => {
                        servers.push({ name: s.serverName || 'unknown', url: '', type: 'sub' });
                    });
                }
                if (data.dub) {
                    data.dub.forEach((s) => {
                        servers.push({ name: s.serverName || 'unknown', url: '', type: 'dub' });
                    });
                }
            } catch (e) {
                if (e instanceof Error && (e.name === 'AbortError' || e.message === 'Aborted')) throw e;
                logger.warn('/episode/servers endpoint failed', undefined, this.name);
            }

            if (servers.length === 0) {
                servers = [
                    { name: 'hd-2', url: '', type: 'sub' },
                    { name: 'hd-1', url: '', type: 'sub' }
                ];
            }

            servers.sort((a, b) => {
                if (a.name === 'hd-2') return -1;
                if (b.name === 'hd-2') return 1;
                return 0;
            });

            this.setCache(cacheKey, servers, this.cacheTTL.servers);
            return servers;
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [
                { name: 'hd-2', url: '', type: 'sub' },
                { name: 'hd-1', url: '', type: 'sub' }
            ];
        }
    }

    async getStreamingLinks(episodeId: string, server: string = 'hd-2', category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        logger.info(`[${this.name}] Getting streaming links for ${episodeId} (server: ${server}, category: ${category})`);

        // Try servers in priority order
        const serversToTry = [server, 'hd-2', 'hd-1', 'hd-3'].filter((s, i, arr) => arr.indexOf(s) === i);

        for (const currentServer of serversToTry) {
            try {
                const data = await this.apiRequest<StreamSourcesResponse>('/episode/sources', {
                    animeEpisodeId: episodeId,
                    server: currentServer,
                    category
                }, options);

                if (data.sources && data.sources.length > 0) {
                    const streamData: StreamingData = {
                        sources: data.sources.map((s): VideoSource => ({
                            url: s.url,
                            quality: this.normalizeQuality(s.quality || 'auto'),
                            isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                            isDASH: s.url?.includes('.mpd'),
                        })),
                        subtitles: (data.subtitles || []).map((sub) => ({
                            url: sub.url,
                            lang: sub.lang || 'Unknown',
                            label: sub.lang || 'Unknown'
                        })),
                        headers: data.headers,
                        intro: data.intro,
                        outro: data.outro,
                        source: this.name
                    };

                    if (streamData.sources.length > 1) {
                        streamData.sources.sort((a, b) => {
                            const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                            return (order[a.quality] || 5) - (order[b.quality] || 5);
                        });
                    }

                    logger.info(`[${this.name}] ✅ Found ${streamData.sources.length} sources from server ${currentServer}`);
                    this.setCache(cacheKey, streamData, this.cacheTTL.stream);
                    return streamData;
                }
            } catch (error) {
                if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted')) throw error;
                logger.warn(`[${this.name}] Server ${currentServer} failed: ${(error as Error).message}`);
                continue;
            }
        }

        logger.warn(`[${this.name}] All servers failed for ${episodeId}`);
        return { sources: [], subtitles: [] };
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.apiRequest<HomeResponse>('/home', {}, options);
            const trending = data.trendingAnimes || data.spotlightAnimes || [];
            const results = trending.map((a) => this.mapAnimeFromSearch(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `latest:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.apiRequest<HomeResponse>('/home', {}, options);
            const latest = data.latestEpisodeAnimes || [];
            const results = latest.map((a) => this.mapAnimeFromSearch(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const cacheKey = `topRated:${page}:${limit}`;
        const cached = this.getCached<TopAnime[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.apiRequest<HomeResponse>('/home', {}, options);
            const topAnimes = data.top10Animes?.today || data.top10Animes?.week || [];
            const results = topAnimes.slice(0, limit).map((a, i) => ({
                rank: a.rank || ((page - 1) * limit + i + 1),
                anime: this.mapAnimeFromSearch(a)
            }));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopRated');
            return [];
        }
    }

    async getPopular(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `popular:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.apiRequest<CategoryResponse>('/category/most-popular', { page }, options);
            const results = (data.animes || []).map((a) => this.mapAnimeFromSearch(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getPopular');
            return [];
        }
    }

    async getTopAiring(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `topAiring:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.apiRequest<CategoryResponse>('/category/top-airing', { page }, options);
            const results = (data.animes || []).map((a) => this.mapAnimeFromSearch(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopAiring');
            return [];
        }
    }

    async getByGenre(genre: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `genre:${genre}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        const slug = genre.toLowerCase().trim().replace(/\s+/g, '-');

        try {
            const data = await this.apiRequest<CategoryResponse>(`/genre/${slug}`, { page }, options);

            const result: AnimeSearchResult = {
                results: (data.animes || []).map((a) => this.mapAnimeFromSearch(a)),
                totalPages: data.totalPages || 1,
                currentPage: data.currentPage || page,
                hasNextPage: data.hasNextPage || (data.animes || []).length > 0,
                source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            this.handleError(error, 'getByGenre');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getGenres(): Promise<string[]> {
        return [
            "Action", "Adventure", "Cars", "Comedy", "Dementia", "Demons", "Drama", "Ecchi",
            "Fantasy", "Game", "Harem", "Historical", "Horror", "Isekai", "Josei", "Kids",
            "Magic", "Martial Arts", "Mecha", "Military", "Music", "Mystery", "Parody",
            "Police", "Psychological", "Romance", "Samurai", "School", "Sci-Fi", "Seinen",
            "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life", "Space",
            "Sports", "Super Power", "Supernatural", "Thriller", "Vampire"
        ];
    }
}
