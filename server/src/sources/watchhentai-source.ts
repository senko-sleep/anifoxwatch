/**
 * WatchHentai Source - Direct HTML scraping for adult anime content
 * Uses axios for fast HTTP requests instead of Puppeteer
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming';
import { BaseAnimeSource } from './base-source';
import { logger } from '../utils/logger';

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

    async healthCheck(): Promise<boolean> {
        try {
            const response = await axios.get(this.baseUrl, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            this.isAvailable = false;
            return false;
        }
    }

    private parseAnimeItems($: cheerio.CheerioAPI): AnimeBase[] {
        const items: AnimeBase[] = [];
        const selectors = ['article'];

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

    async search(query: string, page: number = 1): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
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
            logger.error(`[WatchHentai] Search failed: ${error.message}`);
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string): Promise<AnimeBase | null> {
        try {
            const cleanId = id.replace(/^watchhentai-/, '');
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
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

            return {
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
        } catch (error: any) {
            logger.error(`[WatchHentai] getAnime failed: ${error.message}`);
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const cleanId = animeId.replace(/^watchhentai-/, '');

        // Fetch the anime page to find video links
        try {
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const $ = cheerio.load(response.data);

            // Find video links on the page
            const videoLinks: Episode[] = [];
            $('a[href*="/videos/"]').each((_, link) => {
                const href = $(link).attr('href') || '';
                const text = $(link).text().trim();

                // Extract video ID from URL (handle both relative and absolute URLs)
                // href can be: /videos/slug, https://watchhentai.net/videos/slug/, //watchhentai.net/videos/slug
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
        } catch (error: any) {
            logger.error(`[WatchHentai] Failed to fetch episodes: ${error.message}`);
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

    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const cleanId = episodeId.replace(/^watchhentai-/, '');
        return [{ name: 'WatchHentai', url: cleanId, type: 'sub' }];
    }

    /**
     * Get streaming URL from video page - extracts MP4 URL by fetching the JWPlayer page
     * The main video page contains an iframe pointing to a player page with actual stream URLs
     */
    async getStreamingLinks(episodeId: string, server?: string, category?: 'sub' | 'dub'): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category || 'sub'}`;
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
                timeout: 15000
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
            playerUrl = playerUrl.replace(/&amp;/g, '&');

            logger.info(`[WatchHentai] Found player URL: ${playerUrl.substring(0, 100)}...`);

            // Step 2: Fetch the JWPlayer page to get actual video URLs
            const playerResponse = await axios.get(playerUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': 'https://watchhentai.net/',
                },
                timeout: 15000
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
            logger.error(`[WatchHentai] Stream extraction failed: ${error.message}`);
            return { sources: [], subtitles: [], source: this.name };
        }
    }

    async getTrending(page?: number): Promise<AnimeBase[]> {
        return this.getLatest(page);
    }

    async getLatest(page?: number): Promise<AnimeBase[]> {
        try {
            const url = page && page > 1 ? `${this.baseUrl}/page/${page}` : this.baseUrl;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const $ = cheerio.load(response.data);
            return this.parseAnimeItems($);
        } catch (error: any) {
            logger.error(`[WatchHentai] getLatest failed: ${error.message}`);
            return [];
        }
    }

    async getTopRated(page?: number, limit?: number): Promise<TopAnime[]> {
        const latest = await this.getLatest(page);
        return latest.map((anime, index) => ({
            rank: index + 1,
            anime
        }));
    }
}
