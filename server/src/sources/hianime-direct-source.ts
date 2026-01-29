/**
 * HiAnime Direct Source - Uses the aniwatch package directly for deep scraping
 * This bypasses external APIs and scrapes directly from hianimez.to
 * 
 * This is the most reliable source as it doesn't depend on third-party APIs
 */

import { HiAnime } from 'aniwatch';
import { BaseAnimeSource, GenreAwareSource } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

export class HiAnimeDirectSource extends BaseAnimeSource implements GenreAwareSource {
    name = 'HiAnimeDirect';
    baseUrl = 'https://hianimez.to';
    private scraper: HiAnime.Scraper;

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

    // Server priority order - hd-2 works best based on testing
    private serverPriority = ['hd-2', 'hd-1', 'hd-3', 'megacloud', 'streamsb'];

    constructor() {
        super();
        this.scraper = new HiAnime.Scraper();

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

    private setCache(key: string, data: unknown, ttl: number): void {
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
            episodes: data.episodes?.sub || data.stats?.episodes?.sub || data.totalEpisodes || 0,
            episodesAired: data.episodes?.sub || data.stats?.episodes?.sub || 0,
            duration: data.duration || '24m',
            genres: data.genres || [],
            studios: data.studios || [],
            season: data.season,
            year: data.aired ? parseInt(data.aired) : undefined,
            subCount: data.episodes?.sub || data.stats?.episodes?.sub || 0,
            dubCount: data.episodes?.dub || data.stats?.episodes?.dub || 0,
            isMature: data.rating === 'R+' || data.rating === 'R-17+',
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

    /**
     * Helper to delay execution
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============ API METHODS ============

    async healthCheck(): Promise<boolean> {
        try {
            const home = await this.scraper.getHomePage();
            this.isAvailable = !!(home.trendingAnimes && home.trendingAnimes.length > 0);
            return this.isAvailable;
        } catch (error) {
            this.handleError(error, 'healthCheck');
            return false;
        }
    }

    async search(query: string, page: number = 1): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.scraper.search(query, page);

            const result: AnimeSearchResult = {
                results: (data.animes || []).map((a: any) => this.mapAnime(a)),
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
            const data = await this.scraper.getInfo(animeId);

            if (!data.anime?.info) {
                return null;
            }

            const anime = this.mapAnime({
                ...data.anime.info,
                ...data.anime.moreInfo,
                id: animeId
            });

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
            const data = await this.scraper.getEpisodes(id);

            const episodes: Episode[] = (data.episodes || []).map((ep: any) => ({
                id: ep.episodeId || `${id}?ep=${ep.number}`,
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

    /**
     * Get streaming servers for an episode
     */
    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.scraper.getEpisodeServers(episodeId);

            const servers: EpisodeServer[] = [];

            if (data.sub) {
                data.sub.forEach((s: any) => {
                    servers.push({
                        name: s.serverName || 'unknown',
                        url: '',
                        type: 'sub'
                    });
                });
            }

            if (data.dub) {
                data.dub.forEach((s: any) => {
                    servers.push({
                        name: s.serverName || 'unknown',
                        url: '',
                        type: 'dub'
                    });
                });
            }

            // Sort servers by priority (hd-2 first as it works best)
            servers.sort((a, b) => {
                const aIndex = this.serverPriority.indexOf(a.name);
                const bIndex = this.serverPriority.indexOf(b.name);
                const aPriority = aIndex === -1 ? 999 : aIndex;
                const bPriority = bIndex === -1 ? 999 : bIndex;
                return aPriority - bPriority;
            });

            this.setCache(cacheKey, servers, this.cacheTTL.servers);
            return servers;
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            // Return default servers
            return [
                { name: 'hd-2', url: '', type: 'sub' },
                { name: 'hd-1', url: '', type: 'sub' }
            ];
        }
    }

    /**
     * Get HD streaming links for an episode - DEEP SCRAPING
     * This is the critical method that extracts actual streaming URLs
     * Includes retry logic with exponential backoff for rate limiting
     */
    async getStreamingLinks(episodeId: string, server: string = 'hd-2', category: 'sub' | 'dub' = 'sub'): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        logger.info(`[${this.name}] Getting streaming links for ${episodeId} (server: ${server}, category: ${category})`);

        // Try servers in priority order if the requested server fails
        const serversToTry = [server, ...this.serverPriority.filter(s => s !== server)];
        const maxRetries = 2;

        for (const currentServer of serversToTry) {
            for (let retry = 0; retry <= maxRetries; retry++) {
                try {
                    if (retry > 0) {
                        const delayMs = retry * 1000; // 1s, 2s delay
                        logger.info(`[${this.name}] Retry ${retry}/${maxRetries} for ${currentServer} after ${delayMs}ms`);
                        await this.delay(delayMs);
                    }

                    logger.info(`[${this.name}] Trying server: ${currentServer}`);

                    const data = await this.scraper.getEpisodeSources(
                        episodeId,
                        currentServer as HiAnime.AnimeServers,
                        category
                    );

                    if (data.sources && data.sources.length > 0) {
                        // Cast to any to access all properties from the response
                        const rawData = data as any;

                        const streamData: StreamingData = {
                            sources: data.sources.map((s: any): VideoSource => ({
                                url: s.url,
                                quality: this.normalizeQuality(s.quality || 'auto'),
                                isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                                isDASH: s.url?.includes('.mpd')
                            })),
                            subtitles: (rawData.tracks || rawData.subtitles || [])
                                .filter((t: any) => t.lang !== 'thumbnails')
                                .map((sub: any) => ({
                                    url: sub.url,
                                    lang: sub.lang || sub.language || 'Unknown',
                                    label: sub.label || sub.lang || sub.language
                                })),
                            headers: rawData.headers || { 'Referer': 'https://megacloud.blog/' },
                            intro: rawData.intro,
                            outro: rawData.outro,
                            source: this.name
                        };

                        // Sort sources by quality (highest first)
                        if (streamData.sources.length > 1) {
                            streamData.sources.sort((a, b) => {
                                const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                                return (order[a.quality] || 5) - (order[b.quality] || 5);
                            });
                        }

                        logger.info(`[${this.name}] ✅ Found ${streamData.sources.length} sources from ${currentServer}`);
                        this.setCache(cacheKey, streamData, this.cacheTTL.stream);
                        return streamData;
                    }
                } catch (error: any) {
                    logger.warn(`[${this.name}] Server ${currentServer} failed (attempt ${retry + 1}): ${error.message}`);
                    // Continue to next retry or server
                }
            }
        }

        logger.error(`[${this.name}] All servers failed for ${episodeId}`);
        return { sources: [], subtitles: [] };
    }

    async getTrending(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            // Try to get more anime by fetching multiple pages from category
            const allAnime: AnimeBase[] = [];
            
            // Fetch from top-airing category for more results
            try {
                const airingData = await this.scraper.getCategoryAnime('top-airing' as any, page);
                if (airingData.animes && airingData.animes.length > 0) {
                    allAnime.push(...airingData.animes.map((a: any) => this.mapAnime(a)));
                }
            } catch {
                // Fallback to home page
            }
            
            // If we don't have enough, also fetch from home page trending
            if (allAnime.length < 24) {
                try {
                    const data = await this.scraper.getHomePage();
                    const trending = data.trendingAnimes || data.spotlightAnimes || [];
                    allAnime.push(...trending.map((a: any) => this.mapAnime(a)));
                } catch {
                    // Ignore error
                }
            }
            
            // Remove duplicates
            const uniqueAnime = Array.from(new Map(allAnime.map(a => [a.id, a])).values());
            
            this.setCache(cacheKey, uniqueAnime.slice(0, 48), this.cacheTTL.home);
            return uniqueAnime.slice(0, 48);
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
            const allAnime: AnimeBase[] = [];
            
            // Fetch from latest category for more results
            try {
                const latestData = await this.scraper.getCategoryAnime('latest' as any, page);
                if (latestData.animes && latestData.animes.length > 0) {
                    allAnime.push(...latestData.animes.map((a: any) => this.mapAnime(a)));
                }
            } catch {
                // Fallback to home page
            }
            
            // Also fetch from home page latest episodes
            if (allAnime.length < 24) {
                try {
                    const data = await this.scraper.getHomePage();
                    const latest = data.latestEpisodeAnimes || [];
                    allAnime.push(...latest.map((a: any) => this.mapAnime(a)));
                } catch {
                    // Ignore error
                }
            }
            
            // Remove duplicates
            const uniqueAnime = Array.from(new Map(allAnime.map(a => [a.id, a])).values());
            
            this.setCache(cacheKey, uniqueAnime.slice(0, 48), this.cacheTTL.home);
            return uniqueAnime.slice(0, 48);
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
            const data = await this.scraper.getHomePage();
            const topAnimes = data.top10Animes?.today || data.top10Animes?.week || [];
            const results = topAnimes.slice(0, limit).map((a: any, i: number) => ({
                rank: a.rank || ((page - 1) * limit + i + 1),
                anime: this.mapAnime(a)
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
            const data = await this.scraper.getCategoryAnime('most-popular' as any, page);
            const results = (data.animes || []).map((a: any) => this.mapAnime(a));

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
            const data = await this.scraper.getCategoryAnime('top-airing' as any, page);
            const results = (data.animes || []).map((a: any) => this.mapAnime(a));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopAiring');
            return [];
        }
    }

    /**
     * Get anime by genre - DEEP SCRAPING
     * Uses the genre endpoint to get anime specifically for that genre
     * Falls back to search if genre endpoint fails, but only for niche/specific genres
     */
    async getByGenre(genre: string, page: number = 1): Promise<AnimeSearchResult> {
        const cacheKey = `genre:${genre}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        // List of generic genre names that would return wrong results from search
        const genericGenres = ['action', 'adventure', 'comedy', 'drama', 'romance', 'sci-fi', 'fantasy', 'horror', 'slice-of-life', 'sports', 'supernatural', 'mystery', 'thriller', 'music', 'mecha'];
        const isGenericGenre = genericGenres.includes(genre.toLowerCase());

        try {
            // Try the genre endpoint first
            const data = await this.scraper.getGenreAnime(genre.toLowerCase(), page);
            
            const result: AnimeSearchResult = {
                results: (data.animes || []).map((a: any) => this.mapAnime(a)),
                totalPages: data.totalPages || 1,
                currentPage: data.currentPage || page,
                hasNextPage: data.hasNextPage || false,
                source: this.name
            };

            // If we got results, return them
            if (result.results && result.results.length > 0) {
                this.setCache(cacheKey, result, this.cacheTTL.search);
                return result;
            }
            
            // If no results from genre endpoint
            if (isGenericGenre) {
                // For generic genres, don't use search fallback - return empty results
                // This is because search would return anime with the genre name in the title
                // which is not the same as anime that are actually in that genre
                logger.info(`[${this.name}] Genre endpoint returned no results for generic genre: ${genre}, returning empty to avoid wrong results`);
                return {
                    results: [],
                    totalPages: 0,
                    currentPage: page,
                    hasNextPage: false,
                    source: this.name
                };
            }
            
            // For niche genres, fall back to search
            throw new Error('No results from genre endpoint');
        } catch (error) {
            this.handleError(error, 'getByGenre');
            
            // For generic genres, don't try search fallback
            if (isGenericGenre) {
                return {
                    results: [],
                    totalPages: 0,
                    currentPage: page,
                    hasNextPage: false,
                    source: this.name
                };
            }
            
            // Fallback: Use search for niche genres
            try {
                logger.info(`[${this.name}] Falling back to search for niche genre: ${genre}`);
                const searchData = await this.scraper.search(genre, page);
                
                const result: AnimeSearchResult = {
                    results: (searchData.animes || []).map((a: any) => this.mapAnime(a)),
                    totalPages: searchData.totalPages || 1,
                    currentPage: searchData.currentPage || page,
                    hasNextPage: searchData.hasNextPage || false,
                    source: this.name
                };
                
                this.setCache(cacheKey, result, this.cacheTTL.search);
                return result;
            } catch (searchError) {
                this.handleError(searchError, 'getByGenre-search-fallback');
                return {
                    results: [],
                    totalPages: 0,
                    currentPage: page,
                    hasNextPage: false,
                    source: this.name
                };
            }
        }
    }
}
