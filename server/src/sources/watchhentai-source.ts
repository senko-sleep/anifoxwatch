/**
 * WatchHentai Source - Direct HTML scraping for adult anime content
 * Uses axios for fast HTTP requests instead of Puppeteer
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming';
import { BaseAnimeSource, GenreAwareSource, SourceRequestOptions } from './base-source';
import { logger } from '../utils/logger';

export class WatchHentaiSource extends BaseAnimeSource implements GenreAwareSource {
    name = 'WatchHentai';
    baseUrl = 'https://watchhentai.net';

    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = {
        search: 3 * 60 * 1000,
        anime: 15 * 60 * 1000,
        stream: 2 * 60 * 60 * 1000,
    };

    // Global series index for deduplication across pages
    private seriesIndex: AnimeBase[] | null = null;
    private seriesIndexExpires: number = 0;
    private seriesIndexLoading: Promise<AnimeBase[]> | null = null;
    private readonly SERIES_INDEX_TTL = 30 * 60 * 1000; // 30 minutes
    private readonly SERIES_PER_PAGE = 25;
    private readonly SOURCE_PAGES_TO_FETCH = 48; // Max pages on WatchHentai

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
        const selectors = ['article'];
        const seenSeries = new Set<string>();

        for (const selector of selectors) {
            $(selector).each((_, el) => {
                const $el = $(el);
                const link = $el.find('a').first();
                const href = link.attr('href');
                if (!href) return;

                let id = href.replace(this.baseUrl, '').replace(/^\//, '').replace(/\/$/, '');
                
                // Convert episode pages to series pages by removing -id-## suffix
                // This ensures we get series covers instead of episode thumbnails
                const episodeMatch = id.match(/^(.+?)-id-\d+$/);
                if (episodeMatch) {
                    id = episodeMatch[1];
                }
                
                // Skip duplicates (multiple episodes of same series)
                if (seenSeries.has(id)) return;
                seenSeries.add(id);

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
            const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
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
            const cleanId = id.replace(/^watchhentai-/, '');
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
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
        } catch (error: any) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cleanId = animeId.replace(/^watchhentai-/, '');

        // Fetch the anime page to find video links
        try {
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const $ = cheerio.load(response.data);

            // Find video links on the page
            const videoLinks: Episode[] = [];
            $('a[href*="/videos/"]').each((_, link) => {
                const href = $(link).attr('href') || '';
                const text = $(link).text().trim();

                let videoId = href;
                if (videoId.includes('/videos/')) {
                    videoId = videoId.split('/videos/')[1];
                }
                videoId = videoId.replace(/\/$/, '');

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
        } catch (error: any) {
            this.handleError(error, 'getEpisodes');
        }

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

    /**
     * Get streaming URL from video page - extracts MP4 URL by fetching the JWPlayer page
     * The main video page contains an iframe pointing to a player page with actual stream URLs
     */
    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            // Clean the episode ID and construct video page URL
            const cleanId = episodeId.replace(/^watchhentai-/, '');

            // Build the video page URL
            let url: string;
            if (cleanId.startsWith('videos/')) {
                url = `${this.baseUrl}/${cleanId}`;
            } else if (cleanId.startsWith('http')) {
                url = cleanId;
            } else {
                url = `${this.baseUrl}/videos/${cleanId}/`;
            }

            logger.info(`[WatchHentai] Fetching video page: ${url}`);

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });

            const html = response.data;

            // Step 1: Find the JWPlayer iframe URL
            // Pattern: data-litespeed-src='https://watchhentai.net/jwplayer/?source=...
            const jwplayerMatch = html.match(/data-litespeed-src=['"]([^'"]*\/jwplayer\/[^'"]+)['"]/);
            const iframeSrcMatch = html.match(/iframe[^>]*src=['"]([^'"]*\/jwplayer\/[^'"]+)['"]/);

            let playerUrl = jwplayerMatch?.[1] || iframeSrcMatch?.[1];

            if (!playerUrl) {
                // Alternative: try to find any jwplayer URL
                const altMatch = html.match(/https:\/\/watchhentai\.net\/jwplayer\/\?[^"'\s]+/);
                playerUrl = altMatch?.[0];
            }

            if (!playerUrl) {
                logger.warn(`[WatchHentai] No JWPlayer URL found for ${url}`);
                return { sources: [], subtitles: [], source: this.name };
            }

            // Decode HTML entities if needed
            playerUrl = playerUrl.replace(/&/g, '&');

            logger.info(`[WatchHentai] Found player URL: ${playerUrl.substring(0, 100)}...`);

            // Step 2: Fetch the JWPlayer page to get actual video URLs
            const playerResponse = await axios.get(playerUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': 'https://watchhentai.net/',
                },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });

            const playerHtml = playerResponse.data;

            // Step 3: Extract video URLs from JWPlayer sources
            const sources: VideoSource[] = [];

            // Parse the sources array from jwplayer setup
            // Looking for: file: "https://hstorage.xyz/files/A/.../video_1080p.mp4"
            const fileMatches = playerHtml.matchAll(/file\s*:\s*["']([^"']+\.mp4)["'][^}]*label\s*:\s*["']([^"']+)["']/gi);

            for (const match of fileMatches) {
                const fileUrl = match[1];
                const label = match[2];

                // Map label to quality
                let quality: '1080p' | '720p' | '480p' | '360p' | 'auto' = 'auto';
                if (label.includes('1080')) quality = '1080p';
                else if (label.includes('720')) quality = '720p';
                else if (label.includes('480')) quality = '480p';
                else if (label.includes('360')) quality = '360p';

                sources.push({
                    url: fileUrl,
                    quality,
                    isM3U8: fileUrl.endsWith('.m3u8'),
                    isDASH: fileUrl.endsWith('.mpd')
                });

                logger.info(`[WatchHentai] Found stream: ${quality} - ${fileUrl.substring(0, 80)}...`);
            }

            // Step 3b: If no labelled sources, look for file entries without labels
            if (sources.length === 0) {
                const simpleFileMatches = playerHtml.matchAll(/file\s*:\s*["']([^"']+\.mp4)["']/gi);
                const uniqueUrls = new Set<string>();

                for (const match of simpleFileMatches) {
                    const fileUrl = match[1];
                    if (!uniqueUrls.has(fileUrl)) {
                        uniqueUrls.add(fileUrl);
                        sources.push({
                            url: fileUrl,
                            quality: 'auto',
                            isM3U8: fileUrl.endsWith('.m3u8'),
                            isDASH: fileUrl.endsWith('.mpd')
                        });
                        logger.info(`[WatchHentai] Found unlabelled stream: auto - ${fileUrl.substring(0, 80)}...`);
                    }
                }
            }

            // Fallback: Extract any mp4 URLs
            if (sources.length === 0) {
                const mp4Matches = playerHtml.match(/https:\/\/[^\s"'<>]*\.mp4/gi);
                if (mp4Matches) {
                    const uniqueUrls = [...new Set(mp4Matches)] as string[];
                    for (const streamUrl of uniqueUrls) {
                        // Try to guess quality from URL
                        const qualityMatch = streamUrl.match(/_(\d+p)\.mp4$/i);
                        const matchedQuality = qualityMatch ? qualityMatch[1] : null;

                        let quality: '1080p' | '720p' | '480p' | '360p' | 'auto' = 'auto';
                        if (matchedQuality === '1080p') quality = '1080p';
                        else if (matchedQuality === '720p') quality = '720p';
                        else if (matchedQuality === '480p') quality = '480p';
                        else if (matchedQuality === '360p') quality = '360p';

                        sources.push({
                            url: streamUrl,
                            quality,
                            isM3U8: false,
                            isDASH: false
                        });
                        logger.info(`[WatchHentai] Found fallback stream: ${quality} - ${streamUrl.substring(0, 80)}...`);
                    }
                }
            }

            // Sort sources by quality (highest first)
            const qualityOrder = ['1080p', '720p', '480p', '360p', 'auto'];
            sources.sort((a, b) => {
                return qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality);
            });

            if (sources.length > 0) {
                const result = { sources, subtitles: [], source: this.name };
                this.setCache(cacheKey, result, this.cacheTTL.stream);
                return result;
            }

            logger.warn(`[WatchHentai] No stream URL found for ${url}`);
            return { sources: [], subtitles: [], source: this.name };

        } catch (error: any) {
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

            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const $ = cheerio.load(response.data);
            
            // Extract total pages from pagination text like "Page 1 of 48"
            const paginationText = $('.pagination span').first().text();
            const totalPagesMatch = paginationText.match(/Page \d+ of (\d+)/);
            if (totalPagesMatch) {
                const totalPages = parseInt(totalPagesMatch[1]);
                logger.info(`[WatchHentai] Page ${page} of ${totalPages} total pages available`);
            }
            
            return this.parseAnimeItems($);
        } catch (error: any) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    /**
     * Build a globally deduplicated series index by fetching multiple source pages.
     * Fetches progressively - first few pages immediately, rest in background.
     */
    private async buildSeriesIndex(options?: SourceRequestOptions): Promise<AnimeBase[]> {
        // Return cached index if valid
        if (this.seriesIndex && this.seriesIndexExpires > Date.now()) {
            return this.seriesIndex;
        }

        // If already loading, wait for it
        if (this.seriesIndexLoading) {
            return this.seriesIndexLoading;
        }

        this.seriesIndexLoading = (async () => {
            const allSeries = new Map<string, AnimeBase>();
            const maxSourcePages = this.SOURCE_PAGES_TO_FETCH;

            logger.info(`[WatchHentai] Building series index from ${maxSourcePages} source pages...`);

            // Fetch pages in batches of 5 for speed
            const batchSize = 5;
            for (let batch = 0; batch < Math.ceil(maxSourcePages / batchSize); batch++) {
                const promises: Promise<void>[] = [];
                for (let i = 0; i < batchSize; i++) {
                    const sourcePage = batch * batchSize + i + 1;
                    if (sourcePage > maxSourcePages) break;

                    promises.push((async () => {
                        try {
                            const url = sourcePage > 1
                                ? `${this.baseUrl}/series/page/${sourcePage}/`
                                : `${this.baseUrl}/series/`;
                            const response = await axios.get(url, {
                                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                                timeout: 15000
                            });
                            const $ = cheerio.load(response.data);
                            const items = this.parseAnimeItems($);
                            // Add to global map - deduplicates by ID
                            for (const item of items) {
                                if (!allSeries.has(item.id)) {
                                    allSeries.set(item.id, item);
                                }
                            }
                        } catch (e) {
                            logger.warn(`[WatchHentai] Failed to fetch source page ${sourcePage}`);
                        }
                    })());
                }
                await Promise.all(promises);
                
                // After first batch, check if we have enough for immediate use
                if (batch === 0) {
                    logger.info(`[WatchHentai] First batch done: ${allSeries.size} unique series so far`);
                }
            }

            const index = Array.from(allSeries.values());
            logger.info(`[WatchHentai] Series index built: ${index.length} unique series from ${maxSourcePages} source pages`);

            this.seriesIndex = index;
            this.seriesIndexExpires = Date.now() + this.SERIES_INDEX_TTL;
            this.seriesIndexLoading = null;
            return index;
        })();

        return this.seriesIndexLoading;
    }

    async getByType(type: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            // Build/retrieve the globally deduplicated series index
            const allSeries = await this.buildSeriesIndex(options);

            // Paginate from the deduplicated index
            const startIndex = (page - 1) * this.SERIES_PER_PAGE;
            const endIndex = startIndex + this.SERIES_PER_PAGE;
            const results = allSeries.slice(startIndex, endIndex);
            const totalPages = Math.ceil(allSeries.length / this.SERIES_PER_PAGE);
            const hasNextPage = endIndex < allSeries.length;

            logger.info(`[WatchHentai] getByType page ${page}: returning ${results.length} results (${startIndex}-${endIndex} of ${allSeries.length})`);

            return {
                results,
                totalPages,
                currentPage: page,
                hasNextPage,
                source: this.name
            };
        } catch (error: any) {
            this.handleError(error, 'getByType');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
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
            '3d',
            'action',
            'adventure',
            'ahegao',
            'anal',
            'animal-ears',
            'animation',
            'bdsm',
            'beastiality',
            'big-boobs',
            'blackmail',
            'blowjob',
            'bondage',
            'brainwashed',
            'bukakke',
            'cat-girl',
            'censored',
            'comedy',
            'cosplay',
            'creampie',
            'dark-skin',
            'deepthroat',
            'demons',
            'doctor',
            'double-penatration',
            'drama',
            'dubbed',
            'ecchi',
            'elf',
            'eroge',
            'facesitting',
            'facial',
            'family',
            'fantasy',
            'female-doctor',
            'female-teacher',
            'femdom',
            'footjob',
            'futanari',
            'gangbang',
            'gore',
            'gyaru',
            'harem',
            'historical',
            'horny-slut',
            'housewife',
            'humiliation',
            'incest',
            'inflation',
            'internal-cumshot',
            'lactation',
            'large-breasts',
            'lolicon',
            'magical-girls',
            'maid',
            'martial-arts',
            'megane',
            'milf',
            'mind-break',
            'molestation',
            'ntr',
            'nuns',
            'nurses',
            'office-ladies',
            'police',
            'pov',
            'pregnant',
            'princess',
            'public-sex',
            'rape',
            'rim-job',
            'romance',
            'scat',
            'school-girls',
            'sci-fi',
            'shotacon',
            'shota',
            'slave',
            'smell',
            'smoking',
            'soft-core',
            'swimsuit',
            'tentacles',
            'threesome',
            'toys',
            'tsundere',
            'tuberose',
            'uncensored',
            'urination',
            'vampire',
            'vanilla',
            'virgin',
            'voyeurism',
            'yandere',
            'yuri'
        ];
    }

    /**
     * Convert genre display name to URL slug format
     * E.g., "Three Some" -> "three-some", "MILF" -> "milf"
     */
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

            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: options?.signal,
                timeout: options?.timeout || 15000
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
        } catch (error: any) {
            this.handleError(error, 'getByGenre');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
}
