/**
 * GogoPlay Direct Source - Scrapes GogoPlay directly using fetch
 * Fast, reliable streaming without external API dependencies
 */

import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

export class GogoPlayDirectSource extends BaseAnimeSource {
    name = 'GogoPlayDirect';
    baseUrl = 'https://gogoanimes.fi';

    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = {
        search: 5 * 60 * 1000,
        anime: 15 * 60 * 1000,
        stream: 30 * 60 * 1000,
    };

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) return entry.data as T;
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: unknown, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await fetch(this.baseUrl, {
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, _filters?: unknown, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const url = `${this.baseUrl}/search.html?keyword=${encodeURIComponent(query)}`;
            const response = await fetch(url, {
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            const results = this.parseSearchResults(html);

            const result: AnimeSearchResult = {
                results,
                totalPages: Math.ceil(results.length / 20),
                currentPage: page,
                hasNextPage: results.length > 0,
                source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error: any) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    private parseSearchResults(html: string): AnimeBase[] {
        const items: AnimeBase[] = [];
        const linkRegex = /<a[^>]*href="([^"]*\/category\/([^"]+))"[^>]*title="([^"]*)"[^>]*>/gi;
        const imgRegex = /<img[^>]*src="([^"]*)"[^>]*>/gi;

        let match;
        const seenIds = new Set<string>();

        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const id = match[2];
            const title = match[3];

            if (!id || seenIds.has(id)) continue;
            seenIds.add(id);

            // Find image near the link
            const imgMatch = html.substring(Math.max(0, match.index - 500), match.index + 500).match(imgRegex);
            const image = imgMatch?.[1] || '';

            items.push({
                id: `gogoplay-${id}`,
                title: title || 'Unknown',
                image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                description: '',
                type: 'TV',
                status: 'Ongoing',
                rating: 0,
                episodes: 0,
                genres: []
            });
        }

        return items;
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const cacheKey = `anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const cleanId = id.replace(/^gogoplay-/, '');
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/category/${cleanId}`;
            const response = await fetch(url, {
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();

            const titleMatch = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
            const title = titleMatch?.[1]?.trim() || 'Unknown';

            const imgMatch = html.match(/<img[^>]*class="[^"]*poster[^"]*"[^>]*src="([^"]*)"[^>]*>/i);
            const image = imgMatch?.[1] || '';

            const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            const description = descMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';

            const anime: AnimeBase = {
                id,
                title,
                image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                description,
                type: 'TV',
                status: 'Ongoing',
                rating: 0,
                episodes: 0,
                genres: []
            };

            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error: any) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cleanId = animeId.replace(/^gogoplay-/, '');

        try {
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/category/${cleanId}`;
            const response = await fetch(url, {
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();

            const episodes: Episode[] = [];
            const epRegex = /<a[^>]*href="([^"]*\/([^"]*\/episode-\d+))"[^>]*>([^<]*)<\/a>/gi;
            let match;
            let epNum = 1;

            while ((match = epRegex.exec(html)) !== null) {
                const href = match[1];
                const epId = match[2];
                const title = match[3].trim();

                episodes.push({
                    id: `gogoplay-${epId}`,
                    number: epNum++,
                    title: title || `Episode ${epNum - 1}`,
                    isFiller: false,
                    hasDub: title.toLowerCase().includes('dub'),
                    hasSub: !title.toLowerCase().includes('dub')
                });
            }

            if (episodes.length > 0) return episodes;
        } catch (error: any) {
            this.handleError(error, 'getEpisodes');
        }

        return [{
            id: `gogoplay-${cleanId}-episode-1`,
            number: 1,
            title: 'Episode 1',
            isFiller: false,
            hasDub: false,
            hasSub: true
        }];
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cleanId = episodeId.replace(/^gogoplay-/, '');
        return [{ name: 'gogoplayer', url: cleanId, type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const cleanId = episodeId.replace(/^gogoplay-/, '');
            const url = cleanId.startsWith('http') ? cleanId : `${this.baseUrl}/${cleanId}`;

            logger.info(`[GogoPlayDirect] Fetching episode page: ${url}`);

            const response = await fetch(url, {
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();

            // Extract video URL from the page
            const sources: VideoSource[] = [];

            // Look for iframe with video player
            const iframeMatch = html.match(/<iframe[^>]*src="([^"]*)"[^>]*>/i);
            if (iframeMatch) {
                const iframeUrl = iframeMatch[1];
                sources.push({
                    url: iframeUrl,
                    quality: 'auto',
                    isM3U8: iframeUrl.includes('.m3u8'),
                    isDASH: iframeUrl.includes('.mpd')
                });
            }

            // Look for direct video links
            const videoMatch = html.match(/https?:\/\/[^\s"'<>]*\.(?:mp4|m3u8|mpd)[^\s"'<>]*/gi);
            if (videoMatch) {
                videoMatch.forEach(url => {
                    if (!sources.find(s => s.url === url)) {
                        sources.push({
                            url,
                            quality: 'auto',
                            isM3U8: url.includes('.m3u8'),
                            isDASH: url.includes('.mpd')
                        });
                    }
                });
            }

            logger.info(`[GogoPlayDirect] Found ${sources.length} stream sources`);

            if (sources.length > 0) {
                const result = { sources, subtitles: [], source: this.name };
                this.setCache(cacheKey, result, this.cacheTTL.stream);
                return result;
            }

            logger.warn(`[GogoPlayDirect] No stream URL found for ${url}`);
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
            const url = page > 1 ? `${this.baseUrl}/page/${page}/` : `${this.baseUrl}/`;
            const response = await fetch(url, {
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            return this.parseSearchResults(html);
        } catch (error: any) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const latest = await this.getLatest(page, options);
        return latest.slice(0, limit).map((anime, i) => ({
            rank: (page - 1) * limit + i + 1,
            anime
        }));
    }
}
