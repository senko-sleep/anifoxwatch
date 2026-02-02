import axios, { AxiosInstance } from 'axios';
import { BaseAnimeSource } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';

// Consumet API response types
interface ConsumetAnimeResponse {
    id: string | number;
    title?: {
        english?: string;
        romaji?: string;
        native?: string;
        japanese?: string;
    };
    image?: string;
    poster?: string;
    cover?: string;
    description?: string;
    type?: string;
    status?: string;
    rating?: number;
    genres?: string[];
    episodes?: number;
    totalEpisodes?: number;
    releaseDate?: number;
    year?: number;
    season?: string;
    studios?: string[];
    subOrDub?: 'sub' | 'dub';
    hasDub?: boolean;
    isAdult?: boolean;
}

interface ConsumetEpisodeResponse {
    id: string;
    number?: number;
    episodeNumber?: number;
    title?: string;
    description?: string;
    image?: string;
    airDate?: string;
    isFiller?: boolean;
    hasDub?: boolean;
}

interface ConsumetStreamingResponse {
    sources: Array<{
        url: string;
        quality?: string;
        isM3U8?: boolean;
    }>;
    subtitles?: Array<{
        url: string;
        lang: string;
    }>;
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
}

/**
 * Consumet API Source - Aggregates multiple anime streaming providers
 * Supports: Gogoanime, Zoro/Aniwatch, 9anime patterns, and more
 * 
 * This connects to a Consumet API instance for aggregated streaming
 * You can self-host Consumet or use a public instance
 */
export class ConsumetSource extends BaseAnimeSource {
    name = 'Consumet';
    baseUrl: string;
    private client: AxiosInstance;
    private provider: 'gogoanime' | 'zoro' | '9anime';

    // In-memory cache for speed
    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = 5 * 60 * 1000; // 5 minutes

    constructor(
        apiUrl: string = process.env.CONSUMET_API_URL || 'https://api.consumet.org',
        provider: 'gogoanime' | 'zoro' | '9anime' = 'zoro'
    ) {
        super();
        this.baseUrl = apiUrl;
        this.provider = provider;
        this.client = axios.create({
            baseURL: `${apiUrl}/anime/${provider}`,
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AniStreamHub/1.0'
            }
        });
    }

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.data as T;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: unknown, ttl: number = this.cacheTTL): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.get('/recent-episodes', {
                params: { page: 1 },
                timeout: 5000
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch (error) {
            this.handleError(error, 'healthCheck');
            return false;
        }
    }

    private mapAnime(data: ConsumetAnimeResponse): AnimeBase {
        return {
            id: `consumet-${this.provider}-${data.id}`,
            title: data.title?.english || data.title?.romaji || 'Unknown',
            titleJapanese: data.title?.native || data.title?.japanese,
            image: data.image || data.poster || '',
            cover: data.cover || data.image,
            description: data.description?.replace(/<[^>]*>/g, '') || 'No description available.',
            type: this.mapType(data.type || 'TV'),
            status: this.mapStatus(data.status || 'Unknown'),
            rating: data.rating ? data.rating / 10 : undefined,
            genres: data.genres || [],
            episodes: data.episodes || data.totalEpisodes || 0,
            studios: data.studios || [],
            season: data.season,
            year: data.releaseDate || data.year,
            subCount: data.subOrDub === 'sub' ? data.totalEpisodes : data.totalEpisodes,
            dubCount: data.subOrDub === 'dub' || data.hasDub ? data.totalEpisodes : 0,
            isMature: data.isAdult || false,
            source: `${this.name}:${this.provider}`
        };
    }

    private mapType(type: unknown): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const typeMap: Record<string, 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special'> = {
            'TV': 'TV', 'TV_SHORT': 'TV', 'MOVIE': 'Movie', 'OVA': 'OVA',
            'ONA': 'ONA', 'SPECIAL': 'Special', 'MUSIC': 'Special'
        };
        return typeMap[String(type)?.toUpperCase()] || 'TV';
    }

    private mapStatus(status: unknown): 'Ongoing' | 'Completed' | 'Upcoming' {
        const statusMap: Record<string, 'Ongoing' | 'Completed' | 'Upcoming'> = {
            'ongoing': 'Ongoing', 'releasing': 'Ongoing', 'not_yet_aired': 'Upcoming',
            'completed': 'Completed', 'finished': 'Completed', 'cancelled': 'Completed'
        };
        return statusMap[String(status)?.toLowerCase()] || 'Completed';
    }

    async search(query: string, page: number = 1, filters?: any): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`/${encodeURIComponent(query)}`, {
                params: { page }
            });

            const result: AnimeSearchResult = {
                results: (response.data.results || []).map((a: ConsumetAnimeResponse) => this.mapAnime(a)),
                totalPages: response.data.totalPages || 1,
                currentPage: page,
                hasNextPage: response.data.hasNextPage || false,
                source: `${this.name}:${this.provider}`
            };

            this.setCache(cacheKey, result);
            return result;
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string): Promise<AnimeBase | null> {
        const cacheKey = `anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const animeId = id.replace(`consumet-${this.provider}-`, '');
            const response = await this.client.get(`/info/${animeId}`);
            const anime = this.mapAnime(response.data as ConsumetAnimeResponse);
            this.setCache(cacheKey, anime, 10 * 60 * 1000); // 10 min cache
            return anime;
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const cacheKey = `episodes:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const id = animeId.replace(`consumet-${this.provider}-`, '');
            const response = await this.client.get(`/info/${id}`);

            const episodes: Episode[] = (response.data.episodes || []).map((ep: ConsumetEpisodeResponse) => ({
                id: ep.id,
                number: ep.number || ep.episodeNumber || 1,
                title: ep.title || `Episode ${ep.number || ep.episodeNumber || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: ep.hasDub || (response.data as ConsumetAnimeResponse).hasDub || false,
                thumbnail: ep.image
            }));

            this.setCache(cacheKey, episodes, 10 * 60 * 1000);
            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    /**
     * Get available streaming servers for an episode
     */
    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`/servers/${episodeId}`);
            const servers: EpisodeServer[] = (response.data || []).map((s: { name: string; url: string; type?: string }) => ({
                name: s.name,
                url: s.url,
                type: s.type || 'sub'
            }));
            this.setCache(cacheKey, servers, 30 * 60 * 1000); // 30 min cache
            return servers;
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [];
        }
    }

    /**
     * Get streaming URLs for an episode
     * Returns multiple quality options and subtitle tracks
     */
    async getStreamingLinks(episodeId: string, server?: string): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server || 'default'}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const params: Record<string, string> = {};
            if (server) params.server = server;

            const response = await this.client.get(`/watch/${episodeId}`, { params });

            const streamData: StreamingData = {
                sources: (response.data.sources || []).map((s: { url: string; quality?: string; isM3U8?: boolean }): VideoSource => ({
                    url: s.url,
                    quality: (s.quality as 'default' | 'auto' | '360p' | '480p' | '720p' | '1080p') || 'auto',
                    isM3U8: s.isM3U8 || s.url?.includes('.m3u8') || false,
                    isDASH: s.url?.includes('.mpd') || false
                })),
                subtitles: (response.data.subtitles || []).map((sub: { url: string; lang: string; label?: string }) => ({
                    url: sub.url,
                    lang: sub.lang,
                    label: sub.label
                })),
                headers: response.data.headers,
                intro: response.data.intro,
                outro: response.data.outro,
                download: response.data.download
            };

            this.setCache(cacheKey, streamData, 60 * 60 * 1000); // 1 hour cache
            return streamData;
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get('/top-airing', { params: { page } });
            const results = (response.data.results || []).map((a: ConsumetAnimeResponse) => this.mapAnime(a));
            this.setCache(cacheKey, results);
            return results;
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `latest:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get('/recent-episodes', { params: { page } });
            const results = (response.data.results || []).map((a: ConsumetAnimeResponse) => this.mapAnime(a));
            this.setCache(cacheKey, results);
            return results;
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10): Promise<TopAnime[]> {
        const cacheKey = `topRated:${page}:${limit}`;
        const cached = this.getCached<TopAnime[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get('/top-airing', { params: { page } });
            const results = (response.data.results || [])
                .slice(0, limit)
                .map((a: ConsumetAnimeResponse, i: number) => ({
                    rank: (page - 1) * limit + i + 1,
                    anime: this.mapAnime(a)
                }));
            this.setCache(cacheKey, results);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopRated');
            return [];
        }
    }
}
