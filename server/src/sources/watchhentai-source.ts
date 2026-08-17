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
                timeout: options?.timeout || 30000,
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
                timeout: options?.timeout || 30000,
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
                timeout: options?.timeout || 30000,
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

        // For hentai, most content is single videos. 
        // Generate multiple episode entries but all pointing to the same video ID
        // This allows users to "switch episodes" in the UI but they all play the same content
        const rawSlug = cleanId.replace('series/', '');
        const idMatch = rawSlug.match(/^(.+)-id-(\d+)$/);
        const baseSlug = idMatch ? idMatch[1] : rawSlug;
        const idSuffix = idMatch ? `-id-${idMatch[2]}` : '';
        const baseVideoId = `watchhentai-videos/${baseSlug}${idSuffix}`;

        // Try to fetch the page to see if there are actual multiple videos
        try {
            const proxyConfig = getHentaiProxyConfig();
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;
            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                signal: options?.signal,
                timeout: options?.timeout || 10000, // Shorter timeout for episode detection
                proxy: proxyConfig || options?.proxy
            });
            const $ = cheerio.load(response.data);

            // Count distinct video links
            const selectors = [
                'a[href*="/videos/"]',
                'a[href*="/hentai/"]',
                '.episode-link a',
                '.video-card a',
                '.related-video a',
                'article a[href*="/"]'
            ];

            const seenIds = new Set<string>();
            let videoCount = 0;

            for (const selector of selectors) {
                $(selector).each((_, link) => {
                    const href = $(link).attr('href') || '';
                    let videoId = href;

                    if (videoId.includes('/videos/')) {
                        videoId = videoId.split('/videos/')[1];
                    } else if (videoId.includes('/hentai/')) {
                        videoId = videoId.split('/hentai/')[1];
                    } else {
                        videoId = videoId.replace(this.baseUrl, '').replace(/^\//, '');
                    }

                    videoId = videoId.replace(/\/$/, '').replace(/-episode-\d+/i, '');

                    if (!seenIds.has(videoId)) {
                        seenIds.add(videoId);
                        videoCount++;
                    }
                });

                if (videoCount > 1) break; // Found multiple distinct videos
            }

            // If we found multiple distinct videos, return them with their actual IDs
            if (videoCount > 1) {
                const videoLinks: Episode[] = [];
                const seenIds2 = new Set<string>();

                for (const selector of selectors) {
                    $(selector).each((_, link) => {
                        const href = $(link).attr('href') || '';
                        const text = $(link).text().trim();

                        let videoId = href;
                        if (videoId.includes('/videos/')) {
                            videoId = videoId.split('/videos/')[1];
                        } else if (videoId.includes('/hentai/')) {
                            videoId = videoId.split('/hentai/')[1];
                        } else {
                            videoId = videoId.replace(this.baseUrl, '').replace(/^\//, '');
                        }

                        videoId = videoId.replace(/\/$/, '');

                        if (seenIds2.has(videoId)) return;
                        seenIds2.add(videoId);

                        const episodePatterns = [
                            /episode\s*(\d+)/i,
                            /ep\s*(\d+)/i,
                            /part\s*(\d+)/i,
                            /chapter\s*(\d+)/i,
                            /(\d+)\s*(?:th|nd|rd|st)?\s*episode/i
                        ];
                        
                        let episodeNum = videoLinks.length + 1;
                        for (const pattern of episodePatterns) {
                            const match = text.match(pattern);
                            if (match) {
                                episodeNum = parseInt(match[1]);
                                break;
                            }
                        }

                        if (videoId) {
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

                    if (videoLinks.length > 0) break;
                }

                if (videoLinks.length > 0) {
                    videoLinks.sort((a, b) => a.number - b.number);
                    videoLinks.forEach((ep, index) => {
                        ep.number = index + 1;
                    });
                    return videoLinks;
                }
            }
        } catch (error) {
            this.handleError(error, 'getEpisodes');
        }

        // Fallback: For single video hentai content, generate 3 episodes all pointing to same video
        // This allows UI episode switching while all playing the same content
        const fallbackEpisodes: Episode[] = [
            {
                id: baseVideoId,
                number: 1,
                title: 'Episode 1',
                isFiller: false,
                hasDub: false,
                hasSub: true
            },
            {
                id: baseVideoId,
                number: 2,
                title: 'Episode 2',
                isFiller: false,
                hasDub: false,
                hasSub: true
            },
            {
                id: baseVideoId,
                number: 3,
                title: 'Episode 3',
                isFiller: false,
                hasDub: false,
                hasSub: true
            }
        ];

        return fallbackEpisodes;
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cleanId = episodeId.replace(/^watchhentai-/, '');
        return [{ name: 'WatchHentai', url: cleanId, type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category}:${options?.episodeNum ?? 'auto'}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const cleanId = episodeId.replace(/^(watchhentai|hanime|akih)-/, '');
            const epNum = options?.episodeNum;

            // Step 1: Determine Video Page URL
            let videoUrl = '';
            if (cleanId.startsWith('videos/')) {
                let videoSlug = cleanId.replace('videos/', '');
                
                // For hentai, most content is single videos - always use base slug regardless of episode number
                // Hentai sites typically don't have multiple episodes like regular anime
                // All episodes point to the same video content
                if (epNum && epNum > 1) {
                    // Strip any episode number from the slug to get the base video
                    videoSlug = videoSlug.replace(/-episode-\d+/i, '');
                    logger.info(`[WatchHentai] Using base slug for episode ${epNum} (hentai single video): ${videoSlug}`);
                }
                
                videoUrl = `${this.baseUrl}/videos/${videoSlug}`;
            } else if (cleanId.startsWith('http')) {
                videoUrl = cleanId;
            } else {
                // Search watchhentai.net for the content
                const searchTerm = cleanId.replace(/-episode-\d+.*/, '').replace(/-/g, ' ');
                logger.info(`[WatchHentai] Searching for "${searchTerm}"...`);
                try {
                    const searchRes = await axios.get(`${this.baseUrl}/?s=${encodeURIComponent(searchTerm)}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        timeout: 5000, // Reduced timeout for search
                        signal: options?.signal,
                    });
                    const $s = cheerio.load(searchRes.data);
                    const seriesUrl = $s('article a, .post a, .movie-item a').first().attr('href');

                    if (seriesUrl) {
                        const seriesRes = await axios.get(seriesUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                            timeout: 5000, // Reduced timeout for series page
                            signal: options?.signal,
                        });
                        const $page = cheerio.load(seriesRes.data);
                        
                        // For hentai, always use the first video since most are single videos
                        const matchedEpUrl = $page('a[href*="/videos/"]').first().attr('href') || '';
                        videoUrl = matchedEpUrl;
                    }
                } catch (e: unknown) {
                    logger.warn(`[WatchHentai] Search failed: ${(e as Error).message}`);
                }
            }

            if (!videoUrl) {
                videoUrl = `${this.baseUrl}/videos/${cleanId}/`;
            }

            logger.info(`[WatchHentai] Fetching video page: ${videoUrl}`);
            
            // Wrap video page fetch with timeout to prevent blocking
            let response;
            try {
                response = await Promise.race([
                    axios.get(videoUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        },
                        signal: options?.signal,
                        timeout: 8000, // Reduced timeout from 30000 to 8000 to prevent API blocking
                    }),
                    new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error('Video page fetch timeout')), 8000)
                    )
                ]) as any;
            } catch (fetchError) {
                // If the URL with episode number fails, try the base slug (hentai single video)
                if (epNum && epNum > 1 && videoUrl.includes('-episode-')) {
                    logger.warn(`[WatchHentai] Episode ${epNum} URL failed, trying base slug (hentai single video)`);
                    const fallbackUrl = videoUrl.replace(/-episode-\d+/i, '');
                    
                    try {
                        response = await Promise.race([
                            axios.get(fallbackUrl, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                },
                                signal: options?.signal,
                                timeout: 8000,
                            }),
                            new Promise<never>((_, reject) => 
                                setTimeout(() => reject(new Error('Fallback video page fetch timeout')), 8000)
                            )
                        ]) as any;
                        logger.info(`[WatchHentai] Fallback to base slug succeeded for episode ${epNum}`);
                    } catch (fallbackError) {
                        logger.error(`[WatchHentai] Fallback also failed: ${(fallbackError as Error).message}`);
                        throw fetchError;
                    }
                } else {
                    throw fetchError;
                }
            }

            const html = response.data;
            const $ = cheerio.load(html);
            const sources: VideoSource[] = [];

            // Step 2: DooPlayer AJAX Extraction with individual timeouts
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

                        // Wrap AJAX request with timeout to prevent blocking
                        const ajaxRes = await Promise.race([
                            axios.post(`${this.baseUrl}/wp-admin/admin-ajax.php`, params.toString(), {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                    'X-Requested-With': 'XMLHttpRequest',
                                    'Referer': videoUrl,
                                },
                                timeout: 5000, // Reduced timeout
                                signal: options?.signal,
                            }),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('AJAX timeout')), 5000)
                            )
                        ]);

                        const embedUrl = (ajaxRes as any).data?.embed_url;
                        if (embedUrl) {
                            // Better MP4 detection - check for .mp4 anywhere in URL, not just at the end
                            const isM3U8 = embedUrl.includes('.m3u8');
                            const isMP4 = embedUrl.includes('.mp4');
                            const isDirect = isMP4 || isM3U8;
                            sources.push({
                                url: embedUrl,
                                quality: 'auto',
                                isM3U8: isM3U8,
                                isDirect,
                            });
                            logger.info(`[WatchHentai] Found stream URL: ${embedUrl} (type: ${isM3U8 ? 'HLS' : isMP4 ? 'MP4' : 'unknown'})`);
                        }
                    } catch (e: unknown) {
                        // Log timeout or other errors without blocking
                        if ((e as Error).message === 'AJAX timeout') {
                            logger.warn(`[WatchHentai] DooPlayer AJAX timeout for ${videoUrl}`);
                        } else {
                            logger.warn(`[WatchHentai] DooPlayer AJAX error: ${(e as Error).message}`);
                        }
                    }
                }
            }

            // Fallback: Parse JWPlayer script or iframe regex if DooPlayer didn't yield links
            if (sources.length === 0) {
                // More robust regex to capture MP4/M3U8 URLs even with query parameters
                const mp4Matches = html.match(/https?:\/\/[^\s"'<>]+?\.(mp4|m3u8)(?:\?[^\s"'<>]*)?/gi);
                if (mp4Matches) {
                    const uniqueUrls = [...new Set(mp4Matches)] as string[];
                    for (const streamUrl of uniqueUrls) {
                        const isM3U8 = streamUrl.includes('.m3u8');
                        const isMP4 = streamUrl.includes('.mp4');
                        sources.push({
                            url: streamUrl,
                            quality: 'auto',
                            isM3U8: isM3U8,
                            isDirect: true,
                        });
                        logger.info(`[WatchHentai] Fallback found stream URL: ${streamUrl} (type: ${isM3U8 ? 'HLS' : isMP4 ? 'MP4' : 'unknown'})`);
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
            // Better error handling for timeouts
            if ((error as Error).message === 'Video page fetch timeout') {
                logger.warn(`[WatchHentai] Video page fetch timeout`);
            } else {
                this.handleError(error, 'getStreamingLinks');
            }
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
                timeout: options?.timeout || 30000,
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
                timeout: options?.timeout || 30000,
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