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
import {
    hasNextPage as pageHasNext,
    isBlockedGenre,
    parseCards,
    parseFeaturedSlugs,
    parseLastPage,
    parseSeries,
    type ParsedSeries,
} from './watchhentai-parse.js';
import { streamExtractor } from '../services/stream-extractor.js';

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

    /** Cards from any listing, search or genre page — real posters and release labels, no filler fields. */
    private parseAnimeItems($: cheerio.CheerioAPI): AnimeBase[] {
        return parseCards($);
    }

    private async fetchHtml(url: string, options?: SourceRequestOptions, timeout = 20000): Promise<string> {
        const proxyConfig = getHentaiProxyConfig();
        const response = await axios.get<string>(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: options?.signal,
            timeout: options?.timeout || timeout,
            proxy: proxyConfig || options?.proxy,
        });
        return response.data;
    }

    /** `watchhentai-series/foo` | `series/foo` | `foo` → `foo`. Null for anything that isn't a series id. */
    private seriesSlug(id: string): string | null {
        const clean = id.replace(/^watchhentai-/, '').replace(/\/+$/, '');
        if (clean.startsWith('videos/') || clean.startsWith('http')) return null;
        return clean.replace(/^series\//, '') || null;
    }

    /**
     * One series page → details and its own episode list. This single fetch feeds
     * getAnime, getEpisodes and the dedicated /api/hentai title endpoint, so they can
     * never disagree about which show they describe.
     */
    async getSeriesDetail(slug: string, options?: SourceRequestOptions): Promise<ParsedSeries | null> {
        const cacheKey = `series:${slug}`;
        const cached = this.getCached<ParsedSeries | null>(cacheKey);
        if (cached !== null) return cached;

        try {
            const html = await this.fetchHtml(`${this.baseUrl}/series/${slug}/`, options);
            const parsed = parseSeries(cheerio.load(html), slug);
            if (!parsed || parsed.anime.genres.some(isBlockedGenre)) return null;
            this.setCache(cacheKey, parsed, this.cacheTTL.anime);
            return parsed;
        } catch (error) {
            this.handleError(error, 'getSeriesDetail');
            return null;
        }
    }

    /** `/series/` — every title, newest first. */
    async listSeries(page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `list:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const url = page > 1 ? `${this.baseUrl}/series/page/${page}/` : `${this.baseUrl}/series/`;
            const $ = cheerio.load(await this.fetchHtml(url, options));
            const result: AnimeSearchResult = {
                results: parseCards($),
                totalPages: parseLastPage($),
                currentPage: page,
                hasNextPage: pageHasNext($, page),
                source: this.name,
            };
            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            this.handleError(error, 'listSeries');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    /** Slugs from the home page's "Featured Series" block. */
    async getFeaturedSlugs(options?: SourceRequestOptions): Promise<string[]> {
        const cached = this.getCached<string[]>('featured');
        if (cached) return cached;
        try {
            const slugs = parseFeaturedSlugs(cheerio.load(await this.fetchHtml(this.baseUrl, options)));
            this.setCache('featured', slugs, this.cacheTTL.search);
            return slugs;
        } catch (error) {
            this.handleError(error, 'getFeaturedSlugs');
            return [];
        }
    }

    /**
     * The site's own search, all of it: `?s=` has ten pages for a query like "school",
     * and this used to read only the first. `type=series` keeps episodes and 3D uploads
     * out of a title search.
     */
    async search(query: string, page: number = 1, _filters?: unknown, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const q = query.trim();
        const cacheKey = `search:${q.toLowerCase()}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const path = page > 1 ? `/page/${page}/` : '/';
            const $ = cheerio.load(await this.fetchHtml(`${this.baseUrl}${path}?s=${encodeURIComponent(q)}&type=series`, options, 30000));
            const last = parseLastPage($);
            const result: AnimeSearchResult = {
                results: parseCards($),
                totalPages: last,
                currentPage: page,
                hasNextPage: pageHasNext($, page),
                source: this.name,
            };
            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const slug = this.seriesSlug(id);
        if (!slug) return null;
        return (await this.getSeriesDetail(slug, options))?.anime ?? null;
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const clean = animeId.replace(/^watchhentai-/, '').replace(/\/+$/, '');

        // A bare episode id names exactly one video — there is no list to look up.
        if (clean.startsWith('videos/')) {
            const num = parseInt(clean.match(/episode-(\d+)/i)?.[1] ?? '1', 10) || 1;
            return [{
                id: `watchhentai-${clean}`,
                number: num,
                title: `Episode ${num}`,
                isFiller: false,
                hasSub: true,
                hasDub: false,
            }];
        }

        // Never guess by searching the site: a fuzzy title search is how one show ends up
        // playing under another's name. The series page either exists or it doesn't.
        const slug = this.seriesSlug(animeId);
        if (!slug) return [];
        return (await this.getSeriesDetail(slug, options))?.episodes ?? [];
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cleanId = episodeId.replace(/^watchhentai-/, '');
        return [{ name: 'WatchHentai', url: cleanId, type: 'sub' }];
    }

    /**
     * The site's own player ships each media URL through a small reversible
     * encoding (base64url → XOR with a rolling key → reverse → base64) and decodes
     * it in the browser. We do the same steps a browser would when it loads the page.
     */
    private decodeMediaUrl(encoded: string): string | null {
        try {
            let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            const xored = Buffer.from(b64, 'base64').toString('latin1');
            let unxored = '';
            for (let i = 0; i < xored.length; i++) {
                unxored += String.fromCharCode(xored.charCodeAt(i) ^ ((13 + (i % 17)) & 255));
            }
            const url = Buffer.from(unxored.split('').reverse().join(''), 'base64').toString('utf-8');
            return /^https?:\/\//i.test(url) ? url : null;
        } catch {
            return null;
        }
    }

    /**
     * Pull playable files from the site's `/player/<post>/<n>/mp4/` page — the URL
     * its own player actually uses. (The older `doo_player_ajax` endpoint now returns
     * a legacy path that 404s, which is why episodes used to fail to play.)
     */
    private async extractFromPlayerPage(
        html: string,
        videoUrl: string,
        signal?: AbortSignal
    ): Promise<VideoSource[]> {
        const ref = html.match(/\/player(?:-alt)?\/(\d+)\/(\d+)\/(\w+)\//);
        if (!ref) return [];
        const [, post, nume, kind] = ref;

        for (const route of ['player', 'player-alt']) {
            try {
                const res = await axios.get(`${this.baseUrl}/${route}/${post}/${nume}/${kind}/`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        Referer: videoUrl,
                    },
                    timeout: 10000,
                    signal,
                });
                const body = String(res.data);
                const list = body.match(/(?:whJwSources|\bSources)\s*=\s*(\[[\s\S]*?\])\s*;/);
                if (!list) continue;

                const found: VideoSource[] = [];
                for (const entry of JSON.parse(list[1]) as { file?: string; label?: string }[]) {
                    const url = entry.file ? this.decodeMediaUrl(entry.file) : null;
                    if (!url) continue;

                    const height = url.match(/_(\d{3,4})p\./)?.[1] || entry.label?.match(/(\d{3,4})/)?.[1];
                    const quality = (['1080', '720', '480', '360'].includes(height || '')
                        ? `${height}p`
                        : 'default') as VideoSource['quality'];

                    found.push({
                        url,
                        quality,
                        isM3U8: /\.m3u8/i.test(url),
                        isDirect: true,
                        isPreview: /[-_]preview\./i.test(url),
                    });
                }
                if (found.length) return found;
            } catch {
                /* try the alternate player route */
            }
        }
        return [];
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

            // Step 1: the site's own player page — full-quality files, several sizes.
            sources.push(...(await this.extractFromPlayerPage(html, videoUrl, options?.signal)));

            // Step 2: Extract stream from iframes (data-litespeed-src / src containing source=)
            if (sources.length === 0) $('iframe').each((_, iframe) => {
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

            // Step 5: Browser-based extraction fallback - use the same API as anime sources
            if (sources.length === 0) {
                logger.info(`[WatchHentai] No sources found via HTTP scraping, trying browser-based extraction for ${videoUrl}`);
                try {
                    const extraction = await streamExtractor.extractFromEmbed(videoUrl);
                    if (extraction.success && extraction.streams.length > 0) {
                        const browserSources = extraction.streams
                            .filter(s => {
                                const u = s.url.toLowerCase();
                                return !u.includes('ping.gif') && !u.includes('analytics') && !u.includes('jwplayer') && !u.includes('/ping');
                            })
                            .map(s => ({
                                url: s.url,
                                quality: (s.quality || 'auto') as '360p' | '480p' | '720p' | '1080p' | 'auto' | 'default',
                                isM3U8: s.url.includes('.m3u8') || s.type === 'hls',
                                isEmbed: false,
                                isDirect: false,
                                server: 'WatchHentai-Browser',
                            }));
                        sources.push(...browserSources);
                        logger.info(`[WatchHentai] Browser extraction found ${browserSources.length} streams`);
                    }
                } catch (browserError: any) {
                    logger.warn(`[WatchHentai] Browser extraction failed: ${browserError.message}`);
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

                const rank = (v: VideoSource) => parseInt(v.quality, 10) || 0;
                uniqueSources.sort(
                    (x, y) => Number(!!x.isPreview) - Number(!!y.isPreview) || rank(y) - rank(x)
                );

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
        return (await this.listSeries(page, options)).results;
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
        ].filter((g) => !isBlockedGenre(g));
    }

    private genreToSlug(genre: string): string {
        return genre
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    }

    async getByGenre(genre: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const genreSlug = this.genreToSlug(genre);
        if (isBlockedGenre(genreSlug)) {
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }

        const cacheKey = `genre:${genreSlug}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const url = page > 1
                ? `${this.baseUrl}/genre/${genreSlug}/page/${page}/`
                : `${this.baseUrl}/genre/${genreSlug}/`;
            const $ = cheerio.load(await this.fetchHtml(url, options));
            const result: AnimeSearchResult = {
                results: parseCards($),
                totalPages: parseLastPage($),
                currentPage: page,
                hasNextPage: pageHasNext($, page),
                source: this.name,
            };
            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            this.handleError(error, 'getByGenre');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
}

/** One instance for the whole process: the source manager and /api/hentai share its cache. */
export const watchHentaiSource = new WatchHentaiSource();
