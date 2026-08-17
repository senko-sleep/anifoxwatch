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
        episodes: 15 * 60 * 1000,
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
        const cacheKey = `episodes:${cleanId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached && cached.length > 0) return cached;

        try {
            let seriesUrl = '';
            if (cleanId.startsWith('series/')) {
                seriesUrl = `${this.baseUrl}/${cleanId.replace(/\/$/, '')}/`;
            } else if (cleanId.startsWith('videos/')) {
                seriesUrl = `${this.baseUrl}/${cleanId.replace(/\/$/, '')}/`;
            } else if (cleanId.startsWith('http')) {
                seriesUrl = cleanId;
            } else {
                seriesUrl = `${this.baseUrl}/series/${cleanId.replace(/\/$/, '')}/`;
            }

            let response;
            try {
                response = await axios.get(seriesUrl, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    signal: options?.signal,
                    timeout: options?.timeout || 10000,
                });
            } catch {
                // If direct series URL failed, perform search
                const searchTerm = cleanId
                    .replace(/^series\//, '')
                    .replace(/^videos\//, '')
                    .replace(/-episode-\d+.*$/i, '')
                    .replace(/-id-\d+.*$/, '')
                    .replace(/-/g, ' ')
                    .trim();

                logger.info(`[WatchHentai] Direct series fetch failed, searching for "${searchTerm}"...`);
                try {
                    const searchRes = await axios.get(`${this.baseUrl}/?s=${encodeURIComponent(searchTerm)}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        timeout: 8000,
                        signal: options?.signal,
                    });
                    const $s = cheerio.load(searchRes.data);
                    let matchedSeriesUrl = '';
                    $s('article a, .post a, .movie-item a, a[href*="/series/"]').each((_, a) => {
                        let href = $s(a).attr('href') || '';
                        if (href.startsWith('/')) href = `${this.baseUrl}${href}`;
                        if (href.includes('/series/') && href !== `${this.baseUrl}/series/` && !matchedSeriesUrl) {
                            matchedSeriesUrl = href;
                        }
                    });
                    if (matchedSeriesUrl) {
                        response = await axios.get(matchedSeriesUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                            timeout: 8000,
                            signal: options?.signal,
                        });
                    }
                } catch (searchErr) {
                    logger.warn(`[WatchHentai] Search fallback failed: ${(searchErr as Error).message}`);
                }
            }

            if (response?.data) {
                const $ = cheerio.load(response.data);
                const episodes: Episode[] = [];
                const seenSlugs = new Set<string>();

                // Parse all video links on the series or video page
                $('a[href*="/videos/"]').each((_, el) => {
                    const href = $(el).attr('href') || '';
                    const text = $(el).text().trim();
                    
                    const match = href.match(/\/videos\/([^/]+)/);
                    if (!match) return;
                    const slug = match[1];
                    if (!slug || slug === 'videos' || seenSlugs.has(slug)) return;
                    seenSlugs.add(slug);

                    let epNum = 0;
                    const epMatch = slug.match(/episode[_-](\d+)/i) || text.match(/episode\s*(\d+)/i) || text.match(/ep\s*(\d+)/i) || slug.match(/[-_](\d+)[-_]/);
                    if (epMatch) {
                        epNum = parseInt(epMatch[1], 10);
                    }

                    const isDub = slug.toLowerCase().includes('dub') || text.toLowerCase().includes('dub');

                    episodes.push({
                        id: `watchhentai-videos/${slug}`,
                        number: epNum || (episodes.length + 1),
                        title: text || `Episode ${epNum || (episodes.length + 1)}`,
                        isFiller: false,
                        hasDub: isDub,
                        hasSub: !isDub,
                    });
                });

                if (episodes.length > 0) {
                    episodes.sort((a, b) => a.number - b.number);
                    this.setCache(cacheKey, episodes, this.cacheTTL.episodes);
                    return episodes;
                }
            }
        } catch (error) {
            this.handleError(error, 'getEpisodes');
        }

        const fallbackId = cleanId.startsWith('videos/') ? `watchhentai-${cleanId}` : `watchhentai-videos/${cleanId.replace(/^series\//, '')}`;
        return [{
            id: fallbackId,
            number: 1,
            title: 'Episode 1',
            isFiller: false,
            hasDub: false,
            hasSub: true,
        }];
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cleanId = episodeId.replace(/^watchhentai-/, '');
        return [{ name: 'WatchHentai', url: cleanId, type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const epNum = options?.episodeNum ?? 1;
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category}:${epNum}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const cleanId = episodeId.replace(/^(watchhentai|hanime|akih)-/, '');
            
            // Step 1: Find target video page URL
            let videoUrl = '';

            if (cleanId.startsWith('videos/')) {
                videoUrl = `${this.baseUrl}/${cleanId.replace(/\/$/, '')}/`;
            } else if (cleanId.startsWith('http')) {
                videoUrl = cleanId;
            } else {
                // Resolve episodes for this anime to find the exact video for epNum
                const episodes = await this.getEpisodes(cleanId, options);
                if (episodes && episodes.length > 0) {
                    const targetEp = episodes.find(e => e.number === epNum && (category === 'dub' ? e.hasDub : !e.hasDub)) 
                        || episodes.find(e => e.number === epNum) 
                        || (epNum <= episodes.length ? episodes[epNum - 1] : episodes[0]);
                    
                    if (targetEp) {
                        const epCleanId = targetEp.id.replace(/^watchhentai-/, '');
                        videoUrl = `${this.baseUrl}/${epCleanId.replace(/\/$/, '')}/`;
                        logger.info(`[WatchHentai] Resolved ${cleanId} ep ${epNum} → ${videoUrl}`);
                    }
                }
            }

            if (!videoUrl) {
                videoUrl = `${this.baseUrl}/videos/${cleanId.replace(/\/$/, '')}/`;
            }

            logger.info(`[WatchHentai] Fetching video page: ${videoUrl}`);

            const response = await axios.get(videoUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                signal: options?.signal,
                timeout: 15000,
            });

            const html = response.data;
            const $ = cheerio.load(html);
            const sources: VideoSource[] = [];

            // Step 2: Extract stream from iframes (data-litespeed-src / src containing source=)
            $('iframe').each((_, iframe) => {
                const src = $(iframe).attr('data-litespeed-src') || $(iframe).attr('src') || '';
                if (src.includes('source=')) {
                    try {
                        const u = new URL(src, this.baseUrl);
                        const s = u.searchParams.get('source');
                        if (s) {
                            const decoded = decodeURIComponent(s);
                            const isM3U8 = decoded.includes('.m3u8');
                            const isMP4 = decoded.includes('.mp4');
                            sources.push({
                                url: decoded,
                                quality: '1080p',
                                isM3U8,
                                isDirect: true,
                            });
                        }
                    } catch { /* ignore */ }
                }
            });

            // Step 3: DooPlayer AJAX Extraction
            if (sources.length === 0) {
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

                            const embedUrl = (ajaxRes as any).data?.embed_url;
                            if (embedUrl) {
                                const isM3U8 = embedUrl.includes('.m3u8');
                                const isMP4 = embedUrl.includes('.mp4');
                                sources.push({
                                    url: embedUrl,
                                    quality: '1080p',
                                    isM3U8: isM3U8,
                                    isDirect: isMP4 || isM3U8,
                                });
                            }
                        } catch { /* continue */ }
                    }
                }
            }

            // Step 4: Fallback HTML Regex matches for direct MP4/M3U8 URLs
            if (sources.length === 0) {
                const mp4Matches = html.match(/https?:\/\/[^\s"'<>]+?\.(mp4|m3u8)(?:\?[^\s"'<>]*)?/gi);
                if (mp4Matches) {
                    const uniqueUrls = [...new Set(mp4Matches)] as string[];
                    for (const streamUrl of uniqueUrls) {
                        const isM3U8 = streamUrl.includes('.m3u8');
                        const isMP4 = streamUrl.includes('.mp4');
                        sources.push({
                            url: streamUrl,
                            quality: '1080p',
                            isM3U8: isM3U8,
                            isDirect: true,
                        });
                    }
                }
            }

            if (sources.length > 0) {
                const uniqueSources: VideoSource[] = [];
                const seenUrls = new Set<string>();
                for (const s of sources) {
                    if (!seenUrls.has(s.url)) {
                        seenUrls.add(s.url);
                        uniqueSources.push(s);
                    }
                }

                const result: StreamingData = { 
                    sources: uniqueSources, 
                    subtitles: [], 
                    source: this.name,
                    headers: {
                        Referer: 'https://watchhentai.net/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                };
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