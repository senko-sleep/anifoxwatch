/**
 * HiAnime Direct Source - Uses the aniwatch package directly for deep scraping
 * This bypasses external APIs and scrapes directly from hianimez.to
 * 
 * This is the most reliable source as it doesn't depend on third-party APIs
 */

import { HiAnime } from 'aniwatch';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, GenreAwareSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

export class HiAnimeDirectSource extends BaseAnimeSource implements GenreAwareSource {
    name = 'HiAnimeDirect';
    baseUrl = 'https://hianime.to';
    private scraper: HiAnime.Scraper | null = null;
    private scraperInitialized = false;

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
        // Lazy initialization - don't create scraper in constructor
        // This is required for Cloudflare Workers compatibility
    }

    /**
     * Initialize the scraper on first use (lazy initialization)
     */
    private getScraper(): HiAnime.Scraper {
        if (!this.scraper) {
            // @ts-ignore - Pass baseUrl to constructor
            this.scraper = new HiAnime.Scraper(this.baseUrl);
            this.scraperInitialized = true;
        }
        return this.scraper;
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
        // Only cleanup if scraper was initialized (handler context exists)
        if (!this.scraperInitialized) return;
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

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const home = await this.executeWithSignal(
                () => this.getScraper().getHomePage(),
                options?.signal
            );
            this.isAvailable = !!(home.trendingAnimes && home.trendingAnimes.length > 0);
            return this.isAvailable;
        } catch (error) {
            this.handleError(error, 'healthCheck');
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}:${JSON.stringify(filters || {})}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.executeWithSignal(
                () => this.getScraper().search(query, page, filters),
                options?.signal
            );

            const result: AnimeSearchResult = {
                results: (data.animes || []).map((a: any) => this.mapAnime(a)),
                totalPages: data.totalPages || 1,
                currentPage: data.currentPage || page,
                hasNextPage: data.hasNextPage || false,
                source: this.name
            };

            if (!result.results || result.results.length === 0) {
                logger.warn(`Direct search returned no results for query "${query}"`, { query, page }, this.name);
            } else {
                logger.info(`Direct search returned ${result.results.length} results for query "${query}"`, { query, page, count: result.results.length }, this.name);
            }

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            this.handleError(error, 'search');
            logger.warn(`Direct search failed for query "${query}", returning empty results`, { query, page }, this.name);
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const cacheKey = `anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const animeId = id.replace('hianime-', '');
            const data = await this.executeWithSignal(
                () => this.getScraper().getInfo(animeId),
                options?.signal
            );

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

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cacheKey = `episodes:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const id = animeId.replace('hianime-', '');
            const data = await this.executeWithSignal(
                () => this.getScraper().getEpisodes(id),
                options?.signal
            );

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
    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.executeWithSignal(
                () => this.getScraper().getEpisodeServers(episodeId),
                options?.signal
            );

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
     */
    async getStreamingLinks(episodeId: string, server: string = 'hd-2', category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        logger.info(`[${this.name}] Getting streaming links for ${episodeId} (server: ${server}, category: ${category})`);

        // Try servers in priority order if the requested server fails
        const serversToTry = [server, ...this.serverPriority.filter(s => s !== server)];
        const maxRetries = 2;

        for (const currentServer of serversToTry) {
            for (let retry = 0; retry <= maxRetries; retry++) {
                if (options?.signal?.aborted) throw new Error('Aborted');

                try {
                    if (retry > 0) {
                        const delayMs = retry * 1000;
                        await this.delayWithSignal(delayMs, options?.signal);
                    }

                    const data = await this.executeWithSignal(
                        () => this.getScraper().getEpisodeSources(
                            episodeId,
                            currentServer as HiAnime.AnimeServers,
                            category
                        ),
                        options?.signal
                    );

                    if (data.sources && data.sources.length > 0) {
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

                        if (streamData.sources.length > 1) {
                            streamData.sources.sort((a, b) => {
                                const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                                return (order[a.quality] || 5) - (order[b.quality] || 5);
                            });
                        }

                        this.setCache(cacheKey, streamData, this.cacheTTL.stream);
                        return streamData;
                    }
                } catch (error: any) {
                    if (error.name === 'AbortError') throw error;
                    logger.warn(`[${this.name}] Server ${currentServer} failed (attempt ${retry + 1}): ${error.message}`);
                }
            }
        }

        return { sources: [], subtitles: [] };
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const allAnime: AnimeBase[] = [];

            try {
                const airingData = await this.executeWithSignal(
                    () => this.getScraper().getCategoryAnime('top-airing' as any, page),
                    options?.signal
                );
                if (airingData.animes && airingData.animes.length > 0) {
                    allAnime.push(...airingData.animes.map((a: any) => ({ ...this.mapAnime(a), status: 'Ongoing' as const })));
                }
            } catch { }

            if (allAnime.length < 24) {
                try {
                    const data = await this.executeWithSignal(
                        () => this.getScraper().getHomePage(),
                        options?.signal
                    );
                    const trending = data.trendingAnimes || data.spotlightAnimes || [];
                    allAnime.push(...trending.map((a: any) => ({ ...this.mapAnime(a), status: 'Ongoing' as const })));
                } catch { }
            }

            const uniqueAnime = Array.from(new Map(allAnime.map(a => [a.id, a])).values());
            this.setCache(cacheKey, uniqueAnime.slice(0, 48), this.cacheTTL.home);
            return uniqueAnime.slice(0, 48);
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
            const allAnime: AnimeBase[] = [];

            try {
                const latestData = await this.executeWithSignal(
                    () => this.getScraper().getCategoryAnime('latest' as any, page),
                    options?.signal
                );
                if (latestData.animes && latestData.animes.length > 0) {
                    allAnime.push(...latestData.animes.map((a: any) => ({ ...this.mapAnime(a), status: 'Ongoing' as const })));
                }
            } catch { }

            if (allAnime.length < 24) {
                try {
                    const data = await this.executeWithSignal(
                        () => this.getScraper().getHomePage(),
                        options?.signal
                    );
                    const latest = data.latestEpisodeAnimes || [];
                    allAnime.push(...latest.map((a: any) => ({ ...this.mapAnime(a), status: 'Ongoing' as const })));
                } catch { }
            }

            const uniqueAnime = Array.from(new Map(allAnime.map(a => [a.id, a])).values());
            this.setCache(cacheKey, uniqueAnime.slice(0, 48), this.cacheTTL.home);
            return uniqueAnime.slice(0, 48);
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
            const data = await this.executeWithSignal(
                () => this.getScraper().getHomePage(),
                options?.signal
            );
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
    async getPopular(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `popular:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.executeWithSignal(
                () => this.getScraper().getCategoryAnime('most-popular' as any, page),
                options?.signal
            );
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
    async getTopAiring(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `topAiring:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const data = await this.executeWithSignal(
                () => this.getScraper().getCategoryAnime('top-airing' as any, page),
                options?.signal
            );
            const results = (data.animes || []).map((a: any) => ({ ...this.mapAnime(a), status: 'Ongoing' as const }));

            this.setCache(cacheKey, results, this.cacheTTL.home);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopAiring');
            return [];
        }
    }

    /**
     * Get anime by type (TV, Movie, OVA, etc.) - NATIVE SCRAPING
     */
    async getByType(type: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `type:${type}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        const typeMap: Record<string, string> = {
            'TV': 'tv', 'Movie': 'movie', 'OVA': 'ova', 'ONA': 'ona', 'Special': 'special'
        };

        const category = typeMap[type.toUpperCase()] || 'tv';
        const url = `${this.baseUrl}/${category}${page > 1 ? `?page=${page}` : ''}`;

        return this.nativeScrape(url, page, cacheKey, options);
    }

    /**
     * Get anime by genre - NATIVE SCRAPING
     */
    async getByGenre(genre: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `genre:${genre}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        let slug = genre.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (slug === 'martial-arts') slug = 'marial-arts';

        const url = `${this.baseUrl}/genre/${slug}${page > 1 ? `?page=${page}` : ''}`;

        return this.nativeScrape(url, page, cacheKey, options);
    }

    /**
     * Get available genres for HiAnime
     */
    async getGenres(options?: SourceRequestOptions): Promise<string[]> {
        // Return standard HiAnime genres
        return [
            "Action", "Adventure", "Cars", "Comedy", "Dementia", "Demons", "Drama", "Ecchi",
            "Fantasy", "Game", "Harem", "Historical", "Horror", "Isekai", "Josei", "Kids",
            "Magic", "Martial Arts", "Mecha", "Military", "Music", "Mystery", "Parody",
            "Police", "Psychological", "Romance", "Samurai", "School", "Sci-Fi", "Seinen",
            "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life", "Space",
            "Sports", "Super Power", "Supernatural", "Thriller", "Vampire"
        ];
    }

    /**
     * Internal helper for native scraping using axios and cheerio
     */
    private async nativeScrape(url: string, page: number, cacheKey: string, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(url, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://hianime.to/'
                }
            });

            const $ = cheerio.load(response.data);
            const animeItems: AnimeBase[] = [];

            $('.flw-item').each((_, el) => {
                const $el = $(el);
                const titleNode = $el.find('.film-detail .film-name .dynamic-name');
                const href = titleNode.attr('href') || '';
                const id = href.split('/').pop()?.split('?')[0] || '';

                if (!id) return;

                animeItems.push({
                    id: `hianime-${id}`,
                    title: titleNode.text().trim(),
                    titleJapanese: titleNode.attr('data-jname') || undefined,
                    image: $el.find('.film-poster .film-poster-img').attr('data-src') || '',
                    type: this.mapType($el.find('.film-detail .fd-infor .fdi-item:nth-of-type(1)').text()),
                    episodes: parseInt($el.find('.film-poster .tick-sub').text()) || 0,
                    subCount: parseInt($el.find('.film-poster .tick-sub').text()) || 0,
                    dubCount: parseInt($el.find('.film-poster .tick-dub').text()) || 0,
                    source: this.name,
                    rating: parseFloat($el.find('.film-poster .tick-rate').text()) || undefined,
                    description: 'No description available.',
                    status: 'Completed',
                    genres: []
                });
            });

            let totalPages = page;
            const paginationItems = $('.pagination .page-item a');
            paginationItems.each((_, el) => {
                const title = $(el).attr('title');
                const text = $(el).text().trim();
                const href = $(el).attr('href') || '';
                if (title === 'Last' || title === 'Next') {
                    const match = href.match(/page=(\d+)/);
                    if (match && parseInt(match[1]) > totalPages) totalPages = parseInt(match[1]);
                } else if (!isNaN(parseInt(text))) {
                    if (parseInt(text) > totalPages) totalPages = parseInt(text);
                }
            });

            if (totalPages < 100 && $('.pagination .page-link[title="Next"]').length > 0) {
                if (totalPages === page) totalPages = page + 1;
            }

            const result: AnimeSearchResult = {
                results: animeItems, totalPages, currentPage: page, hasNextPage: page < totalPages, source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error: any) {
            if (error.name === 'AbortError') throw error;
            this.handleError(error, `nativeScrape: ${url}`);
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    private async executeWithSignal<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
        if (signal?.aborted) throw new Error('Aborted');

        return Promise.race([
            fn(),
            new Promise<T>((_, reject) => {
                signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
            })
        ]);
    }

    private async delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) throw new Error('Aborted');
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, ms);
            signal?.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Aborted'));
            }, { once: true });
        });
    }
}
