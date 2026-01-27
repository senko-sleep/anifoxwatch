import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

/**
 * 9Anime Source - Web scraper for 9animetv.to
 * 
 * Strategy:
 * - Scrapes 9animetv.to directly for anime metadata, episodes, and servers
 * - Uses HiAnime API (local or remote) for actual streaming URLs
 * - Both sites use similar infrastructure (rapid-cloud), so content is cross-compatible
 * 
 * Features:
 * - High-quality HD streams (720p, 1080p)
 * - Both Sub and Dub support
 * - Multiple server fallbacks
 * - Direct website scraping for latest content
 */
export class NineAnimeSource extends BaseAnimeSource {
    name = '9Anime';
    baseUrl = 'https://9animetv.to';
    private hianimeApiUrl: string;
    private client: AxiosInstance;

    // Smart caching with TTL
    private cache: Map<string, { data: any; expires: number }> = new Map();
    private cacheTTL = {
        search: 3 * 60 * 1000,      // 3 min
        anime: 15 * 60 * 1000,      // 15 min
        episodes: 10 * 60 * 1000,   // 10 min
        stream: 2 * 60 * 60 * 1000, // 2 hours
        servers: 60 * 60 * 1000,    // 1 hour
    };

    // HiAnime API instances for streaming fallback
    private hianimeApis = [
        'http://localhost:4000',
        'https://aniwatch-api-v2.vercel.app',
    ];

    constructor() {
        super();
        this.hianimeApiUrl = this.hianimeApis[0];
        
        this.client = axios.create({
            timeout: 15000,
            headers: {
                'Accept': 'text/html,application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
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

    // ============ DATA MAPPING ============

    private mapAnimeFromScrape(el: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): AnimeBase {
        const title = el.find('.film-name a, .name a').text().trim();
        const url = el.find('.film-name a, .name a').attr('href') || '';
        const id = url.split('/watch/')[1]?.split('?')[0] || '';
        const image = el.find('img').attr('data-src') || el.find('img').attr('src') || '';
        const type = el.find('.fdi-item').first().text().trim() || 'TV';
        
        const subText = el.find('.tick-sub').text().trim();
        const dubText = el.find('.tick-dub').text().trim();
        const subCount = parseInt(subText) || 0;
        const dubCount = parseInt(dubText) || 0;

        return {
            id: `9anime-${id}`,
            title,
            image,
            cover: image,
            description: 'No description available.',
            type: this.mapType(type),
            status: 'Completed',
            episodes: subCount,
            episodesAired: subCount,
            duration: '24m',
            genres: [],
            studios: [],
            subCount,
            dubCount,
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
        if (s.includes('ongoing') || s.includes('airing') || s.includes('releasing')) return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not_yet')) return 'Upcoming';
        return 'Completed';
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

    // ============ 9ANIME SCRAPING METHODS ============

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.get(`${this.baseUrl}/home`, { timeout: 10000 });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            this.isAvailable = false;
            return false;
        }
    }

    async search(query: string, page: number = 1): Promise<AnimeSearchResult> {
        const cacheKey = `9anime-search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`${this.baseUrl}/search`, {
                params: { keyword: query, page },
                headers: { 'Accept': 'text/html' }
            });

            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.flw-item').each((i, el) => {
                const anime = this.mapAnimeFromScrape($(el), $);
                if (anime.title) {
                    results.push(anime);
                }
            });

            // Get pagination info
            const hasNextPage = $('.pagination .page-item.active').next('.page-item').length > 0;
            const totalPages = parseInt($('.pagination .page-item:not(.next):last').text()) || 1;

            const result: AnimeSearchResult = {
                results,
                totalPages,
                currentPage: page,
                hasNextPage,
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
        const cacheKey = `9anime-anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const animeSlug = id.replace('9anime-', '');
            const response = await this.client.get(`${this.baseUrl}/watch/${animeSlug}`, {
                headers: { 'Accept': 'text/html' }
            });

            const $ = cheerio.load(response.data);
            
            const title = $('h2.film-name').text().trim();
            const image = $('.film-poster img').attr('src') || '';
            const description = $('.film-description .text').text().trim() || 'No description available.';
            const type = $('.item-title:contains("Type:")').next('.item-content').text().trim();
            const status = $('.item-title:contains("Status:")').next('.item-content').text().trim();
            
            const anime: AnimeBase = {
                id: `9anime-${animeSlug}`,
                title,
                image,
                cover: image,
                description,
                type: this.mapType(type),
                status: this.mapStatus(status),
                episodes: 0, // Will be populated when getting episodes
                episodesAired: 0,
                duration: '24m',
                genres: [],
                studios: [],
                subCount: 0,
                dubCount: 0,
                isMature: false,
                source: this.name
            };

            // Extract genres
            $('.item-title:contains("Genres:")').next('.item-content').find('a').each((i, el) => {
                anime.genres?.push($(el).text().trim());
            });

            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const cacheKey = `9anime-episodes:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const animeSlug = animeId.replace('9anime-', '');
            // Extract numeric ID from slug (e.g., "naruto-shippuden-355" -> "355")
            const numericId = animeSlug.match(/-(\d+)$/)?.[1] || '';
            
            if (!numericId) {
                logger.warn(`Could not extract numeric ID from: ${animeSlug}`, undefined, this.name);
                return [];
            }

            const response = await this.client.get(`${this.baseUrl}/ajax/episode/list/${numericId}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${this.baseUrl}/watch/${animeSlug}`
                }
            });

            if (!response.data?.html) {
                return [];
            }

            const $ = cheerio.load(response.data.html);
            const episodes: Episode[] = [];

            $('.ep-item').each((i, el) => {
                const $el = $(el);
                const epId = $el.attr('data-id') || '';
                const epNumber = parseInt($el.attr('data-number') || '0');
                const epTitle = $el.attr('title') || `Episode ${epNumber}`;

                if (epId && epNumber > 0) {
                    episodes.push({
                        id: `${animeSlug}?ep=${epId}`,
                        number: epNumber,
                        title: epTitle,
                        isFiller: false,
                        hasSub: true,
                        hasDub: true // Determined by server list
                    });
                }
            });

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
        const cacheKey = `9anime-servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        try {
            // Extract numeric episode ID from format "anime-slug?ep=123"
            const epNumericId = episodeId.split('ep=')[1] || episodeId;

            const response = await this.client.get(`${this.baseUrl}/ajax/episode/servers`, {
                params: { episodeId: epNumericId },
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': this.baseUrl
                }
            });

            if (!response.data?.html) {
                return [
                    { name: 'hd-1', url: '', type: 'sub' },
                    { name: 'hd-2', url: '', type: 'sub' }
                ];
            }

            const $ = cheerio.load(response.data.html);
            const servers: EpisodeServer[] = [];

            $('.servers-sub .server-item').each((i, el) => {
                const serverId = $(el).attr('data-id') || '';
                const serverName = $(el).text().trim();
                if (serverId) {
                    servers.push({ name: serverName, url: serverId, type: 'sub' });
                }
            });

            $('.servers-dub .server-item').each((i, el) => {
                const serverId = $(el).attr('data-id') || '';
                const serverName = $(el).text().trim();
                if (serverId) {
                    servers.push({ name: serverName, url: serverId, type: 'dub' });
                }
            });

            if (servers.length === 0) {
                servers.push(
                    { name: 'hd-1', url: '', type: 'sub' },
                    { name: 'hd-2', url: '', type: 'sub' }
                );
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
     * Get streaming links using HiAnime API (cross-compatible with 9anime content)
     */
    async getStreamingLinks(episodeId: string, server: string = 'hd-1', category: 'sub' | 'dub' = 'sub'): Promise<StreamingData> {
        const cacheKey = `9anime-stream:${episodeId}:${server}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            // Try HiAnime API for streaming (since both use similar infrastructure)
            for (const apiUrl of this.hianimeApis) {
                try {
                    const response = await axios.get(`${apiUrl}/api/v2/hianime/episode/sources`, {
                        params: {
                            animeEpisodeId: episodeId,
                            server,
                            category
                        },
                        timeout: 30000
                    });

                    const data = response.data?.data || response.data;

                    if (data?.sources && data.sources.length > 0) {
                        const streamData: StreamingData = {
                            sources: data.sources.map((s: any): VideoSource => ({
                                url: s.url,
                                quality: this.normalizeQuality(s.quality || 'auto'),
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

                        // Sort by quality
                        streamData.sources.sort((a, b) => {
                            const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4 };
                            return (order[a.quality] || 5) - (order[b.quality] || 5);
                        });

                        this.setCache(cacheKey, streamData, this.cacheTTL.stream);
                        logger.info(`Got stream from ${apiUrl}`, { episodeId }, this.name);
                        return streamData;
                    }
                } catch (e: any) {
                    logger.warn(`HiAnime API ${apiUrl} failed: ${e.message}`, undefined, this.name);
                    continue;
                }
            }

            return { sources: [], subtitles: [] };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `9anime-trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`${this.baseUrl}/home`, {
                headers: { 'Accept': 'text/html' }
            });

            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            // Get trending from homepage
            $('.block_area_trending .flw-item, .trending-list .flw-item').each((i, el) => {
                if (i < 10) { // Limit to top 10
                    const anime = this.mapAnimeFromScrape($(el), $);
                    if (anime.title) {
                        results.push(anime);
                    }
                }
            });

            // Fallback to first section if trending not found
            if (results.length === 0) {
                $('.block_area:first .flw-item').each((i, el) => {
                    if (i < 10) {
                        const anime = this.mapAnimeFromScrape($(el), $);
                        if (anime.title) {
                            results.push(anime);
                        }
                    }
                });
            }

            this.setCache(cacheKey, results, 10 * 60 * 1000);
            return results;
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1): Promise<AnimeBase[]> {
        const cacheKey = `9anime-latest:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`${this.baseUrl}/recently-updated?page=${page}`, {
                headers: { 'Accept': 'text/html' }
            });

            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.flw-item').each((i, el) => {
                const anime = this.mapAnimeFromScrape($(el), $);
                if (anime.title) {
                    results.push(anime);
                }
            });

            this.setCache(cacheKey, results, 3 * 60 * 1000);
            return results;
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10): Promise<TopAnime[]> {
        const cacheKey = `9anime-topRated:${page}:${limit}`;
        const cached = this.getCached<TopAnime[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`${this.baseUrl}/most-popular?page=${page}`, {
                headers: { 'Accept': 'text/html' }
            });

            const $ = cheerio.load(response.data);
            const results: TopAnime[] = [];

            $('.flw-item').each((i, el) => {
                if (i < limit) {
                    const anime = this.mapAnimeFromScrape($(el), $);
                    if (anime.title) {
                        results.push({
                            rank: (page - 1) * limit + i + 1,
                            anime
                        });
                    }
                }
            });

            this.setCache(cacheKey, results, 15 * 60 * 1000);
            return results;
        } catch (error) {
            this.handleError(error, 'getTopRated');
            return [];
        }
    }
}
