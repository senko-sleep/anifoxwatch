/**
 * WatchHentai Source - Direct HTML scraping for adult anime content from watchhentai.net
 * Uses axios for fast HTTP requests with cheerio for HTML parsing
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { getHentaiProxyConfig } from '../utils/proxy-config.js';

export class WatchHentaiSource extends BaseAnimeSource {
    name = 'WatchHentai';
    baseUrl = 'https://watchhentai.net';

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
        const selectors = ['article', '.post', '.movie-item'];

        for (const selector of selectors) {
            $(selector).each((_, el) => {
                const $el = $(el);
                const link = $el.find('a').first();
                const href = link.attr('href');
                if (!href) return;

                const id = href.replace(this.baseUrl, '').replace(/^\//, '').replace(/\/$/, '');
                const prefixedId = `watchhentai-${id}`;
                
                const img = $el.find('img').first();
                const title = img.attr('alt') || $el.find('h2, h3, .title').first().text().trim() || 'Unknown Title';
                
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
        }
        return items;
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const proxyConfig = getHentaiProxyConfig();
            const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
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
            const cleanId = id.replace(/^watchhentai-/, '');
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

            const title = $('h1').first().text().trim() || $('title').text().replace(' - Watch Hentai', '').trim();
            const description = $('.entry-content p').first().text().trim() || '';
            let image = $('meta[property="og:image"]').attr('content') || '';
            if (!image) {
                const firstImg = $('.entry-content img').first();
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
        const cleanId = animeId.replace(/^watchhentai-/, '');

        // Fetch the anime page to find video links
        try {
            const proxyConfig = getHentaiProxyConfig();
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

            // Find video links on the page
            const videoLinks: Episode[] = [];
            $('a[href*="/videos/"]').each((_, link) => {
                const href = $(link).attr('href') || '';
                const text = $(link).text().trim();

                // Extract video ID from URL
                let videoId = href;

                // Remove protocol and domain if present
                if (videoId.includes('/videos/')) {
                    videoId = videoId.split('/videos/')[1];
                }

                // Remove trailing slash
                videoId = videoId.replace(/\/$/, '');

                // Match episode number from text
                const episodeMatch = text.match(/episode\s*(\d+)/i);
                const episodeNum = episodeMatch ? parseInt(episodeMatch[1]) : videoLinks.length + 1;

                if (videoId && !videoLinks.find(e => e.id === `watchhentai-videos/${videoId}`)) {
                    videoLinks.push({
                        id: `watchhentai-videos/${videoId}`,
                        number: episodeNum,
                        title: text || `Episode ${episodeNum}`,
                        isFiller: false,
                        hasDub: text.toLowerCase().includes('dub'),
                        hasSub: !text.toLowerCase().includes('dub')
                    });
                }
            });

            if (videoLinks.length > 0) {
                return videoLinks;
            }
        } catch (error) {
            this.handleError(error, 'getEpisodes');
        }

        // Fallback: single episode with converted ID format
        const fallbackId = cleanId.replace('series/', '').replace('-id-', '-episode-1-uncensored-id-');
        return [{
            id: `watchhentai-videos/${fallbackId}`,
            number: 1,
            title: 'Full Video',
            isFiller: false,
            hasDub: false,
            hasSub: true
        }];
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cleanId = episodeId.replace(/^watchhentai-/, '');
        return [{ name: 'WatchHentai', url: cleanId, type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const cleanId = episodeId.replace(/^(watchhentai|hanime|akih)-/, '');

            // Step 1: Determine Video Page URL
            let videoUrl = '';
            if (cleanId.startsWith('videos/')) {
                videoUrl = `${this.baseUrl}/${cleanId}`;
            } else if (cleanId.startsWith('http')) {
                videoUrl = cleanId;
            } else {
                // Search watchhentai.net
                const searchTerm = cleanId.replace(/-episode-\d+.*/, '').replace(/-/g, ' ');
                logger.info(`[WatchHentai] Searching for "${searchTerm}"...`);
                try {
                    const searchRes = await axios.get(`${this.baseUrl}/?s=${encodeURIComponent(searchTerm)}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        timeout: options?.timeout || 10000,
                        signal: options?.signal,
                    });
                    const $s = cheerio.load(searchRes.data);
                    const seriesUrl = $s('article a, .post a, .movie-item a').first().attr('href');

                    if (seriesUrl) {
                        const seriesRes = await axios.get(seriesUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                            timeout: options?.timeout || 10000,
                            signal: options?.signal,
                        });
                        const $page = cheerio.load(seriesRes.data);
                        const epNumMatch = cleanId.match(/episode-(\d+)/i);
                        const targetEpNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 1;

                        let matchedEpUrl = '';
                        $page('a[href*="/videos/"]').each((_, el) => {
                            const href = $page(el).attr('href');
                            const text = $page(el).text().trim();
                            if (href && (text.includes(`Episode ${targetEpNum}`) || href.includes(`episode-${targetEpNum}`))) {
                                matchedEpUrl = href;
                            }
                        });
                        if (!matchedEpUrl) {
                            matchedEpUrl = $page('a[href*="/videos/"]').first().attr('href') || '';
                        }
                        videoUrl = matchedEpUrl;
                    }
                } catch (e: any) {
                    logger.warn(`[WatchHentai] Search failed: ${e.message}`);
                }
            }

            if (!videoUrl) {
                videoUrl = `${this.baseUrl}/videos/${cleanId}/`;
            }

            logger.info(`[WatchHentai] Fetching video page: ${videoUrl}`);
            const response = await axios.get(videoUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                signal: options?.signal,
                timeout: options?.timeout || 15000,
            });

            const html = response.data;
            const $ = cheerio.load(html);
            const sources: VideoSource[] = [];

            // Step 2: DooPlayer AJAX Extraction
            const playerOptions = $('#playeroptionsul li');
            for (let i = 0; i < Math.min(3, playerOptions.length); i++) {
                const opt = playerOptions.eq(i);
                const post = opt.attr('data-post');
                const type = opt.attr('data-type');
                const nume = opt.attr('data-nume');

                if (post) {
                    try {
                        const params = new URLSearchParams();
                        params.append('action', 'doo_player_ajax');
                        params.append('post', post);
                        params.append('type', type || 'tv');
                        params.append('nume', nume || '1');

                        const ajaxRes = await axios.post(`${this.baseUrl}/wp-admin/admin-ajax.php`, params.toString(), {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'X-Requested-With': 'XMLHttpRequest',
                                'Referer': videoUrl,
                            },
                            timeout: 8000,
                            signal: options?.signal,
                        });

                        const embedUrl = ajaxRes.data?.embed_url;
                        if (embedUrl) {
                            const isDirect = embedUrl.endsWith('.mp4') || embedUrl.endsWith('.m3u8');
                            sources.push({
                                url: embedUrl,
                                quality: 'auto',
                                isM3U8: embedUrl.includes('.m3u8'),
                                isDirect,
                            });
                            logger.info(`[WatchHentai] Found stream URL: ${embedUrl}`);
                        }
                    } catch (e: any) {
                        logger.warn(`[WatchHentai] DooPlayer AJAX error: ${e.message}`);
                    }
                }
            }

            // Fallback: Parse JWPlayer script or iframe regex if DooPlayer didn't yield links
            if (sources.length === 0) {
                const mp4Matches = html.match(/https?:\/\/[^\s"'<>]+\.(mp4|m3u8)/gi);
                if (mp4Matches) {
                    const uniqueUrls = [...new Set(mp4Matches)] as string[];
                    for (const streamUrl of uniqueUrls) {
                        sources.push({
                            url: streamUrl,
                            quality: 'auto',
                            isM3U8: streamUrl.includes('.m3u8'),
                            isDirect: true,
                        });
                    }
                }
            }

            if (sources.length > 0) {
                const result: StreamingData = { sources, subtitles: [], source: this.name };
                this.setCache(cacheKey, result, this.cacheTTL.stream);
                return result;
            }

            logger.warn(`[WatchHentai] No stream URL found for ${videoUrl}`);
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
            // Use /series/ endpoint for better content organization
            const url = page && page > 1
                ? `${this.baseUrl}/series/page/${page}/`
                : `${this.baseUrl}/series/`;

            logger.info(`[WatchHentai] Fetching latest from: ${url}`);

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
            '3d', 'action', 'adventure', 'ahegao', 'anal', 'animal-ears', 'animation',
            'bdsm', 'beastiality', 'big-boobs', 'blackmail', 'blowjob', 'bondage',
            'brainwashed', 'bukakke', 'cat-girl', 'censored', 'comedy', 'cosplay',
            'creampie', 'dark-skin', 'deepthroat', 'demons', 'doctor', 'double-penatration',
            'drama', 'dubbed', 'ecchi', 'elf', 'eroge', 'facesitting', 'facial', 'family',
            'fantasy', 'female-doctor', 'female-teacher', 'femdom', 'footjob', 'futanari',
            'gangbang', 'gore', 'gyaru', 'harem', 'historical', 'horny-slut', 'housewife',
            'humiliation', 'incest', 'inflation', 'internal-cumshot', 'lactation',
            'large-breasts', 'lolicon', 'magical-girls', 'maid', 'martial-arts', 'megane',
            'milf', 'mind-break', 'molestation', 'ntr', 'nuns', 'nurses', 'office-ladies',
            'police', 'pov', 'pregnant', 'princess', 'public-sex', 'rape', 'rim-job',
            'romance', 'scat', 'school-girls', 'sci-fi', 'shotacon', 'shota', 'slave',
            'smell', 'smoking', 'soft-core', 'swimsuit', 'tentacles', 'threesome',
            'toys', 'tsundere', 'tuberose', 'uncensored', 'urination', 'vampire',
            'vanilla', 'virgin', 'voyeurism', 'yandere', 'yuri'
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

            logger.info(`[WatchHentai] Fetching genre page ${page}: ${url}`);

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

            // Check for next page - WatchHentai uses #nextpagination
            const hasNextPage = !!$('#nextpagination').length;

            // Extract total pages from pagination text like "Page 2 of 6"
            let totalPages = page;
            const paginationText = $('.pagination span').first().text();
            const totalPagesMatch = paginationText.match(/Page \d+ of (\d+)/);
            if (totalPagesMatch) {
                totalPages = parseInt(totalPagesMatch[1]);
            } else if (hasNextPage) {
                totalPages = page + 1;
            }

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