/**
 * Hanime.tv Source - Hentai anime streaming with blob URL extraction
 * Uses Puppeteer to intercept blob URLs since they're not accessible via normal HTTP requests
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { getHentaiProxyConfig } from '../utils/proxy-config.js';

let puppeteer: any = null;

export class HanimeSource extends BaseAnimeSource {
    name = 'Hanime';
    baseUrl = 'https://hanime.tv';

    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = {
        search: 3 * 60 * 1000,
        anime: 15 * 60 * 1000,
        stream: 2 * 60 * 60 * 1000,
    };

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

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const proxyConfig = getHentaiProxyConfig();
            const response = await axios.get(this.baseUrl, {
                timeout: options?.timeout || 10000,
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                proxy: proxyConfig || options?.proxy
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    private parseAnimeItems($: cheerio.CheerioAPI): AnimeBase[] {
        const items: AnimeBase[] = [];
        
        // Hanime.tv uses card-based layout
        $('.card, .video-card, .h-card').each((_, el) => {
            const $el = $(el);
            const link = $el.find('a').first();
            const href = link.attr('href');
            if (!href) return;

            const id = href.replace(this.baseUrl, '').replace(/^\//, '').replace(/\/$/, '');
            const prefixedId = `hanime-${id}`;
            
            const img = $el.find('img').first();
            const title = img.attr('alt') || $el.find('.title, h3, h4').first().text().trim() || 'Unknown Title';
            
            let image = img.attr('data-src') || img.attr('src') || '';
            if (image && !image.startsWith('http')) {
                image = `${this.baseUrl}${image.startsWith('/') ? '' : '/'}${image}`;
            }

            if (id && title && !id.includes('javascript')) {
                items.push({
                    id: prefixedId,
                    title,
                    image,
                    description: 'Hentai Video',
                    type: 'ONA',
                    status: 'Completed',
                    rating: 0,
                    episodes: 1,
                    genres: ['Hentai']
                });
            }
        });
        return items;
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const proxyConfig = getHentaiProxyConfig();
            const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                signal: options?.signal,
                timeout: options?.timeout || 15000,
                proxy: proxyConfig || options?.proxy
            });
            const $ = cheerio.load(response.data);
            const results = this.parseAnimeItems($);

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

        try {
            const proxyConfig = getHentaiProxyConfig();
            const cleanId = id.replace(/^hanime-/, '');
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;
            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                signal: options?.signal,
                timeout: options?.timeout || 15000,
                proxy: proxyConfig || options?.proxy
            });
            const $ = cheerio.load(response.data);

            const title = $('h1').first().text().trim() || $('title').text().replace(' - hanime.tv', '').trim();
            const description = $('.description, .synopsis').first().text().trim() || '';
            let image = $('meta[property="og:image"]').attr('content') || '';
            if (!image) {
                const firstImg = $('.cover-image, .poster img').first();
                image = firstImg.attr('data-src') || firstImg.attr('src') || '';
            }
            if (image && !image.startsWith('http')) {
                image = `${this.baseUrl}${image.startsWith('/') ? '' : '/'}${image}`;
            }

            const anime: AnimeBase = {
                id,
                title,
                image,
                description,
                type: 'ONA',
                status: 'Completed',
                rating: 0,
                episodes: 1,
                genres: ['Hentai']
            };

            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cleanId = animeId.replace(/^hanime-/, '');

        // Hanime.tv typically has single videos per page
        return [{
            id: `hanime-video/${cleanId}`,
            number: 1,
            title: 'Full Video',
            isFiller: false,
            hasDub: false,
            hasSub: true
        }];
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cleanId = episodeId.replace(/^hanime-/, '');
        return [{ name: 'Hanime', url: cleanId, type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const cleanId = episodeId.replace(/^hanime-/, '');

            // Build the video page URL
            let url: string;
            if (cleanId.startsWith('http')) {
                url = cleanId;
            } else {
                url = `${this.baseUrl}/${cleanId}`;
            }

            logger.info(`[Hanime] Fetching video page: ${url}`);

            // Use Puppeteer to intercept blob URLs
            if (!puppeteer) {
                const puppeteerModuleName = 'puppeteer-extra';
                puppeteer = (await import(puppeteerModuleName)).default;
                
                // Add stealth plugin
                const stealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
                puppeteer.use(stealthPlugin());
            }

            const launchOptions: any = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                timeout: 15000 // Reduced from 30s for faster response
            };

            let browser = null;
            try {
                browser = await puppeteer.launch(launchOptions);
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                // Intercept blob URLs by capturing video src
                const blobUrls: string[] = [];
                const videoSources: VideoSource[] = [];

                page.on('response', async (response: any) => {
                    const respUrl = response.url();
                    
                    // Capture m3u8 and mp4 URLs
                    if (
                        (respUrl.includes('.m3u8') || respUrl.includes('.mp4')) &&
                        !respUrl.includes('thumbnail') &&
                        !respUrl.includes('googleapis')
                    ) {
                        logger.info(`[Hanime] Captured stream URL: ${respUrl.substring(0, 120)}`);
                        blobUrls.push(respUrl);
                    }
                });

                // Navigate to the video page
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer for page to fully load and ads to play

                // Try to bypass ads - click skip buttons if present
                try {
                    await page.evaluate(() => {
                        // Look for and click skip ad buttons
                        const skipButtons = document.querySelectorAll('button, a, [role="button"], .skip-ad, .close-ad');
                        skipButtons.forEach((btn: any) => {
                            const text = btn.textContent?.toLowerCase() || '';
                            const className = btn.className?.toLowerCase() || '';
                            if (text.includes('skip') || text.includes('close') || text.includes('continue') || 
                                className.includes('skip') || className.includes('close')) {
                                btn.click();
                            }
                        });
                    });
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait longer for ad to be skipped
                } catch (e) {
                    // Skip attempt might fail, continue
                }

                // Try to extract stream URLs from page content
                const pageSources = await page.evaluate(() => {
                    const sources: { url: string; quality: string; isM3U8: boolean; isDASH: boolean }[] = [];
                    
                    // Try to extract from window.__INITIAL_STATE__ or similar data
                    try {
                        const win = window as any;
                        const stateKeys = ['__INITIAL_STATE__', '__NEXT_DATA__', '__NUXT__', 'videoData', 'videoState'];
                        for (const key of stateKeys) {
                            if (win[key]) {
                                const stateStr = JSON.stringify(win[key]);
                                const urlMatches = stateStr.match(/https?:\/\/[^"'\s]+\.(mp4|m3u8)[^"'\s]*/g);
                                if (urlMatches) {
                                    urlMatches.forEach((url: string) => {
                                        if (!url.includes('adtng') && !url.includes('ads') && !url.includes('creatives')) {
                                            sources.push({ url, quality: 'auto', isM3U8: url.includes('.m3u8'), isDASH: url.includes('.mpd') });
                                        }
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        // State extraction might fail
                    }
                    
                    // Direct video elements
                    document.querySelectorAll('video, video source').forEach((el: any) => {
                        const src = el.src || el.currentSrc;
                        if (src && src.startsWith('http') && !src.includes('javascript')) {
                            sources.push({ url: src, quality: 'auto', isM3U8: src.includes('.m3u8'), isDASH: src.includes('.mpd') });
                        }
                    });
                    
                    // Scan inline scripts for stream URLs
                    document.querySelectorAll('script:not([src])').forEach(s => {
                        const text = s.textContent || '';
                        const urlPatterns = [
                            /["'](https?:\/\/[^"']+\.(m3u8|mp4))["']/g,
                            /["'](https?:\/\/[^"']+hls[^"']*)["']/g,
                            /["'](https?:\/\/[^"']+stream[^"']*)["']/g,
                            /url:\s*["'](https?:\/\/[^"']+)["']/g,
                            /file:\s*["'](https?:\/\/[^"']+)["']/g,
                            /src:\s*["'](https?:\/\/[^"']+)["']/g,
                            /"url":\s*"(https?:\/\/[^"]+)"/g,
                            /"file":\s*"(https?:\/\/[^"]+)"/g,
                        ];
                        
                        for (const pattern of urlPatterns) {
                            const matches = text.match(pattern);
                            if (matches) {
                                matches.forEach(m => {
                                    let url = m.replace(/^["']|["']$/g, '').replace(/^(url|file|src):\s*["']?|["']?$/g, '').replace(/^"url":\s*"|"$/g, '').replace(/^"file":\s*"|"$/g, '');
                                    if (url.startsWith('http') && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('hls') || url.includes('stream'))) {
                                        sources.push({ url, quality: 'auto', isM3U8: url.includes('.m3u8'), isDASH: url.includes('.mpd') });
                                    }
                                });
                            }
                        }
                    });
                    
                    // Try to extract from window/player objects
                    try {
                        const win = window as any;
                        if (win.player && win.player.config && win.player.config.sources) {
                            win.player.config.sources.forEach((src: any) => {
                                if (src.file && src.file.startsWith('http')) {
                                    sources.push({ url: src.file, quality: src.label || 'auto', isM3U8: src.file.includes('.m3u8'), isDASH: src.file.includes('.mpd') });
                                }
                            });
                        }
                        if (win.jwplayer && win.jwplayer().getConfig()) {
                            const config = win.jwplayer().getConfig();
                            if (config.sources) {
                                config.sources.forEach((src: any) => {
                                    if (src.file && src.file.startsWith('http')) {
                                        sources.push({ url: src.file, quality: src.label || 'auto', isM3U8: src.file.includes('.m3u8'), isDASH: src.file.includes('.mpd') });
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        // Player extraction might fail
                    }
                    
                    return sources;
                });

                // Combine network-captured URLs with page-extracted URLs
                const networkSources = blobUrls.map(u => ({
                    url: u,
                    quality: 'auto' as const,
                    isM3U8: u.includes('.m3u8'),
                    isDASH: u.includes('.mpd')
                }));

                const allSources = [...networkSources, ...pageSources];

                // Filter out ad URLs and non-video content
                const adDomains = ['adtng.com', 'trafficjunky.net', 'ads.', 'creatives/', 'ourdream.ai'];
                const filteredSources = allSources.filter(s => 
                    !adDomains.some(domain => s.url.includes(domain)) &&
                    (s.url.includes('.mp4') || s.url.includes('.m3u8'))
                );

                // Deduplicate
                const uniqueSources = filteredSources.filter((s, i, self) => i === self.findIndex(x => x.url === s.url));

                if (browser) await browser.close();

                if (uniqueSources.length > 0) {
                    logger.info(`[Hanime] ✅ Successfully extracted ${uniqueSources.length} stream URL(s)`);
                    const result: StreamingData = { 
                        sources: uniqueSources, 
                        subtitles: [], 
                        source: this.name 
                    };
                    this.setCache(cacheKey, result, this.cacheTTL.stream);
                    return result;
                } else {
                    logger.warn(`[Hanime] Could not extract stream URLs from ${url}`);
                }
            } catch (puppeteerError: any) {
                logger.warn(`[Hanime] Puppeteer extraction failed: ${puppeteerError.message}`);
                if (browser) await browser.close();
            }

            logger.warn(`[Hanime] No stream URL found for ${url}`);
            return { sources: [], subtitles: [], source: this.name };

        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [], source: this.name };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return this.getLatest(page, options);
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const url = page > 1 ? `${this.baseUrl}/browse?page=${page}` : `${this.baseUrl}/browse`;

            logger.info(`[Hanime] Fetching latest from: ${url}`);

            const proxyConfig = getHentaiProxyConfig();
            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                signal: options?.signal,
                timeout: options?.timeout || 15000,
                proxy: proxyConfig || options?.proxy
            });
            const $ = cheerio.load(response.data);
            return this.parseAnimeItems($);
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const latest = await this.getLatest(page, options);
        return latest.map((anime, index) => ({
            rank: index + 1,
            anime
        }));
    }

    async getGenres(options?: SourceRequestOptions): Promise<string[]> {
        return [
            '3d', 'action', 'ahegao', 'anal', 'big-boobs', 'blowjob', 'bondage',
            'creampie', 'dark-skin', 'demons', 'double-penetration', 'fantasy', 'futanari',
            'gangbang', 'harem', 'incest', 'large-breasts', 'lolicon', 'maid', 'milf',
            'monster', 'ntr', 'nurse', 'pregnant', 'rape', 'school-girl', 'sci-fi',
            'tentacles', 'threesome', 'uncensored', 'vanilla', 'virgin', 'yuri'
        ];
    }

    async getByGenre(genre: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `genre:${genre}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const genreSlug = genre.toLowerCase().replace(/\s+/g, '-');
            const url = page > 1
                ? `${this.baseUrl}/browse?tags=${genreSlug}&page=${page}`
                : `${this.baseUrl}/browse?tags=${genreSlug}`;

            logger.info(`[Hanime] Fetching genre page ${page}: ${url}`);

            const proxyConfig = getHentaiProxyConfig();
            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                signal: options?.signal,
                timeout: options?.timeout || 15000,
                proxy: proxyConfig || options?.proxy
            });
            const $ = cheerio.load(response.data);
            const results = this.parseAnimeItems($);

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
            this.handleError(error, 'getByGenre');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
}
