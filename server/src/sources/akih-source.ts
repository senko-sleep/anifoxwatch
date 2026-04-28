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
    isAdultOnly = true; // Explicitly mark as hentai-only

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

        const cleanId = episodeId.replace(/^akih-(episode|video)\//, '');
        let url: string;
        if (cleanId.startsWith('http')) {
            url = cleanId;
        } else {
            url = `${this.baseUrl}/videos/${cleanId}/`;
        }

        // Try axios/cheerio first (much faster)
        try {
            logger.info(`[AkiH] Fetching video page with axios: ${url}`);
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: options?.timeout || 10000,
                signal: options?.signal
            });
            const $ = cheerio.load(response.data);
            const sources: VideoSource[] = [];

            // Look for video elements
            $('video').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src') || '';
                if (src && src !== 'javascript:false') {
                    sources.push({
                        url: src,
                        quality: 'auto' as const,
                        isM3U8: src.includes('.m3u8'),
                        isDASH: src.includes('.mpd')
                    });
                }
            });

            // Look for iframes
            $('iframe').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src') || '';
                if (src && src !== 'javascript:false') {
                    sources.push({
                        url: src,
                        quality: 'auto' as const,
                        isM3U8: src.includes('.m3u8'),
                        isDASH: src.includes('.mpd')
                    });
                }
            });

            // Look for data-video attributes
            $('[data-video]').each((_, el) => {
                const dv = $(el).attr('data-video') || '';
                if (dv && dv !== 'javascript:false') {
                    sources.push({
                        url: dv,
                        quality: 'auto' as const,
                        isM3U8: dv.includes('.m3u8'),
                        isDASH: dv.includes('.mpd')
                    });
                }
            });

            // Search page source for URLs
            const html = response.data as string;
            const m3u8s = html.match(/https?:\/\/[^\s"'<>]*\.m3u8[^\s"'<>]*/gi) || [];
            const mp4s = html.match(/https?:\/\/[^\s"'<>]*\.mp4[^\s"'<>]*/gi) || [];

            m3u8s.forEach(u => {
                if (!sources.find(s => s.url === u)) {
                    sources.push({ url: u, quality: 'auto' as const, isM3U8: true, isDASH: false });
                }
            });
            mp4s.forEach(u => {
                if (!sources.find(s => s.url === u)) {
                    sources.push({ url: u, quality: 'auto' as const, isM3U8: false, isDASH: false });
                }
            });

            if (sources.length > 0) {
                logger.info(`[AkiH] Found ${sources.length} stream sources via axios`);
                const result = { sources, subtitles: [], source: this.name };
                this.setCache(cacheKey, result, this.cacheTTL.stream);
                return result;
            }
        } catch (error: any) {
            logger.warn(`[AkiH] Axios fetch failed, trying Puppeteer: ${(error as Error).message?.slice(0, 100)}`);
        }

        // Fallback: Puppeteer (shorter timeout to prevent hanging)
        let browser: puppeteer.Browser | null = null;
        try {
            logger.info(`[AkiH] Fetching video page with Puppeteer (fallback): ${url}`);
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

            const videoUrls: string[] = [];
            page.on('response', async (response) => {
                const u = response.url();
                if (u.includes('.mp4') || u.includes('.m3u8') || u.includes('.mpd')) {
                    videoUrls.push(u);
                }
            });

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
            await page.waitForSelector('#player_container, video, iframe', { timeout: 5000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));

            const pageSources: VideoSource[] = await page.evaluate(() => {
                const found: any[] = [];
                document.querySelectorAll('video').forEach(v => {
                    const s = v.src || v.currentSrc;
                    if (s && s !== 'javascript:false') found.push({ url: s, quality: 'auto', isM3U8: s.includes('.m3u8'), isDASH: s.includes('.mpd') });
                });
                document.querySelectorAll('iframe').forEach(i => {
                    const s = i.src;
                    if (s && s !== 'javascript:false') found.push({ url: s, quality: 'auto', isM3U8: s.includes('.m3u8'), isDASH: s.includes('.mpd') });
                });
                return found;
            });

            // Add network-intercepted URLs
            const networkSources: VideoSource[] = videoUrls.map(url => ({
                url,
                quality: 'auto' as const,
                isM3U8: url.includes('.m3u8'),
                isDASH: url.includes('.mpd')
            }));

            // Combine all sources
            const allSources = [...pageSources, ...networkSources];

            // Deduplicate sources
            const uniqueSources = allSources.filter((source, index, self) =>
                index === self.findIndex(s => s.url === source.url)
            );

            logger.info(`[AkiH] Found ${uniqueSources.length} stream sources via Puppeteer`);

            if (uniqueSources.length > 0) {
                const result = { sources: uniqueSources, subtitles: [], source: this.name };
                this.setCache(cacheKey, result, this.cacheTTL.stream);
                return result;
            }

            logger.warn(`[AkiH] No stream URL found for ${url} via Puppeteer`);
        } catch (error: any) {
            logger.warn(`[AkiH] Puppeteer failed: ${(error as Error).message?.slice(0, 100)}`);
        } finally {
            if (browser) {
                await browser.close();
            }
        }

        return { sources: [], subtitles: [], source: this.name };
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
