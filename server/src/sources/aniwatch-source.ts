import axios, { AxiosInstance } from 'axios';
import { Agent } from 'http';
import { BaseAnimeSource } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';

type AniWatchApiAnime = {
    id?: string;
    name?: string;
    title?:
        | string
        | {
        english?: string;
        romaji?: string;
        native?: string;
    };
    japaneseTitle?: string;
    image?: string;
    poster?: string;
    cover?: string;
    banner?: string;
    description?: string;
    type?: string;
    status?: string;
    rating?: string;
    score?: number;
    totalEpisodes?: number;
    currentEpisodes?: number;
    episodes?: unknown[];
    duration?: number;
    genres?: string[];
    studios?: string[];
    season?: string;
    releaseDate?: number;
    year?: number;
    hasDub?: boolean;
    isAdult?: boolean;
};

/**
 * Aniwatch/HiAnime Source - Direct scraper for high-quality streams
 * Supports multiple servers with auto-fallback
 * Fast HLS streaming with multiple quality options
 */
export class AniwatchSource extends BaseAnimeSource {
    name = 'Aniwatch';
    baseUrl: string;
    private client: AxiosInstance;

    // Performance-optimized cache
    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = 5 * 60 * 1000;

    constructor(apiUrl: string = process.env.ANIWATCH_API_URL || 'https://api.consumet.org/anime/zoro') {
        super();
        this.baseUrl = apiUrl;
        this.client = axios.create({
            baseURL: apiUrl,
            timeout: 8000, // Fast timeout for responsiveness
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'User-Agent': 'AniStreamHub/1.0'
            }
        });

        // Connection pooling for speed
        this.client.defaults.httpAgent = new Agent({
            keepAlive: true,
            maxSockets: 10
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

        // Cleanup old entries periodically
        if (this.cache.size > 1000) {
            const now = Date.now();
            for (const [k, v] of this.cache.entries()) {
                if (v.expires < now) this.cache.delete(k);
            }
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.get('/recent-episodes', {
                params: { page: 1 },
                timeout: 3000
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            this.isAvailable = false;
            return false;
        }
    }

    private mapAnime(data: unknown): AnimeBase {
        const d = data as AniWatchApiAnime;
        const titleObj = typeof d.title === 'object' && d.title !== null ? d.title : undefined;
        return {
            id: `aniwatch-${d.id ?? ''}`,
            title: titleObj?.english || titleObj?.romaji || (typeof d.title === 'string' ? d.title : undefined) || d.name || 'Unknown',
            titleJapanese: titleObj?.native || d.japaneseTitle,
            image: d.image || d.poster || '',
            cover: d.cover || d.image,
            banner: d.banner || d.cover || d.image,
            description: d.description?.replace(/<[^>]*>/g, '').trim() || 'No description available.',
            type: this.mapType(d.type || 'TV'),
            status: this.mapStatus(d.status || 'completed'),
            rating: d.rating ? parseFloat(d.rating) / 10 : (d.score || undefined),
            episodes: d.totalEpisodes || d.episodes?.length || 0,
            episodesAired: d.currentEpisodes || d.totalEpisodes,
            duration: d.duration ? `${d.duration}m` : '24m',
            genres: d.genres || [],
            studios: d.studios || [],
            season: d.season,
            year: d.releaseDate || d.year,
            subCount: d.totalEpisodes || 0,
            dubCount: d.hasDub ? d.totalEpisodes || 0 : 0,
            isMature: d.isAdult || false,
            source: this.name
        };
    }

    private mapType(type: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = type?.toUpperCase() || 'TV';
        if (t.includes('MOVIE')) return 'Movie';
        if (t.includes('OVA')) return 'OVA';
        if (t.includes('ONA')) return 'ONA';
        if (t.includes('SPECIAL')) return 'Special';
        return 'TV';
    }

    private mapStatus(status: string): 'Ongoing' | 'Completed' | 'Upcoming' {
        const s = status?.toLowerCase() || '';
        if (s.includes('ongoing') || s.includes('airing') || s.includes('releasing')) return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not_yet')) return 'Upcoming';
        return 'Completed';
    }

    async search(query: string, page: number = 1): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`/${encodeURIComponent(query)}`, { params: { page } });

            const result: AnimeSearchResult = {
                results: (response.data.results || []).map((a: unknown) => this.mapAnime(a)),
                totalPages: response.data.totalPages || 1,
                currentPage: page,
                hasNextPage: response.data.hasNextPage || false,
                source: this.name
            };

            this.setCache(cacheKey, result, 2 * 60 * 1000); // 2 min cache for search
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
            const animeId = id.replace('aniwatch-', '');
            const response = await this.client.get(`/info`, { params: { id: animeId } });
            const anime = this.mapAnime(response.data);
            this.setCache(cacheKey, anime, 15 * 60 * 1000);
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
            const id = animeId.replace('aniwatch-', '');
            const response = await this.client.get(`/info`, { params: { id } });

            const episodes: Episode[] = (response.data.episodes || []).map((ep: unknown) => {
                const e = ep as Record<string, unknown>;
                const epNumber = (e.number as number | undefined) ?? 1;
                return {
                    id: String(e.id ?? ''),
                    number: epNumber,
                    title: (e.title as string | undefined) || `Episode ${epNumber}`,
                    isFiller: Boolean(e.isFiller),
                hasSub: true,
                    hasDub: Boolean((e.hasDub as boolean | undefined) ?? response.data.hasDub),
                    thumbnail: e.image as string | undefined
                };
            });

            this.setCache(cacheKey, episodes, 15 * 60 * 1000);
            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    /**
     * Get streaming servers for an episode
     */
    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`/servers/${episodeId}`);
            const servers: EpisodeServer[] = (response.data || []).map((s: unknown) => {
                const srv = s as Record<string, unknown>;
                return {
                    name: String(srv.name ?? ''),
                    url: String(srv.url ?? ''),
                    type: (srv.type as string | undefined) || 'sub'
                };
            });
            this.setCache(cacheKey, servers, 60 * 60 * 1000);
            return servers;
        } catch {
            return [];
        }
    }

    /**
     * Get HLS streaming URLs for an episode
     * Optimized for low latency and multiple quality options
     */
    async getStreamingLinks(episodeId: string, server: string = 'vidcloud'): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`/watch/${episodeId}`, {
                params: { server },
                timeout: 5000
            });

            const streamData: StreamingData = {
                sources: (response.data.sources || []).map((s: unknown): VideoSource => {
                    const src = s as Record<string, unknown>;
                    const srcUrl = String(src.url ?? '');
                    return {
                        url: srcUrl,
                        quality: this.normalizeQuality(String(src.quality ?? '')),
                        isM3U8: Boolean(src.isM3U8) || srcUrl.includes('.m3u8'),
                        isDASH: srcUrl.includes('.mpd')
                    };
                }),
                subtitles: (response.data.subtitles || []).map((sub: unknown) => {
                    const st = sub as Record<string, unknown>;
                    const lang = String(st.lang ?? '');
                    return {
                        url: String(st.url ?? ''),
                        lang,
                        label: (st.label as string | undefined) || lang
                    };
                }),
                headers: response.data.headers,
                intro: response.data.intro,
                outro: response.data.outro
            };

            // Cache streaming links for 2 hours (they usually don't change)
            this.setCache(cacheKey, streamData, 2 * 60 * 60 * 1000);
            return streamData;
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    private normalizeQuality(quality: string): VideoSource['quality'] {
        if (!quality) return 'auto';
        const q = quality.toLowerCase();
        if (q.includes('1080')) return '1080p';
        if (q.includes('720')) return '720p';
        if (q.includes('480')) return '480p';
        if (q.includes('360')) return '360p';
        return 'auto';
    }

    async getTrending(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get('/top-airing', { params: { page } });
            const results = (response.data.results || []).map((a: unknown) => this.mapAnime(a));
            this.setCache(cacheKey, results, 10 * 60 * 1000);
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
            const results = (response.data.results || []).map((a: unknown) => this.mapAnime(a));
            this.setCache(cacheKey, results, 3 * 60 * 1000); // Short cache for latest
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
                .map((a: unknown, i: number) => ({
                    rank: (page - 1) * limit + i + 1,
                    anime: this.mapAnime(a)
                }));
            this.setCache(cacheKey, results, 10 * 60 * 1000);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopRated');
            return [];
        }
    }
}
