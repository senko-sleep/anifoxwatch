import axios, { AxiosInstance } from 'axios';
import { BaseAnimeSource } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { Agent } from 'http';
import { logger } from '../utils/logger.js';

/**
 * HiAnime Source - Primary reliable anime source using the aniwatch-api
 * API Documentation: https://github.com/ghoshRitesh12/aniwatch-api
 * 
 * Features:
 * - High-quality HD streams (720p, 1080p)
 * - Both Sub and Dub support
 * - Multiple server fallbacks
 * - Proper data scraping from hianime.to
 */
export class HiAnimeSource extends BaseAnimeSource {
    name = 'HiAnime';
    baseUrl: string;
    private client: AxiosInstance;

    // Smart caching with TTL
    private cache: Map<string, { data: any; expires: number }> = new Map();
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
        'http://localhost:4000',
        'https://aniwatch-api-v2.vercel.app',
        'https://api-aniwatch.onrender.com',
        'https://aniwatch-api.onrender.com',
        'https://hianime-api-chi.vercel.app',
    ];
    private currentApiIndex = 0;

    constructor(apiUrl?: string) {
        super();
        this.baseUrl = apiUrl || this.apiInstances[0];
        this.client = axios.create({
            baseURL: `${this.baseUrl}/api/v2/hianime`,
            timeout: 15000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AniStreamHub/1.0'
            }
        });

        // Connection pooling
        this.client.defaults.httpAgent = new Agent({
            keepAlive: true,
            maxSockets: 10
        });

        // Cleanup cache periodically
        setInterval(() => this.cleanupCache(), 5 * 60 * 1000);
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

    // ============ API REQUEST WITH FALLBACK ============

    private async apiRequest<T>(path: string, params?: Record<string, any>): Promise<T> {
        let lastError: Error | null = null;

        // Try current API instance first, then fallback to others
        for (let i = 0; i < this.apiInstances.length; i++) {
            const apiIndex = (this.currentApiIndex + i) % this.apiInstances.length;
            const apiUrl = this.apiInstances[apiIndex];

            try {
                const response = await axios.get(`${apiUrl}/api/v2/hianime${path}`, {
                    params,
                    timeout: 15000,
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'AniStreamHub/1.0'
                    }
                });

                const isSuccess = response.data?.success === true || response.data?.status === 200;

                if (isSuccess) {
                    // Update current API index to this working one
                    this.currentApiIndex = apiIndex;
                    return (response.data.data || response.data) as T;
                }
                throw new Error(`API returned success: false or status: ${response.data?.status}`);
            } catch (error: any) {
                lastError = error;
                logger.warn(`API ${apiUrl} failed: ${error.message}`, { path, params }, this.name);
                continue;
            }
        }

        throw lastError || new Error('All API instances failed');
    }

    // ============ DATA MAPPING ============

    private mapAnime(data: any): AnimeBase {
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

    private mapAnimeFromSearch(data: any): AnimeBase {
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
        if (s.includes('ongoing') || s.includes('airing') || s.includes('currently')) return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not yet')) return 'Upcoming';
        return 'Completed';
    }

    // ============ API METHODS ============

    async healthCheck(): Promise<boolean> {
        try {
            await this.apiRequest('/home');
            this.isAvailable = true;
            return true;
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
            const data = await this.apiRequest<any>('/search', { q: query, page });

            const result: AnimeSearchResult = {
                results: (data.animes || []).map((a: any) => this.mapAnimeFromSearch(a)),
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

    async getAnime(id: string): Promise<AnimeBase | null> {
        const cacheKey = `anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const animeId = id.replace('hianime-', '');
            const data = await this.apiRequest<any>(`/anime/${animeId}`);

            const anime = this.mapAnime(data.anime?.info || data.anime || data);

            // Merge in moreInfo if available
            if (data.anime?.moreInfo) {
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

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const cacheKey = `episodes:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const id = animeId.replace('hianime-', '');
            const data = await this.apiRequest<any>(`/anime/${id}/episodes`);

            const episodes: Episode[] = (data.episodes || []).map((ep: any) => ({
                id: ep.episodeId,
                number: ep.number || 1,
                title: ep.title || `Episode ${ep.number || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: true, // Will be determined by server response
                thumbnail: undefined
            }));

            this.setCache(cacheKey, episodes, this.cacheTTL.episodes);
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
            // episodeId is already in full format "anime-id?ep=number"
            // For the chi API, we can get servers from the /api/stream endpoint
            const apiUrl = this.apiInstances[this.currentApiIndex];

            let servers: EpisodeServer[] = [];

            if (apiUrl.includes('chi.vercel.app')) {
                // Use new ZEN API structure
                const response = await axios.get(`${apiUrl}/api/stream`, {
                    params: { id: episodeId, server: 'hd-1', type: 'sub' }
                });

                if (response.data?.success && response.data.results?.servers) {
                    servers = response.data.results.servers.map((s: any) => ({
                        name: s.server_name || s.name,
                        url: '',
                        type: s.type || 'sub'
                    }));
                }
            } else {
                // Use legacy aniwatch-api structure
                const data = await this.apiRequest<any>('/episode/servers', { animeEpisodeId: episodeId });
                if (data.sub) {
                    data.sub.forEach((s: any) => {
                        servers.push({ name: s.serverName, url: '', type: 'sub' });
                    });
                }
                if (data.dub) {
                    data.dub.forEach((s: any) => {
                        servers.push({ name: s.serverName, url: '', type: 'dub' });
                    });
                }
            }

            if (servers.length === 0) {
                // Fallback defaults
                servers = [
                    { name: 'hd-1', url: '', type: 'sub' },
                    { name: 'hd-2', url: '', type: 'sub' }
                ];
            }

            this.setCache(cacheKey, servers, this.cacheTTL.servers);
            return servers;
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [
                { name: 'hd-1', url: '', type: 'sub' },
                { name: 'hd-2', url: '', type: 'sub' }
            ];
        }
    }

    /**
     * Get HD streaming links for an episode
     */
    async getStreamingLinks(episodeId: string, server: string = 'hd-1', category: 'sub' | 'dub' = 'sub'): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const apiUrl = this.apiInstances[this.currentApiIndex];
            let streamData: StreamingData = { sources: [], subtitles: [] };

            // If we're on the chi.vercel.app instance, prefer its /api/stream endpoint
            if (apiUrl.includes('chi.vercel.app')) {
                try {
                    const response = await axios.get(`${apiUrl}/api/stream`, {
                        params: { id: episodeId, server, type: category }
                    });

                    if (response.data?.success && response.data?.results) {
                        const results = response.data.results;
                        streamData = {
                            sources: (results.sources || []).map((s: any): VideoSource => ({
                                url: s.url,
                                quality: this.normalizeQuality(s.quality || s.label || 'auto'),
                                isM3U8: s.isM3U8 || (typeof s.url === 'string' && s.url.includes('.m3u8')),
                                isDASH: typeof s.url === 'string' && s.url.includes('.mpd')
                            })),
                            subtitles: (results.subtitles || []).map((sub: any) => ({
                                url: sub.url,
                                lang: sub.lang || sub.language || 'Unknown',
                                label: sub.label || sub.lang || sub.language
                            })),
                            headers: results.headers,
                            intro: results.intro,
                            outro: results.outro,
                            source: this.name
                        };

                        // Sort sources by quality (highest first)
                        if (streamData.sources.length > 1) {
                            streamData.sources.sort((a, b) => {
                                const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                                return (order[a.quality] || 5) - (order[b.quality] || 5);
                            });
                        }

                        this.setCache(cacheKey, streamData, this.cacheTTL.stream);
                        return streamData;
                    }
                } catch (e) {
                    // Fall through to legacy endpoint
                    logger.warn(`CHI /api/stream failed, falling back to legacy endpoints`, undefined, this.name);
                }
            }

            // Try standard endpoint structure first even for chi
            const data = await this.apiRequest<any>('/episode/sources', {
                animeEpisodeId: episodeId,
                server,
                type: category
            });

            streamData = {
                sources: (data.sources || []).map((s: any): VideoSource => ({
                    url: s.url,
                    quality: this.normalizeQuality(s.quality),
                    isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                    isDASH: s.url?.includes('.mpd')
                })),
                subtitles: (data.subtitles || []).map((sub: any) => ({
                    url: sub.url,
                    lang: sub.lang,
                    label: sub.lang
                })),
                headers: data.headers,
                intro: data.intro,
                outro: data.outro,
                source: this.name
            };

            // Sort sources by quality (highest first) if multiple sources available
            if (streamData.sources.length > 1) {
                streamData.sources.sort((a, b) => {
                    const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                    return (order[a.quality] || 5) - (order[b.quality] || 5);
                });
            }

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
        if (q.includes('1080') || q.includes('fhd')) return '1080p';
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
            const data = await this.apiRequest<any>('/home');

            // Get trending animes from home page
            const trending = data.trendingAnimes || data.spotlightAnimes || [];
            const results = trending.map((a: any) => this.mapAnimeFromSearch(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
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
            const data = await this.apiRequest<any>('/home');

            // Get latest episode animes from home page
            const latest = data.latestEpisodeAnimes || [];
            const results = latest.map((a: any) => this.mapAnimeFromSearch(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
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
            const data = await this.apiRequest<any>('/home');

            // Get top 10 animes from home page
            const topAnimes = data.top10Animes?.today || data.top10Animes?.week || [];
            const results = topAnimes.slice(0, limit).map((a: any, i: number) => ({
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

    /**
     * Get popular animes
     */
    async getPopular(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `popular:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.apiRequest<any>('/category/most-popular', { page });
            const results = (data.animes || []).map((a: any) => this.mapAnimeFromSearch(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getPopular');
            return [];
        }
    }

    /**
     * Get top airing animes
     */
    async getTopAiring(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `topAiring:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.apiRequest<any>('/category/top-airing', { page });
            const results = (data.animes || []).map((a: any) => this.mapAnimeFromSearch(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopAiring');
            return [];
        }
    }
}
