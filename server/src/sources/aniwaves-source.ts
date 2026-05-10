import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { streamExtractor } from '../services/stream-extractor.js';

/**
 * Aniwaves Source - Web scraper for aniwaves.ru
 * Features:
 * - Direct metadata scraping via AJAX
 * - Episode list and server extraction
 * - Stream resolution via EchoVideo embed extraction
 */
export class AniwavesSource extends BaseAnimeSource {
    name = 'Aniwaves';
    baseUrl = 'https://aniwaves.ru';
    private client: AxiosInstance;

    // Smart caching with TTL
    private cache: Map<string, { data: any; expires: number }> = new Map();
    private cacheTTL = {
        search: 3 * 60 * 1000,
        anime: 15 * 60 * 1000,
        episodes: 10 * 60 * 1000,
        stream: 2 * 60 * 60 * 1000,
        servers: 60 * 60 * 1000,
    };

    constructor() {
        super();
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,
            headers: {
                'Accept': 'application/json, text/html',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
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

    // ============ DATA MAPPING ============

    private mapAnimeFromSearch(html: string): AnimeBase[] {
        const $ = cheerio.load(html);
        const results: AnimeBase[] = [];

        $('.item').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href') || '';
            const id = href.split('/watch/')[1]?.split('?')[0] || '';
            const title = $el.find('.name').text().trim();
            const image = $el.find('img').attr('src') || '';
            const meta = $el.find('.meta').text().trim();
            
            const typeMatch = meta.match(/(TV|Movie|OVA|ONA|Special)/i);
            const type = typeMatch ? typeMatch[1] as any : 'TV';

            results.push({
                id: `aniwaves-${id}`,
                title,
                image,
                cover: image,
                description: '',
                type: type,
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                genres: [],
                studios: [],
                year: 0,
                subCount: 0,
                dubCount: 0,
                source: this.name,
                isMature: false
            });
        });

        return results;
    }

    // ============ API METHODS ============

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await this.client.get('/', {
                timeout: options?.timeout || 5000,
                signal: options?.signal
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get('/ajax/anime/search', {
                params: { keyword: query },
                signal: options?.signal
            });

            if (response.data?.status !== 200 || !response.data?.result?.html) {
                return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
            }

            const results = this.mapAnimeFromSearch(response.data.result.html);
            const result: AnimeSearchResult = {
                results,
                totalPages: 1,
                currentPage: page,
                hasNextPage: false,
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

        const slug = id.replace('aniwaves-', '');
        try {
            const response = await this.client.get(`/watch/${slug}`, {
                signal: options?.signal,
                headers: { 'Accept': 'text/html', 'X-Requested-With': undefined }
            });

            const $ = cheerio.load(response.data);
            const title = $('h1, .name').first().text().trim() || slug;
            const image = $('meta[property="og:image"]').attr('content') || '';
            const description = $('meta[property="og:description"]').attr('content') || '';
            const genres: string[] = [];
            $('a[href*="/tags/"]').each((_, el) => {
                genres.push($(el).text().trim());
            });

            const anime: AnimeBase = {
                id,
                title,
                image,
                cover: image,
                description,
                type: 'TV',
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                genres,
                studios: [],
                year: 0,
                subCount: 0,
                dubCount: 0,
                source: this.name,
                isMature: false
            };

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

        const id = animeId.replace('aniwaves-', '').split('-').pop() || '';
        try {
            const response = await this.client.get(`/ajax/episode/list/${id}`, {
                signal: options?.signal
            });

            if (response.data?.status !== 200 || !response.data?.result) {
                return [];
            }

            const $ = cheerio.load(response.data.result);
            const episodes: Episode[] = [];

            $('.episodes.number li a').each((_, el) => {
                const $el = $(el);
                const epId = $el.attr('data-ids') || '';
                const num = parseInt($el.attr('data-num') || '0');
                const title = $el.attr('title') || `Episode ${num}`;

                if (epId && num > 0) {
                    episodes.push({
                        id: `aniwaves-${epId}`,
                        number: num,
                        title,
                        isFiller: false,
                        hasSub: $el.attr('data-sub') === '1',
                        hasDub: $el.attr('data-dub') === '1'
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

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        const epParams = episodeId.replace('aniwaves-', '');
        const [id, epsPart] = epParams.split('&eps=');
        const eps = epsPart || '';

        try {
            const response = await this.client.get('/ajax/server/list', {
                params: { servers: id, eps: eps },
                signal: options?.signal
            });

            if (response.data?.status !== 200 || !response.data?.result) {
                return [];
            }

            const $ = cheerio.load(response.data.result);
            const servers: EpisodeServer[] = [];

            $('.type').each((_, typeEl) => {
                const $typeEl = $(typeEl);
                const type = $typeEl.attr('data-type') as 'sub' | 'dub';
                
                $typeEl.find('li').each((_, liEl) => {
                    const $liEl = $(liEl);
                    const name = $liEl.text().trim();
                    const linkId = $liEl.attr('data-link-id') || '';
                    
                    if (linkId) {
                        servers.push({
                            name,
                            url: linkId,
                            type: type || 'sub'
                        });
                    }
                });
            });

            this.setCache(cacheKey, servers, this.cacheTTL.servers);
            return servers;
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [];
        }
    }

    async getStreamingLinks(episodeId: string, serverId?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${serverId || 'default'}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            let targetServerId = serverId;

            // If no serverId provided, pick the first one from the list
            if (!targetServerId) {
                const servers = await this.getEpisodeServers(episodeId, options);
                const filtered = servers.filter(s => s.type === category);
                const best = filtered.length > 0 ? filtered[0] : (servers.length > 0 ? servers[0] : null);
                
                if (!best) {
                    return { sources: [], subtitles: [] };
                }
                targetServerId = best.url;
            }

            // Step 1: Get the embed URL
            const response = await this.client.get('/ajax/sources', {
                params: { id: targetServerId },
                signal: options?.signal
            });

            if (response.data?.status !== 200 || !response.data?.result?.url) {
                return { sources: [], subtitles: [] };
            }

            const embedUrl = response.data.result.url;
            logger.info(`[Aniwaves] Found embed URL: ${embedUrl}`, undefined, this.name);

            // Step 2: Extract final stream from embed
            const extraction = await streamExtractor.extractFromEmbed(embedUrl);
            
            if (!extraction.success || extraction.streams.length === 0) {
                logger.warn(`[Aniwaves] Failed to extract streams from embed: ${embedUrl}`, undefined, this.name);
                return { sources: [], subtitles: [] };
            }

            const streamData: StreamingData = {
                sources: extraction.streams
                    .filter(s => /\.(m3u8|mp4|mkv|ts)(\?|$)/i.test(s.url) || s.url.includes('/hls/'))
                    .map(s => ({
                        url: s.url,
                        quality: s.quality as any,
                        isM3U8: s.url.includes('.m3u8') || s.url.includes('/hls/')
                    })),
                subtitles: extraction.subtitles.map(sub => ({
                    url: sub.url,
                    lang: sub.lang,
                    label: sub.lang
                })),
                headers: {
                    'Referer': this.baseUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                },
                source: this.name
            };

            this.setCache(cacheKey, streamData, this.cacheTTL.stream);
            this.handleSuccess();
            return streamData;
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        // Fallback to recent search for now as there's no direct trending AJAX
        return [];
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }
}
