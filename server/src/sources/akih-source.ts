/**
 * Aki-H Source - Direct HTML scraping for adult anime content from aki-h.com
 * Uses axios for fast HTTP requests with Puppeteer for stream extraction
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

let puppeteer: any = null;

export class AkiHSource extends BaseAnimeSource {
    name = 'AkiH';
    baseUrl = 'https://aki-h.com';
    
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
            const response = await axios.get(this.baseUrl, {
                timeout: options?.timeout || 10000,
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    private parseAnimeItems($: cheerio.CheerioAPI): AnimeBase[] {
        const items: AnimeBase[] = [];
        const seenSeries = new Set<string>();

        $('.flw-item').each((_, el) => {
            const $el = $(el);
            const link = $el.find('.film-name a, .film-poster-ahref').first();
            const href = link.attr('href');
            if (!href) return;

            let id = href.replace(this.baseUrl, '').replace(/^\//, '').replace(/\/$/, '');
            
            // Skip duplicates
            if (seenSeries.has(id)) return;
            seenSeries.add(id);

            const prefixedId = `akih-${id}`;
            const img = $el.find('.film-poster-img').first();
            const title = link.attr('title') || link.text().trim() || img.attr('alt') || 'Unknown Title';
            
            let image = img.attr('data-src') || img.attr('src') || '';
            if (image && !image.startsWith('http')) {
                image = `${this.baseUrl}${image.startsWith('/') ? '' : '/'}${image}`;
            }

            // Extract episode info from fd-infor
            const epInfo = $el.find('.fdi-item').first().text().trim();
            const episodesMatch = epInfo.match(/Ep\s*(\d+)/i);
            const episodes = episodesMatch ? parseInt(episodesMatch[1]) : 1;

            // Extract genres from other info
            const genres = ['Hentai'];
            const durationText = $el.find('.fdi-duration').text().trim();
            if (durationText.toLowerCase().includes('uncensored')) {
                genres.push('Uncensored');
            } else if (durationText.toLowerCase().includes('censored')) {
                genres.push('Censored');
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
                    episodes,
                    genres
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
            // Aki-H uses POST for search
            const url = `${this.baseUrl}/search/`;
            const response = await axios.post(url, new URLSearchParams({ q: query, page: page.toString() }), {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                signal: options?.signal,
                timeout: options?.timeout || 15000
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
            const cleanId = id.replace(/^akih-/, '');
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}/`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const $ = cheerio.load(response.data);

            const title = $('h1').first().text().trim() || $('title').text().replace(' - Aki-H', '').trim();
            const description = $('.description').first().text().trim() || '';
            let image = $('meta[property="og:image"]').attr('content') || '';
            if (!image) {
                const firstImg = $('.film-poster-img').first();
                image = firstImg.attr('data-src') || firstImg.attr('src') || '';
            }
            if (image && !image.startsWith('http')) {
                image = `${this.baseUrl}${image.startsWith('/') ? '' : '/'}${image}`;
            }

            // Extract genres
            const genres = ['Hentai'];
            $('.item-tags a').each((_, el) => {
                const genre = $(el).text().trim();
                if (genre) genres.push(genre);
            });

            const anime: AnimeBase = {
                id,
                title,
                image,
                description,
                type: 'ONA',
                status: 'Completed',
                rating: 0,
                episodes: 1,
                genres
            };

            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cleanId = animeId.replace(/^akih-/, '');
        
        try {
            // First try to fetch the episode page which contains video links
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}/`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const $ = cheerio.load(response.data);
            
            const episodes: Episode[] = [];
            let episodeNum = 1;

            // Extract video links from the episode page (links to /watch/)
            $('.live-thumbnail').each((_, el) => {
                const $el = $(el);
                const href = $el.attr('href') || '';
                const title = $el.attr('title') || $el.find('.live-name a').text().trim();
                
                if (href.includes('/watch/')) {
                    const videoId = href.replace(this.baseUrl, '').replace(/^\/watch\/|\/$/g, '');
                    const epMatch = title.match(/Vol\s*(\d+)/i) || title.match(/Episode\s*(\d+)/i);
                    const num = epMatch ? parseInt(epMatch[1]) : episodeNum++;
                    
                    if (videoId && !episodes.find(e => e.id === `akih-video/${videoId}`)) {
                        episodes.push({
                            id: `akih-video/${videoId}`,
                            number: num,
                            title: title || `Episode ${num}`,
                            isFiller: false,
                            hasDub: title.toLowerCase().includes('dub'),
                            hasSub: !title.toLowerCase().includes('dub')
                        });
                    }
                }
            });

            // Also try to find episode links in other formats
            $('.episodes a, .episode-item a, .ep-item a').each((_, el) => {
                const $el = $(el);
                const href = $el.attr('href') || '';
                const text = $el.text().trim();
                
                if (href.includes('/watch/')) {
                    const videoId = href.replace(this.baseUrl, '').replace(/^\/watch\/|\/$/g, '');
                    const epMatch = text.match(/episode\s*(\d+)/i);
                    const num = epMatch ? parseInt(epMatch[1]) : episodeNum++;
                    
                    if (videoId && !episodes.find(e => e.id === `akih-video/${videoId}`)) {
                        episodes.push({
                            id: `akih-video/${videoId}`,
                            number: num,
                            title: text || `Episode ${num}`,
                            isFiller: false,
                            hasDub: text.toLowerCase().includes('dub'),
                            hasSub: !text.toLowerCase().includes('dub')
                        });
                    }
                }
            });

            if (episodes.length > 0) {
                return episodes;
            }
        } catch (error) {
            this.handleError(error, 'getEpisodes');
        }

        // Fallback: return a single episode with the original ID
        return [{
            id: `akih-video/${cleanId}`,
            number: 1,
            title: 'Full Video',
            isFiller: false,
            hasDub: false,
            hasSub: true
        }];
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cleanId = episodeId.replace(/^akih-(episode|video)\//, '');
        return [{ name: 'AkiH', url: cleanId, type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        let browser = null;

        try {
            const cleanId = episodeId.replace(/^akih-(episode|video)\//, '');
            
            // Build the watch page URL
            let watchUrl: string;
            if (cleanId.startsWith('http')) {
                watchUrl = cleanId;
            } else {
                watchUrl = `${this.baseUrl}/watch/${cleanId}/`;
            }

            logger.info(`[AkiH] Fetching watch page to extract video ID: ${watchUrl}`);

            // Step 1: Fetch the watch page HTML to find displayvideo(type, videoId) call
            let embedUrl: string | null = null;
            try {
             const htmlRes = await axios.get(watchUrl, {
                     headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                     timeout: 15000
                 });
                 // Try to find displayvideo with two numbers, capture the second one (video ID)
                 let videoIdMatch = htmlRes.data.match(/displayvideo\s*\(\s*\d+\s*,\s*(\d+)\s*\)/);
                 if (!videoIdMatch) {
                     // Try to find displayvideo with at least one number (capture first number)
                     videoIdMatch = htmlRes.data.match(/displayvideo\s*\(\s*(\d+)/);
                 }
                 if (videoIdMatch) {
                     embedUrl = `${this.baseUrl}/video/${videoIdMatch[1]}/`;
                     logger.info(`[AkiH] Found embed video URL: ${embedUrl}`);
                 }
            } catch (e: any) {
                logger.warn(`[AkiH] Could not fetch watch page HTML: ${e.message}`);
            }

            // Step 2: NEW METHOD - Fetch the /e/ page which contains the streaming.aki.today iframe
            logger.info(`[AkiH] Using new extraction method: fetch /e/ page for streaming.aki.today iframe`);
            
            // Extract the video ID from the episode ID
            // Formats: akih-video/gVeegWqZIw, https://aki-h.com/videos/gVeegWqZIw/, or just gVeegWqZIw
            let videoId = episodeId;
            if (videoId.startsWith('akih-video/')) {
                videoId = videoId.split('/')[1];
            } else if (videoId.includes('aki-h.com/videos/')) {
                const match = videoId.match(/videos\/([^\/]+)/);
                if (match) videoId = match[1];
            } else if (videoId.includes('aki-h.com/watch/')) {
                const match = videoId.match(/watch\/([^\/]+)/);
                if (match) videoId = match[1];
            }
            
            const ePageUrl = `https://v.aki-h.com/e/${videoId}`;
            logger.info(`[AkiH] Fetching /e/ page: ${ePageUrl}`);
            
            // The /e/ page needs to be accessed with Referer from v.aki-h.com/v2/{embedVideoId}
            // First, we need to get the embedVideoId from the watch page
            let embedVideoId = '';
            if (embedUrl) {
                const embedIdMatch = embedUrl.match(/video\/(\d+)/);
                if (embedIdMatch) {
                    embedVideoId = embedIdMatch[1];
                }
            }
            
            const iframeReferer = embedVideoId ? `https://v.aki-h.com/v2/${embedVideoId}` : watchUrl;
            logger.info(`[AkiH] Using iframe Referer: ${iframeReferer}`);
            
            try {
                const ePageResponse = await axios.get(ePageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                        'Referer': iframeReferer,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                    timeout: 15000
                });
                
                logger.info(`[AkiH] /e/ page status: ${ePageResponse.status}, content length: ${ePageResponse.data.length}`);
                
                // Extract the streaming.aki.today iframe src
                const iframeMatch = ePageResponse.data.match(/<iframe[^>]+src="(https:\/\/streaming\.aki\.today\/[^"]+)"/);
                if (iframeMatch) {
                    const streamingUrl = iframeMatch[1];
                    logger.info(`[AkiH] ✅ Found streaming.aki.today iframe: ${streamingUrl}`);
                    
                    // Use Puppeteer to navigate to streaming.aki.today and extract direct stream URLs
                    logger.info(`[AkiH] Using Puppeteer to extract direct stream URLs from streaming.aki.today`);
                    
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
                            '--disable-features=IsolateOrigins,site-per-process',
                            '--ignore-certificate-errors',
                            '--ignore-ssl-errors',
                            '--ignore-certificate-errors-spki-list'
                        ],
                        timeout: 30000
                    };

                    let streamBrowser = null;
                    try {
                        streamBrowser = await puppeteer.launch(launchOptions);
                        const streamPage = await streamBrowser.newPage();
                        await streamPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
                        
                        // Set extra HTTP headers
                        await streamPage.setExtraHTTPHeaders({
                            'Referer': watchUrl,
                            'Accept-Language': 'en-US,en;q=0.9'
                        });
                        
                        // Intercept network requests to capture stream URLs
                        const capturedStreamUrls: string[] = [];
                        const blockedDomains = ['dtscout.com', 'histats.com', 'google-analytics.com', 'doubleclick.net', 'googlesyndication.com'];
                        
                        streamPage.on('request', (request: any) => {
                            const url = request.url();
                            // Block tracking domains
                            if (blockedDomains.some(domain => url.includes(domain))) {
                                request.abort();
                            } else {
                                request.continue();
                            }
                        });
                        
                        streamPage.on('response', async (response: any) => {
                            const respUrl = response.url();
                            
                            // Capture actual video stream URLs
                            if (
                                (respUrl.includes('.m3u8') || respUrl.includes('.mp4') || respUrl.includes('stream') || respUrl.includes('hstorage')) &&
                                !respUrl.includes('thumbnail') &&
                                !respUrl.includes('googleapis') &&
                                !respUrl.includes('.js') &&
                                !respUrl.includes('.php') &&
                                !blockedDomains.some(domain => respUrl.includes(domain))
                            ) {
                                logger.info(`[AkiH] Captured stream URL: ${respUrl.substring(0, 120)}`);
                                capturedStreamUrls.push(respUrl);
                            }
                        });
                        
                        // Navigate to streaming.aki.today
                        logger.info(`[AkiH] Navigating to streaming.aki.today: ${streamingUrl}`);
                        await streamPage.goto(streamingUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                        
                        // Wait for video to load
                        await new Promise(resolve => setTimeout(resolve, 8000));
                        
                        // Try to click play button to trigger stream loading
                        try {
                            await streamPage.evaluate(() => {
                                const playButton = document.querySelector('button[aria-label*="play"], .play-btn, #play, [class*="play"]') as HTMLButtonElement;
                                if (playButton) playButton.click();
                                
                                const video = document.querySelector('video') as HTMLVideoElement;
                                if (video) video.play();
                            });
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        } catch (e) {
                            // Play attempt might fail, continue
                        }
                        
                        // Extract stream URLs from page content
                        const pageStreamSources = await streamPage.evaluate(() => {
                            const sources: { url: string; quality: string; isM3U8: boolean; isDASH: boolean }[] = [];
                            
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
                                    /["'](https?:\/\/[^"']+hstorage[^"']*)["']/g,
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
                                            if (url.startsWith('http') && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('hstorage') || url.includes('stream'))) {
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
                        const networkSources = capturedStreamUrls.map(u => ({
                            url: u,
                            quality: 'auto' as const,
                            isM3U8: u.includes('.m3u8'),
                            isDASH: u.includes('.mpd')
                        }));
                        
                        const allSources = [...networkSources, ...pageStreamSources];
                        
                        // Filter out non-video files and aki-h.stream (returns webp segments, not playable)
                        const videoSources = allSources.filter(s => 
                            !s.url.includes('.css') && 
                            !s.url.includes('.js') && 
                            !s.url.includes('.png') && 
                            !s.url.includes('.jpg') &&
                            !s.url.includes('aki-h.stream') && // aki-h.stream returns webp segments, not video
                            (s.url.includes('.m3u8') || s.url.includes('.mp4') || s.url.includes('hstorage'))
                        );
                        
                        // Deduplicate
                        const uniqueSources = videoSources.filter((s, i, self) => i === self.findIndex(x => x.url === s.url));
                        
                        if (streamBrowser) await streamBrowser.close();
                        
                        if (uniqueSources.length > 0) {
                            logger.info(`[AkiH] ✅ Successfully extracted ${uniqueSources.length} direct stream URL(s) from streaming.aki.today`);
                            const result: StreamingData = { 
                                sources: uniqueSources, 
                                subtitles: [], 
                                source: this.name 
                            };
                            this.setCache(cacheKey, result, this.cacheTTL.stream);
                            return result;
                        } else {
                            logger.warn(`[AkiH] Could not extract valid video stream URLs from streaming.aki.today (aki-h.stream returns webp segments), falling back to iframe`);
                            
                            // Fallback to iframe approach since direct extraction didn't work
                            const iframeMatch = ePageResponse.data.match(/<iframe[^>]+src="(https:\/\/streaming\.aki\.today\/[^"]+)"/);
                            if (iframeMatch) {
                                const streamingUrl = iframeMatch[1];
                                logger.info(`[AkiH] Returning streaming.aki.today iframe URL as fallback`);
                                const result: StreamingData = { 
                                    sources: [{ 
                                        url: streamingUrl, 
                                        quality: 'auto', 
                                        isM3U8: false, 
                                        isDASH: false,
                                        isEmbed: true
                                    }], 
                                    subtitles: [], 
                                    source: this.name 
                                };
                                this.setCache(cacheKey, result, this.cacheTTL.stream);
                                return result;
                            }
                        }
                    } catch (puppeteerError: any) {
                        logger.warn(`[AkiH] Puppeteer extraction from streaming.aki.today failed: ${puppeteerError.message}`);
                        if (streamBrowser) await streamBrowser.close();
                    }
                } else {
                    logger.warn(`[AkiH] Could not find streaming.aki.today iframe in /e/ page`);
                }
            } catch (eError: any) {
                logger.warn(`[AkiH] /e/ page extraction failed: ${eError.message}`);
            }
            
            // Skip streaming.aki.today entirely due to connection/TLS issues
            // Go directly to Puppeteer method to extract from Aki-H embed page
            logger.info(`[AkiH] Skipping streaming.aki.today (connection/TLS issues), using Puppeteer to extract from Aki-H embed page`);
            
            // Step 3: Use Puppeteer with stealth mode on the embed /video/ URL for stream extraction
            const targetUrl = embedUrl || watchUrl;
            logger.info(`[AkiH] Launching Puppeteer with stealth mode to intercept stream from: ${targetUrl}`);

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
                 timeout: 15000
             };

            try {
                browser = await puppeteer.launch(launchOptions);
            } catch (launchError: any) {
                logger.warn(`[AkiH] Puppeteer launch failed, retrying: ${launchError.message}`);
                browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
            }

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Step 4: Intercept ALL network requests for video URLs and API calls
            const videoUrls: string[] = [];
            const apiResponses: string[] = [];
            
            page.on('response', async (response: any) => {
                const respUrl = response.url();
                
                // Intercept stream URLs
                if (
                    (respUrl.includes('.m3u8') || respUrl.includes('.mp4') || respUrl.includes('hstorage') || respUrl.includes('stream')) &&
                    !respUrl.includes('thumbnail') &&
                    !respUrl.includes('googleapis')
                ) {
                    logger.info(`[AkiH] Intercepted stream URL: ${respUrl.substring(0, 120)}`);
                    videoUrls.push(respUrl);
                }
                
                // Intercept API responses that might contain stream data
                if (respUrl.includes('api') || respUrl.includes('player') || respUrl.includes('video')) {
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('application/json') || contentType.includes('text')) {
                            const body = await response.text();
                            if (body && body.length < 50000) { // Don't log huge responses
                                apiResponses.push(body);
                                logger.info(`[AkiH] Intercepted API response: ${respUrl.substring(0, 80)} (${body.length} chars)`);
                            }
                        }
                    } catch (e) {
                        // Ignore response read errors
                    }
                }
            });

            // Navigate to embed URL and wait longer for JavaScript to execute
             await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 });
             await new Promise(resolve => setTimeout(resolve, 5000));

            // Try to click/play the video to trigger stream loading
            try {
                await page.evaluate(() => {
                    // Try to find and click play button
                    const playButton = document.querySelector('button[aria-label*="play"], .play-btn, #play, [class*="play"]');
                    if (playButton) (playButton as any).click();
                    
                    // Try to find video element and trigger play
                    const video = document.querySelector('video');
                    if (video) (video as any).play();
                });
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                // Play attempt might fail, continue
            }

            // Step 3.5: Try to extract stream URL from initial page WITHOUT navigating to iframe (iframe is 403 blocked)
            const pageSources: VideoSource[] = await page.evaluate(() => {
                const foundSources: { url: string; quality: string; isM3U8: boolean; isDASH: boolean }[] = [];
                
                // Direct video elements
                document.querySelectorAll('video, video source').forEach((el: any) => {
                    const src = el.src || el.currentSrc;
                    if (src && src.startsWith('http') && !src.includes('javascript')) {
                        foundSources.push({ url: src, quality: 'auto', isM3U8: src.includes('.m3u8'), isDASH: src.includes('.mpd') });
                    }
                });

                // Try to execute displayvideo function if it exists
                if ((window as any).displayvideo) {
                    try {
                        // Call displayvideo with common parameters to see if it returns a URL
                        const result = (window as any).displayvideo(1, 1);
                        if (result && typeof result === 'string' && result.startsWith('http')) {
                            foundSources.push({ url: result, quality: 'auto', isM3U8: result.includes('.m3u8'), isDASH: result.includes('.mpd') });
                        }
                    } catch (e) {
                        // Function might not be callable this way
                    }
                }

                // Scan inline scripts for m3u8/mp4 URLs - look for any URL patterns
                document.querySelectorAll('script:not([src])').forEach(s => {
                    const text = s.textContent || '';
                    // Try multiple patterns for URLs
                    const urlPatterns = [
                        /["'](https?:\/\/[^"']+\.(m3u8|mp4))["']/g,
                        /["'](https?:\/\/[^"']+hstorage[^"']*)["']/g,
                        /["'](https?:\/\/[^"']+stream[^"']*)["']/g,
                        /url:\s*["'](https?:\/\/[^"']+)["']/g,
                        /file:\s*["'](https?:\/\/[^"']+)["']/g,
                        /src:\s*["'](https?:\/\/[^"']+)["']/g,
                    ];
                    
                    for (const pattern of urlPatterns) {
                        const matches = text.match(pattern);
                        if (matches) {
                            matches.forEach(m => {
                                const url = m.replace(/^["']|["']$/g, '').replace(/^(url|file|src):\s*["']?|["']?$/g, '');
                                if (url.startsWith('http') && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('hstorage') || url.includes('stream'))) {
                                    foundSources.push({ url, quality: 'auto', isM3U8: url.includes('.m3u8'), isDASH: url.includes('.mpd') });
                                }
                            });
                        }
                    }
                });

                return foundSources;
            });

            // Also parse API responses for stream URLs
            for (const apiBody of apiResponses) {
                try {
                    const urlPatterns = [
                        /https?:\/\/[^\s"']+\.(m3u8|mp4)/g,
                        /https?:\/\/[^\s"']+hstorage[^\s"']*/g,
                        /https?:\/\/[^\s"']+stream[^\s"']*/g,
                    ];
                    
                    for (const pattern of urlPatterns) {
                        const matches = apiBody.match(pattern);
                        if (matches) {
                            matches.forEach(url => {
                                if (url.startsWith('http') && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('hstorage') || url.includes('stream'))) {
                                    pageSources.push({
                                        url: url,
                                        quality: 'auto',
                                        isM3U8: url.includes('.m3u8'),
                                        isDASH: url.includes('.mpd')
                                    });
                                    logger.info(`[AkiH] Found stream URL in API response: ${url.substring(0, 80)}`);
                                }
                            });
                        }
                    }
                } catch (e) {
                    // JSON parse errors are okay
                }
            }

            // If we found sources on the initial page, return them
            if (pageSources.length > 0) {
                logger.info(`[AkiH] Found ${pageSources.length} stream source(s) from initial page/API (no iframe navigation)`);
                const result: StreamingData = { sources: pageSources, subtitles: [], source: this.name };
                this.setCache(cacheKey, result, this.cacheTTL.stream);
                if (browser) await browser.close();
                return result;
            }

            // Step 3.6: If no sources found, try fetching iframe directly with axios (bypass Puppeteer detection)
            const iframeSrc = await page.evaluate(() => {
                const iframe = document.querySelector('iframe[src*="v.aki-h.com"]');
                return iframe ? (iframe as any).src : null;
            });

            if (iframeSrc) {
                logger.info(`[AkiH] No sources on initial page, attempting iframe fetch with axios (debug showed this returns 200): ${iframeSrc}`);
                try {
                    const iframeResponse = await axios.get(iframeSrc, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                            'Referer': watchUrl,
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        },
                        timeout: 15000
                    });
                    
                    logger.info(`[AkiH] Iframe fetch status: ${iframeResponse.status}, content length: ${iframeResponse.data.length}`);
                    
                    // Parse iframe HTML for stream URLs
                    const $iframe = cheerio.load(iframeResponse.data);
                    const iframeSources: VideoSource[] = [];
                    
                    // Check for video elements
                    $iframe('video, video source').each((_, el) => {
                        const src = $iframe(el).attr('src') || $iframe(el).attr('data-src');
                        if (src && src.startsWith('http')) {
                            iframeSources.push({
                                url: src,
                                quality: 'auto',
                                isM3U8: src.includes('.m3u8'),
                                isDASH: src.includes('.mpd')
                            });
                            logger.info(`[AkiH] Found video element: ${src.substring(0, 80)}`);
                        }
                    });
                    
                    // Scan scripts for URLs
                    $iframe('script').each((_, el) => {
                        const text = $iframe(el).html() || '';
                        const urlPatterns = [
                            /["'](https?:\/\/[^"']+\.(m3u8|mp4))["']/g,
                            /["'](https?:\/\/[^"']+hstorage[^"']*)["']/g,
                            /["'](https?:\/\/[^"']+stream[^"']*)["']/g,
                        ];
                        
                        for (const pattern of urlPatterns) {
                            const matches = text.match(pattern);
                            if (matches) {
                                matches.forEach(m => {
                                    const url = m.replace(/^["']|["']$/g, '');
                                    if (url.startsWith('http') && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('hstorage') || url.includes('stream'))) {
                                        iframeSources.push({
                                            url,
                                            quality: 'auto',
                                            isM3U8: url.includes('.m3u8'),
                                            isDASH: url.includes('.mpd')
                                        });
                                        logger.info(`[AkiH] Found stream URL in script: ${url.substring(0, 80)}`);
                                    }
                                });
                            }
                        }
                    });
                    
                    if (iframeSources.length > 0) {
                        logger.info(`[AkiH] Found ${iframeSources.length} stream source(s) from iframe axios fetch`);
                        const result: StreamingData = { sources: iframeSources, subtitles: [], source: this.name };
                        this.setCache(cacheKey, result, this.cacheTTL.stream);
                        if (browser) await browser.close();
                        return result;
                    } else {
                        logger.info(`[AkiH] No stream URLs found in iframe HTML (length: ${iframeResponse.data.length})`);
                    }
                } catch (e: any) {
                    logger.warn(`[AkiH] Iframe axios fetch failed: ${e.message}`);
                }
            }

            // Step 4: Extract video src from the page directly
            const iframePageSources: VideoSource[] = await page.evaluate(() => {
                const foundSources: { url: string; quality: string; isM3U8: boolean; isDASH: boolean }[] = [];
                
                // Direct video elements
                document.querySelectorAll('video, video source').forEach((el: any) => {
                    const src = el.src || el.currentSrc;
                    if (src && src.startsWith('http') && !src.includes('javascript')) {
                        foundSources.push({ url: src, quality: 'auto', isM3U8: src.includes('.m3u8'), isDASH: src.includes('.mpd') });
                    }
                });

                // Scan inline scripts for m3u8/mp4 URLs
                document.querySelectorAll('script:not([src])').forEach(s => {
                    const text = s.textContent || '';
                    const matches = text.match(/["'](https?:\/\/[^"']+\.(m3u8|mp4)[^"']*)["']/g);
                    if (matches) {
                        matches.forEach(m => {
                            const url = m.replace(/^["']|["']$/g, '');
                            foundSources.push({ url, quality: 'auto', isM3U8: url.includes('.m3u8'), isDASH: false });
                        });
                    }
                });

                return foundSources;
            });

            // Combine: network-intercepted URLs take priority
            const networkSources = videoUrls.map(u => ({
                url: u,
                quality: 'auto' as const,
                isM3U8: u.includes('.m3u8'),
                isDASH: u.includes('.mpd')
            }));

            const allSources = [...networkSources, ...iframePageSources];

            // Deduplicate and strip non-playable iframe wrapper URLs
            const uniqueSources = allSources
                .filter(s => !s.url.match(/\/video\/\d+\/?$/) || s.isM3U8 || s.url.includes('.mp4'))
                .filter((s, i, self) => i === self.findIndex(x => x.url === s.url));

            if (uniqueSources.length > 0) {
                logger.info(`[AkiH] Found ${uniqueSources.length} stream source(s)`);
                const result: StreamingData = { sources: uniqueSources, subtitles: [], source: this.name };
                this.setCache(cacheKey, result, this.cacheTTL.stream);
                return result;
            }

            logger.warn(`[AkiH] No stream URL found for ${watchUrl}`);
            return { sources: [], subtitles: [], source: this.name };

        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [], source: this.name };
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return this.getLatest(page, options);
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const url = page > 1
                ? `${this.baseUrl}/latest/page/${page}/`
                : `${this.baseUrl}/latest/`;
            
            logger.info(`[AkiH] Fetching latest from: ${url}`);
            
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const $ = cheerio.load(response.data);
            return this.parseAnimeItems($);
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getByType(type: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        return this.getLatest(page, options).then(results => ({
            results,
            totalPages: 1,
            currentPage: page,
            hasNextPage: false,
            source: this.name
        }));
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
            '3d', 'ahegao', 'anal', 'bdsm', 'big-boobs', 'blow-job', 'bondage',
            'paizuri', 'yuri', 'comedy', 'cosplay', 'creampie', 'big-breast',
            'yaoi', 'fantasy', 'double-penetration', 'foot-job', 'futanari',
            'gangbang', 'hospital', 'hand-job', 'harem', 'sex-toys', 'family',
            'incest', 'romoance', 'school', 'loli', 'maid', 'masturbation',
            'milf', 'mind-break', 'mind-control', 'monster', 'bitch', 'ntr',
            'nurse', 'drama', 'blackmail', 'pov', 'virgin', 'public-sex', 'rape',
            'reverse-rape', 'demon', 'remove-censored', 'bukkake', 'shota',
            'softcore', 'swimsuit', 'teacher', 'tentacles', 'threesome', 'vanilla',
            'trap', 'hardcore', '2d', 'furry'
        ];
    }

    genreToSlug(genre: string): string {
        return genre
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    }

    async getByGenre(genre: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `genre:${genre}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const genreSlug = this.genreToSlug(genre);
            const url = page > 1
                ? `${this.baseUrl}/genre/${genreSlug}/page/${page}/`
                : `${this.baseUrl}/genre/${genreSlug}/`;
            
            logger.info(`[AkiH] Fetching genre page ${page}: ${url}`);
            
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const $ = cheerio.load(response.data);
            const results = this.parseAnimeItems($);

            // Check for pagination
            const hasNextPage = $('.pagination .next').length > 0;
            let totalPages = page;
            if (hasNextPage) totalPages = page + 1;

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
            this.handleError(error, 'getByGenre');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
}