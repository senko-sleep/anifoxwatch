import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { HiAnime } from 'aniwatch';
import type { Browser, Page } from 'puppeteer';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

/**
 * 9Anime Source - Web scraper for 9animetv.to
 * 
 * Strategy:
 * - Scrapes 9animetv.to directly for anime metadata, episodes, and servers
 * - Uses Puppeteer to extract streaming links directly from the page (scraping logic)
 * - Fallback to HiAnime API if scraping fails
 */
export class NineAnimeSource extends BaseAnimeSource {
    name = '9Anime';
    baseUrl = 'https://9animetv.to';
    private client: AxiosInstance;
    private scraper: HiAnime.Scraper | null = null;

    private getScraper(): HiAnime.Scraper {
        if (!this.scraper) {
            // @ts-expect-error - aniwatch scraper constructor
            this.scraper = new HiAnime.Scraper('https://hianime.to');
        }
        return this.scraper;
    }

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
        'https://anifoxwatch-api.anifoxwatch.workers.dev',
    ];

    constructor() {
        super();
        this.client = axios.create({
            timeout: 15000,
            headers: {
                'Accept': 'text/html,application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        });
        // Note: Cache cleanup is done on-demand in getCached/setCache
        // setInterval is not allowed in Cloudflare Workers global scope
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

        // Extract genres from the card's detail/tooltip elements
        const genres: string[] = [];
        el.find('.fd-infor .fdi-item a, .film-detail .fd-infor a').each((_, genreEl) => {
            const genre = $(genreEl).text().trim();
            if (genre && !genre.match(/^\d+$/) && genre.length < 30) {
                genres.push(genre);
            }
        });

        // Extract description from tooltip or detail text
        const description = el.find('.film-detail .description, .description').text().trim()
            || el.find('.desi-description').text().trim()
            || '';

        return {
            id: `9anime-${id}`,
            title,
            image,
            cover: image,
            description,
            type: this.mapType(type),
            status: 'Completed',
            episodes: subCount,
            episodesAired: subCount,
            duration: '24m',
            genres,
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

    // ============ PUPPETEER SCRAPING ============

    private async launchBrowser(): Promise<Browser> {
        let puppeteer;
        try {
            // @ts-ignore
            const puppeteerModule = 'puppeteer';
            puppeteer = (await import(puppeteerModule)).default;
        } catch (e) {
            throw new Error('Puppeteer is not available in this environment');
        }

        return puppeteer.launch({
            headless: true, // Use headless for server
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--js-flags="--max-old-space-size=256"'
            ]
        });
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract stream URLs from embed page using Puppeteer
     */
    private async extractStreamFromEmbed(browser: Browser, embedUrl: string, referer: string, signal?: AbortSignal): Promise<VideoSource[]> {
        if (signal?.aborted) throw new Error('Aborted');
        const sources: VideoSource[] = [];
        const page = await browser.newPage();

        try {
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );

            // Intercept network requests
            await page.setRequestInterception(true);

            const capturedM3U8s: string[] = [];

            page.on('request', (req) => {
                const url = req.url();
                if (url.includes('.m3u8') && !url.includes('subtitles')) {
                    capturedM3U8s.push(url);
                }
                req.continue();
            });

            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('getSources') || url.includes('source')) {
                    try {
                        const text = await response.text();
                        try {
                            const data = JSON.parse(text);
                            if (data.sources && Array.isArray(data.sources)) {
                                data.sources.forEach((s: any) => {
                                    const src = s.file || s.url || s.src;
                                    if (src) capturedM3U8s.push(src);
                                });
                            }
                        } catch { }
                    } catch { }
                }
            });

            if (signal?.aborted) throw new Error('Aborted');

            // Navigate to embed with referer
            await page.setExtraHTTPHeaders({ 'Referer': referer });

            await page.goto(embedUrl, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            // Wait for player to initialize
            await this.delayWithSignal(3000, signal);

            // Try to click play
            try {
                await page.click('.play-btn, .vjs-big-play-button, [class*="play"]').catch(() => { });
                await this.delayWithSignal(2000, signal);
            } catch { }

            // Check video element
            const videoSrc = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video?.src || video?.currentSrc || null;
            });

            if (videoSrc && videoSrc.includes('.m3u8')) {
                capturedM3U8s.push(videoSrc);
            }

            // Check HTML for m3u8 URLs (Regex Fallback)
            const html = await page.content();
            const m3u8Regex = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g;
            const matches = html.match(m3u8Regex);
            if (matches) {
                matches.forEach(url => {
                    if (!url.includes('subtitles')) {
                        capturedM3U8s.push(url);
                    }
                });
            }

            // Dedupe and format
            const uniqueUrls = [...new Set(capturedM3U8s)];
            uniqueUrls.forEach(url => {
                sources.push({
                    url,
                    quality: 'auto',
                    isM3U8: url.includes('.m3u8'),
                    isDASH: url.includes('.mpd')
                });
            });

        } catch (error) {
            logger.error(`Puppeteer extraction failed for ${embedUrl}`, error as any, {}, this.name);
        } finally {
            await page.close();
        }

        return sources;
    }

    private async getStreamsFromPuppeteer(episodeId: string, serverId: string, signal?: AbortSignal): Promise<StreamingData | null> {
        if (signal?.aborted) throw new Error('Aborted');
        let browser: Browser | null = null;

        try {
            const [animeSlug, epParam] = episodeId.split('?');
            const epId = epParam?.replace('ep=', '') || serverId;

            const episodeUrl = `${this.baseUrl}/watch/${animeSlug}?ep=${epId}`;
            logger.info(`Puppeteer scraping: ${episodeUrl}`, undefined, this.name);

            browser = await this.launchBrowser();

            const serverUrl = `${this.baseUrl}/ajax/episode/sources?id=${serverId}`;
            const sourcesResponse = await this.client.get(serverUrl, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': episodeUrl
                },
                signal
            });

            if (!sourcesResponse.data?.link) {
                throw new Error('No embed link found');
            }

            const embedUrl = sourcesResponse.data.link;
            logger.info(`Found embed URL: ${embedUrl}`, undefined, this.name);

            const sources = await this.extractStreamFromEmbed(browser, embedUrl, episodeUrl, signal);

            await browser.close();
            browser = null;

            if (sources.length > 0) {
                return {
                    sources,
                    subtitles: [],
                    source: this.name,
                    headers: { Referer: 'https://iframe.cool/' }
                };
            }

            return null;

        } catch (error) {
            if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted')) throw error;
            logger.error('Puppeteer scraping failed', error as any, {}, this.name);
            if (browser) await browser.close();
            return null;
        }
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

    // ============ 9ANIME SCRAPING METHODS ============

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await this.client.get(`${this.baseUrl}/home`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `9anime-search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`${this.baseUrl}/search`, {
                params: { keyword: query, page },
                headers: { 'Accept': 'text/html' },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.flw-item').each((i, el) => {
                const anime = this.mapAnimeFromScrape($(el), $);
                if (anime.title) {
                    results.push(anime);
                }
            });

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

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const cacheKey = `9anime-anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const animeSlug = id.replace('9anime-', '');
            const response = await this.client.get(`${this.baseUrl}/watch/${animeSlug}`, {
                headers: { 'Accept': 'text/html' },
                signal: options?.signal,
                timeout: options?.timeout || 10000
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
                episodes: 0,
                episodesAired: 0,
                duration: '24m',
                genres: [],
                studios: [],
                subCount: 0,
                dubCount: 0,
                isMature: false,
                source: this.name
            };

            $('.item-title:contains("Genres:")').next('.item-content').find('a').each((i, el) => {
                anime.genres?.push($(el).text().trim());
            });

            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error) {
            this.handleError(error as any, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cacheKey = `9anime-episodes:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const animeSlug = animeId.replace('9anime-', '');
            const numericId = animeSlug.match(/-(\d+)$/)?.[1] || '';

            if (!numericId) {
                logger.warn(`Could not extract numeric ID from: ${animeSlug}`, undefined, this.name);
                return [];
            }

            const response = await this.client.get(`${this.baseUrl}/ajax/episode/list/${numericId}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${this.baseUrl}/watch/${animeSlug}`
                },
                signal: options?.signal,
                timeout: options?.timeout || 10000
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
                        hasDub: true
                    });
                }
            });

            this.setCache(cacheKey, episodes, this.cacheTTL.episodes);
            return episodes;
        } catch (error) {
            this.handleError(error as any, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cacheKey = `9anime-servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        try {
            const epNumericId = episodeId.split('ep=')[1] || episodeId;

            const response = await this.client.get(`${this.baseUrl}/ajax/episode/servers`, {
                params: { episodeId: epNumericId },
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': this.baseUrl
                },
                signal: options?.signal,
                timeout: options?.timeout || 5000
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
            this.handleError(error as any, 'getEpisodeServers');
            return [
                { name: 'hd-1', url: '', type: 'sub' },
                { name: 'hd-2', url: '', type: 'sub' }
            ];
        }
    }

    async getStreamingLinks(episodeId: string, server: string = 'hd-1', category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `9anime-stream:${episodeId}:${server}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            // 9Anime and HiAnime share the same backend (same episode IDs).
            // Use the aniwatch scraper directly — it can decode rapid-cloud embeds.
            logger.info(`Using aniwatch scraper for ${episodeId}`, undefined, this.name);

            const serverPriority = [server, 'hd-2', 'hd-1', 'hd-3'].filter((v, i, a) => a.indexOf(v) === i);
            for (const srv of serverPriority) {
                try {
                    const data = await this.getScraper().getEpisodeSources(
                        episodeId,
                        srv as HiAnime.AnimeServers,
                        category
                    );
                    if (data.sources && data.sources.length > 0) {
                        const rawData = data as Record<string, unknown>;
                        const streamData: StreamingData = {
                            sources: (data.sources as Array<{ url: string; quality?: string; isM3U8?: boolean }>).map((s): VideoSource => ({
                                url: s.url,
                                quality: this.normalizeQuality(s.quality || 'auto'),
                                isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                            })),
                            subtitles: ((rawData.tracks || rawData.subtitles || []) as Array<{ url: string; lang?: string; language?: string; label?: string }>)
                                .filter((t) => t.lang !== 'thumbnails')
                                .map((sub) => ({
                                    url: sub.url,
                                    lang: sub.lang || sub.language || 'Unknown',
                                    label: sub.label || sub.lang || sub.language
                                })),
                            headers: (rawData.headers as Record<string, string>) || { 'Referer': 'https://megacloud.blog/' },
                            source: this.name
                        };
                        logger.info(`Scraper got ${streamData.sources.length} sources for ${episodeId} via ${srv}`, undefined, this.name);
                        this.setCache(cacheKey, streamData, this.cacheTTL.stream);
                        this.handleSuccess();
                        return streamData;
                    }
                } catch {
                    // Try next server
                }
            }

            return { sources: [], subtitles: [] };
        } catch (error) {
            this.handleError(error as any, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `9anime-trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`${this.baseUrl}/home`, {
                headers: { 'Accept': 'text/html' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });

            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.block_area_trending .flw-item, .trending-list .flw-item').each((i, el) => {
                if (i < 10) {
                    const anime = this.mapAnimeFromScrape($(el), $);
                    if (anime.title) {
                        results.push(anime);
                    }
                }
            });

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
            this.handleError(error as any, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `9anime-latest:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`${this.baseUrl}/recently-updated?page=${page}`, {
                headers: { 'Accept': 'text/html' },
                signal: options?.signal,
                timeout: options?.timeout || 10000
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
            this.handleError(error as any, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const cacheKey = `9anime-topRated:${page}:${limit}`;
        const cached = this.getCached<TopAnime[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.client.get(`${this.baseUrl}/most-popular?page=${page}`, {
                headers: { 'Accept': 'text/html' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
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
            this.handleError(error as any, 'getTopRated');
            return [];
        }
    }
}
