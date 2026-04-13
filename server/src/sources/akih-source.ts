/**
 * Aki-H Source - Direct HTML scraping for adult anime content from aki-h.com
 * Uses axios for fast HTTP requests instead of Puppeteer
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { BaseAnimeSource, GenreAwareSource, SourceRequestOptions } from './base-source.js';
import { logger } from '../utils/logger.js';

export class AkiHSource extends BaseAnimeSource implements GenreAwareSource {
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
            const genres: string[] = ['Hentai'];
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
            const response = await axios.post(url, 
                new URLSearchParams({ q: query, page: page.toString() }),
                {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    signal: options?.signal,
                    timeout: options?.timeout || 15000
                }
            );
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
        } catch (error: any) {
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
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;
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
            const genres: string[] = ['Hentai'];
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
        } catch (error: any) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cleanId = animeId.replace(/^akih-/, '');

        try {
            // First try to fetch the episode page which contains video links
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const $ = cheerio.load(response.data);

            const episodes: Episode[] = [];
            let episodeNum = 1;

            // Extract video links from the episode page (links to /videos/)
            $('.live-thumbnail').each((_, el) => {
                const $el = $(el);
                const href = $el.attr('href') || '';
                const title = $el.attr('title') || $el.find('.live-name a').text().trim();

                if (href.includes('/videos/')) {
                    const videoId = href.replace(this.baseUrl, '').replace(/^\/videos\/|\/$/g, '');
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

                if (href.includes('/videos/')) {
                    const videoId = href.replace(this.baseUrl, '').replace(/^\/videos\/|\/$/g, '');
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
        } catch (error: any) {
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

        let browser: puppeteer.Browser | null = null;

        try {
            const cleanId = episodeId.replace(/^akih-(episode|video)\//, '');

            // Build the video page URL
            let url: string;
            if (cleanId.startsWith('http')) {
                url = cleanId;
            } else {
                url = `${this.baseUrl}/videos/${cleanId}/`;
            }

            logger.info(`[AkiH] Fetching video page with Puppeteer: ${url}`);

            // Launch Puppeteer
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });

            const page = await browser.newPage();

            // Set user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Intercept network requests to find video URLs
            const videoUrls: string[] = [];
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('.mp4') || url.includes('.m3u8') || url.includes('.mpd')) {
                    logger.info(`[AkiH] Found video URL in network: ${url.substring(0, 80)}...`);
                    videoUrls.push(url);
                }
            });

            // Navigate to the page and wait for network to settle
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for the player container to load
            await page.waitForSelector('#player_container', { timeout: 15000 }).catch(() => {
                logger.warn('[AkiH] Player container not found, continuing anyway');
            });

            // Wait a bit more for any dynamic content to load
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Extract video URLs from the page
            const pageSources: VideoSource[] = await page.evaluate(() => {
                const foundSources: any[] = [];

                // Try to find video elements
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    const src = video.src || video.currentSrc;
                    if (src && src !== 'javascript:false') {
                        foundSources.push({
                            url: src,
                            quality: 'auto',
                            isM3U8: src.includes('.m3u8'),
                            isDASH: src.includes('.mpd')
                        });
                    }
                });

                // Try to find iframe sources
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    const src = iframe.src;
                    if (src && src !== 'javascript:false') {
                        foundSources.push({
                            url: src,
                            quality: 'auto',
                            isM3U8: src.includes('.m3u8'),
                            isDASH: src.includes('.mpd')
                        });
                    }
                });

                // Try to find data attributes
                const playerWrapper = document.querySelector('#player-wrapper');
                if (playerWrapper) {
                    const dataPlayer = playerWrapper.getAttribute('data-player');
                    const dataVideo = playerWrapper.getAttribute('data-video');
                    if (dataPlayer && dataPlayer !== 'javascript:false') {
                        foundSources.push({
                            url: dataPlayer,
                            quality: 'auto',
                            isM3U8: dataPlayer.includes('.m3u8'),
                            isDASH: dataPlayer.includes('.mpd')
                        });
                    }
                    if (dataVideo && dataVideo !== 'javascript:false') {
                        foundSources.push({
                            url: dataVideo,
                            quality: 'auto',
                            isM3U8: dataVideo.includes('.m3u8'),
                            isDASH: dataVideo.includes('.mpd')
                        });
                    }
                }

                // Try to find in script tags
                const scripts = document.querySelectorAll('script');
                scripts.forEach(script => {
                    const content = script.textContent || '';
                    const mp4Matches = content.match(/https?:\/\/[^\s"']*\.mp4[^\s"']*/gi);
                    const m3u8Matches = content.match(/https?:\/\/[^\s"']*\.m3u8[^\s"']*/gi);

                    if (mp4Matches) {
                        mp4Matches.forEach(url => {
                            if (url !== 'javascript:false') {
                                foundSources.push({
                                    url: url,
                                    quality: 'auto',
                                    isM3U8: false,
                                    isDASH: false
                                });
                            }
                        });
                    }

                    if (m3u8Matches) {
                        m3u8Matches.forEach(url => {
                            if (url !== 'javascript:false') {
                                foundSources.push({
                                    url: url,
                                    quality: 'auto',
                                    isM3U8: true,
                                    isDASH: false
                                });
                            }
                        });
                    }
                });

                return foundSources;
            });

            // Add network-intercepted URLs
            const networkSources: VideoSource[] = videoUrls.map(url => ({
                url,
                quality: 'auto',
                isM3U8: url.includes('.m3u8'),
                isDASH: url.includes('.mpd')
            }));

            // Combine all sources
            const allSources = [...pageSources, ...networkSources];

            // Deduplicate sources
            const uniqueSources = allSources.filter((source, index, self) =>
                index === self.findIndex(s => s.url === source.url)
            );

            // Sort sources by quality
            const qualityOrder = ['1080p', '720p', '480p', '360p', 'auto'];
            uniqueSources.sort((a, b) => {
                return qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality);
            });

            logger.info(`[AkiH] Found ${uniqueSources.length} stream sources via Puppeteer`);

            if (uniqueSources.length > 0) {
                const result = { sources: uniqueSources, subtitles: [], source: this.name };
                this.setCache(cacheKey, result, this.cacheTTL.stream);
                return result;
            }

            logger.warn(`[AkiH] No stream URL found for ${url} via Puppeteer`);
            return { sources: [], subtitles: [], source: this.name };

        } catch (error: any) {
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
        } catch (error: any) {
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

    async getGenres(): Promise<string[]> {
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

    private genreToSlug(genre: string): string {
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
        } catch (error: any) {
            this.handleError(error, 'getByGenre');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
}
