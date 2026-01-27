import axios, { AxiosInstance } from 'axios';
import { BaseAnimeSource } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';

/**
 * Aniwave Source - Backup streaming provider
 * Features:
 * - High-quality HD streams (720p, 1080p)
 * - Both Sub and Dub support
 * - Multiple server fallbacks (Vidplay, MyCloud, Filemoon)
 * - Concurrency control to prevent rate limiting
 * - Smart caching for performance
 */
export class AniwaveSource extends BaseAnimeSource {
    name = 'Aniwave';
    baseUrl: string;
    private client: AxiosInstance;

    // Concurrency control
    private activeRequests = 0;
    private maxConcurrent = 3;
    private minDelay = 250;
    private lastRequest = 0;
    private requestQueue: Array<{ fn: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }> = [];

    // Smart caching with TTL
    private cache: Map<string, { data: any; expires: number }> = new Map();
    private cacheTTL = {
        search: 3 * 60 * 1000,
        anime: 15 * 60 * 1000,
        episodes: 10 * 60 * 1000,
        stream: 2 * 60 * 60 * 1000,
        servers: 60 * 60 * 1000,
    };

    constructor(apiUrl: string = process.env.ANIME_API_URL || 'https://api.consumet.org') {
        super();
        // Aniwave uses similar API patterns to other providers
        this.baseUrl = `${apiUrl}/anime/animepahe`;
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 12000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AniStreamHub/1.0 (Premium)',
                'Accept-Encoding': 'gzip, deflate'
            }
        });

        // Cleanup cache periodically
        setInterval(() => this.cleanupCache(), 5 * 60 * 1000);
    }

    // ============ CONCURRENCY CONTROL ============

    private async throttledRequest<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ fn, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.activeRequests >= this.maxConcurrent || this.requestQueue.length === 0) {
            return;
        }

        const now = Date.now();
        const timeSinceLast = now - this.lastRequest;
        if (timeSinceLast < this.minDelay) {
            setTimeout(() => this.processQueue(), this.minDelay - timeSinceLast);
            return;
        }

        const request = this.requestQueue.shift();
        if (!request) return;

        this.activeRequests++;
        this.lastRequest = Date.now();

        try {
            const result = await request.fn();
            request.resolve(result);
        } catch (error) {
            request.reject(error);
        } finally {
            this.activeRequests--;
            this.processQueue();
        }
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

    private setCache(key: string, data: any, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    private cleanupCache(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (value.expires < now) this.cache.delete(key);
        }
    }

    // ============ DATA MAPPING ============

    private mapAnime(data: any): AnimeBase {
        const episodes = data.totalEpisodes || data.episodes?.length || 0;
        return {
            id: `aniwave-${data.id}`,
            title: data.title?.english || data.title?.romaji || data.title || data.name || 'Unknown',
            titleJapanese: data.title?.native || data.japaneseTitle,
            image: data.image || data.poster || '',
            cover: data.cover || data.image,
            banner: data.banner || data.cover || data.image,
            description: this.cleanDescription(data.description || data.synopsis),
            type: this.mapType(data.type),
            status: this.mapStatus(data.status),
            rating: data.rating ? parseFloat(String(data.rating)) / 10 : (data.score || undefined),
            episodes,
            episodesAired: data.currentEpisodes || episodes,
            duration: data.duration ? `${data.duration}m` : '24m',
            genres: data.genres || [],
            studios: data.studios || [],
            season: data.season,
            year: data.releaseDate || data.year,
            subCount: episodes,
            dubCount: data.hasDub ? episodes : 0,
            isMature: data.isAdult || false,
            source: this.name
        };
    }

    private cleanDescription(desc: string | undefined): string {
        if (!desc) return 'No description available.';
        return desc.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    private mapType(type: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = (type || '').toUpperCase();
        if (t.includes('MOVIE')) return 'Movie';
        if (t.includes('OVA')) return 'OVA';
        if (t.includes('ONA')) return 'ONA';
        if (t.includes('SPECIAL')) return 'Special';
        return 'TV';
    }

    private mapStatus(status: string): 'Ongoing' | 'Completed' | 'Upcoming' {
        const s = (status || '').toLowerCase();
        if (s.includes('ongoing') || s.includes('airing') || s.includes('releasing')) return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not_yet')) return 'Upcoming';
        return 'Completed';
    }

    // ============ API METHODS ============

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.throttledRequest(() =>
                this.client.get('/recent-episodes', { params: { page: 1 }, timeout: 5000 })
            );
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            this.isAvailable = false;
            return false;
        }
    }

    async search(query: string, page: number = 1): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.throttledRequest(() =>
                this.client.get(`/${encodeURIComponent(query)}`, { params: { page } })
            );

            const result: AnimeSearchResult = {
                results: (response.data.results || []).map((a: any) => this.mapAnime(a)),
                totalPages: response.data.totalPages || 1,
                currentPage: page,
                hasNextPage: response.data.hasNextPage || false,
                source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
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
            const animeId = id.replace('aniwave-', '');
            const response = await this.throttledRequest(() =>
                this.client.get(`/info/${animeId}`)
            );
            const anime = this.mapAnime(response.data);
            this.setCache(cacheKey, anime, this.cacheTTL.anime);
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
            const id = animeId.replace('aniwave-', '');
            const response = await this.throttledRequest(() =>
                this.client.get(`/info/${id}`)
            );

            const episodes: Episode[] = (response.data.episodes || []).map((ep: any) => ({
                id: ep.id,
                number: ep.number || 1,
                title: ep.title || `Episode ${ep.number || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: ep.hasDub || response.data.hasDub || false,
                thumbnail: ep.image
            }));

            this.setCache(cacheKey, episodes, this.cacheTTL.episodes);
            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    /**
     * Get streaming servers with quality info
     */
    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.throttledRequest(() =>
                this.client.get(`/servers/${episodeId}`)
            );

            const servers: EpisodeServer[] = (response.data || []).map((s: any) => ({
                name: s.name,
                url: s.url || '',
                type: (s.type || 'sub') as 'sub' | 'dub' | 'raw'
            }));

            this.setCache(cacheKey, servers, this.cacheTTL.servers);
            return servers;
        } catch {
            // Return default servers on error
            return [
                { name: 'vidplay', url: '', type: 'sub' },
                { name: 'mycloud', url: '', type: 'sub' },
                { name: 'filemoon', url: '', type: 'sub' }
            ];
        }
    }

    /**
     * Get HD streaming links with multiple quality options
     */
    async getStreamingLinks(episodeId: string, server: string = 'vidplay'): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.throttledRequest(() =>
                this.client.get(`/watch/${episodeId}`, { params: { server }, timeout: 8000 })
            );

            // Map to HD quality options
            const sources = (response.data.sources || []).map((s: any): VideoSource => ({
                url: s.url,
                quality: this.normalizeQuality(s.quality),
                isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                isDASH: s.url?.includes('.mpd')
            }));

            // Sort by quality (highest first)
            sources.sort((a: VideoSource, b: VideoSource) => {
                const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                return (order[a.quality] || 5) - (order[b.quality] || 5);
            });

            const streamData: StreamingData = {
                sources,
                subtitles: (response.data.subtitles || []).map((sub: any) => ({
                    url: sub.url,
                    lang: sub.lang,
                    label: sub.label || sub.lang
                })),
                headers: response.data.headers,
                intro: response.data.intro,
                outro: response.data.outro
            };

            this.setCache(cacheKey, streamData, this.cacheTTL.stream);
            return streamData;
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    private normalizeQuality(quality: string): VideoSource['quality'] {
        if (!quality) return 'auto';
        const q = quality.toLowerCase();
        if (q.includes('1080') || q.includes('fhd') || q.includes('full')) return '1080p';
        if (q.includes('720') || q.includes('hd')) return '720p';
        if (q.includes('480') || q.includes('sd')) return '480p';
        if (q.includes('360')) return '360p';
        return 'auto';
    }

    async getTrending(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.throttledRequest(() =>
                this.client.get('/airing', { params: { page } })
            );
            const results = (response.data.results || []).map((a: any) => this.mapAnime(a));
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
            const response = await this.throttledRequest(() =>
                this.client.get('/recent-episodes', { params: { page } })
            );
            const results = (response.data.results || []).map((a: any) => this.mapAnime(a));
            this.setCache(cacheKey, results, 3 * 60 * 1000);
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
            const response = await this.throttledRequest(() =>
                this.client.get('/airing', { params: { page } })
            );
            const results = (response.data.results || [])
                .slice(0, limit)
                .map((a: any, i: number) => ({
                    rank: (page - 1) * limit + i + 1,
                    anime: this.mapAnime(a)
                }));
            this.setCache(cacheKey, results, 15 * 60 * 1000);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopRated');
            return [];
        }
    }
}
