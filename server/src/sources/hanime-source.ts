/**
 * Hanime Source - Additional adult anime content source
 * Uses hanime.tv API for hentai streaming
 */

import axios from 'axios';
import { AnimeBase, AnimeSearchResult, Episode } from '../types/anime';
import { StreamingData, VideoSource } from '../types/streaming';
import { BaseAnimeSource, GenreAwareSource, SourceRequestOptions } from './base-source';
import { logger } from '../utils/logger';

interface HanimeVideo {
    id: number;
    slug: string;
    name: string;
    description: string;
    poster_url: string;
    cover_url: string;
    views: number;
    likes: number;
    released_at: string;
    brand: string;
    tags: { text: string }[];
    titles: { lang: string; title: string }[];
}

interface HanimeSearchResponse {
    hits: HanimeVideo[];
    nbHits: number;
    page: number;
    nbPages: number;
}

export class HanimeSource extends BaseAnimeSource implements GenreAwareSource {
    name = 'Hanime';
    baseUrl = 'https://hanime.tv';
    private apiUrl = 'https://search.htv-services.com';

    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = {
        search: 5 * 60 * 1000,
        anime: 15 * 60 * 1000,
        stream: 30 * 60 * 1000,
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
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml'
                }
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    private convertToAnimeBase(video: HanimeVideo): AnimeBase {
        const id = `hanime-${video.slug}`;
        return {
            id,
            title: video.name,
            image: video.poster_url || video.cover_url,
            cover: video.cover_url,
            description: video.description?.replace(/<[^>]*>/g, '') || 'Adult anime content',
            type: 'ONA',
            status: 'Completed',
            rating: video.likes ? Math.min(10, (video.likes / 1000)) : 0,
            episodes: 1,
            genres: video.tags?.map(t => t.text) || ['Hentai'],
            year: video.released_at ? new Date(video.released_at).getFullYear() : undefined
        };
    }

    async search(query: string, page: number = 1, filters?: Record<string, string>, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            logger.debug(`[Hanime] Searching for: ${query} (page ${page})`);

            const response = await axios.post<HanimeSearchResponse>(
                this.apiUrl,
                {
                    search_text: query,
                    tags: [],
                    tags_mode: 'AND',
                    brands: [],
                    blacklist: [],
                    order_by: 'likes',
                    ordering: 'desc',
                    page: page - 1
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: options?.timeout || 15000,
                    signal: options?.signal
                }
            );

            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                } catch {
                    hits = [];
                }
            }
            const results = Array.isArray(hits) ? hits.map(v => this.convertToAnimeBase(v)) : [];

            const result: AnimeSearchResult = {
                results,
                totalPages: response.data.nbPages || 1,
                currentPage: page,
                hasNextPage: page < (response.data.nbPages || 1),
                totalResults: response.data.nbHits || results.length,
                source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            logger.error(`[Hanime] Search failed:`, error);
            return {
                results: [],
                totalPages: 0,
                currentPage: page,
                hasNextPage: false,
                totalResults: 0,
                source: this.name
            };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.post<HanimeSearchResponse>(
                this.apiUrl,
                {
                    search_text: '',
                    tags: [],
                    tags_mode: 'AND',
                    brands: [],
                    blacklist: [],
                    order_by: 'views',
                    ordering: 'desc',
                    page: page - 1
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: options?.timeout || 15000,
                    signal: options?.signal
                }
            );

            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                } catch {
                    hits = [];
                }
            }
            const results = Array.isArray(hits) ? hits.map(v => this.convertToAnimeBase(v)) : [];
            this.setCache(cacheKey, results, this.cacheTTL.search);
            return results;
        } catch (error) {
            logger.error(`[Hanime] getTrending failed:`, error);
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const cacheKey = `latest:${page}`;
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.post<HanimeSearchResponse>(
                this.apiUrl,
                {
                    search_text: '',
                    tags: [],
                    tags_mode: 'AND',
                    brands: [],
                    blacklist: [],
                    order_by: 'released_at',
                    ordering: 'desc',
                    page: page - 1
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: options?.timeout || 15000,
                    signal: options?.signal
                }
            );

            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                } catch {
                    hits = [];
                }
            }
            const results = Array.isArray(hits) ? hits.map(v => this.convertToAnimeBase(v)) : [];
            this.setCache(cacheKey, results, this.cacheTTL.search);
            return results;
        } catch (error) {
            logger.error(`[Hanime] getLatest failed:`, error);
            return [];
        }
    }

    async getAnimeByGenre(genre: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `genre:${genre}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.post<HanimeSearchResponse>(
                this.apiUrl,
                {
                    search_text: '',
                    tags: [genre.toLowerCase()],
                    tags_mode: 'AND',
                    brands: [],
                    blacklist: [],
                    order_by: 'likes',
                    ordering: 'desc',
                    page: page - 1
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: options?.timeout || 15000,
                    signal: options?.signal
                }
            );

            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                } catch {
                    hits = [];
                }
            }
            const results = Array.isArray(hits) ? hits.map(v => this.convertToAnimeBase(v)) : [];

            const result: AnimeSearchResult = {
                results,
                totalPages: response.data.nbPages || 1,
                currentPage: page,
                hasNextPage: page < (response.data.nbPages || 1),
                totalResults: response.data.nbHits || results.length,
                source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            logger.error(`[Hanime] getAnimeByGenre failed:`, error);
            return {
                results: [],
                totalPages: 0,
                currentPage: page,
                hasNextPage: false,
                totalResults: 0,
                source: this.name
            };
        }
    }

    // GenreAwareSource interface methods
    async getByGenre(genre: string, page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        return this.getAnimeByGenre(genre, page, options);
    }

    async getGenres(options?: SourceRequestOptions): Promise<string[]> {
        // Common Hanime tags/genres
        return [
            '3d',
            'ahegao',
            'anal',
            'bdsm',
            'big boobs',
            'blow job',
            'bondage',
            'boob job',
            'censored',
            'comedy',
            'cosplay',
            'creampie',
            'dark skin',
            'elf',
            'facial',
            'fantasy',
            'femdom',
            'foot job',
            'futanari',
            'gangbang',
            'glasses',
            'hand job',
            'harem',
            'horror',
            'incest',
            'inflation',
            'lactation',
            'loli',
            'maid',
            'masturbation',
            'milf',
            'mind break',
            'mind control',
            'monster',
            'nekomimi',
            'ntr',
            'nurse',
            'orgy',
            'plot',
            'pov',
            'pregnant',
            'public sex',
            'rape',
            'reverse rape',
            'romance',
            'school girl',
            'shota',
            'softcore',
            'succubus',
            'swimsuit',
            'teacher',
            'tentacle',
            'threesome',
            'toys',
            'trap',
            'tsundere',
            'ugly bastard',
            'uncensored',
            'vanilla',
            'virgin',
            'x-ray',
            'yaoi',
            'yuri'
        ];
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        // Strip prefix if present
        const slug = id.replace(/^hanime-/, '');
        const cacheKey = `anime:${slug}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            // Search for the specific video by slug
            const response = await axios.post<HanimeSearchResponse>(
                this.apiUrl,
                {
                    search_text: slug.replace(/-/g, ' '),
                    tags: [],
                    tags_mode: 'AND',
                    brands: [],
                    blacklist: [],
                    order_by: 'likes',
                    ordering: 'desc',
                    page: 0
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: options?.timeout || 15000,
                    signal: options?.signal
                }
            );

            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                } catch {
                    hits = [];
                }
            }
            const hitsArray = Array.isArray(hits) ? hits : [];
            const video = hitsArray.find(v => v.slug === slug);
            if (!video) return null;

            const anime = this.convertToAnimeBase(video);
            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error) {
            logger.error(`[Hanime] getAnime failed:`, error);
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        // Hanime videos are typically single episodes
        const slug = animeId.replace(/^hanime-/, '');
        return [{
            id: `hanime-${slug}`,
            number: 1,
            title: 'Full Episode',
            isFiller: false
        }];
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<{ rank: number; anime: AnimeBase }[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, index) => ({
            rank: index + 1,
            anime
        }));
    }

    async getStreamingLinks(episodeId: string, server?: string, category?: string, options?: SourceRequestOptions): Promise<StreamingData> {
        const slug = episodeId.replace(/^hanime-/, '');
        const cacheKey = `stream:${slug}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            // Get video page to extract streaming URLs
            const pageUrl = `${this.baseUrl}/videos/hentai/${slug}`;
            const response = await axios.get(pageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                timeout: options?.timeout || 15000,
                signal: options?.signal
            });

            const sources: VideoSource[] = [];
            const html = response.data;

            // Extract video URLs from page data
            const videoDataMatch = html.match(/videos_manifest":\s*(\{[^}]+\})/);
            if (videoDataMatch) {
                try {
                    const videoData = JSON.parse(videoDataMatch[1]);
                    if (videoData.servers) {
                        for (const srv of videoData.servers) {
                            if (srv.streams) {
                                for (const stream of srv.streams) {
                                    sources.push({
                                        url: stream.url,
                                        quality: stream.height ? `${stream.height}p` : 'auto',
                                        isM3U8: stream.url?.includes('.m3u8')
                                    });
                                }
                            }
                        }
                    }
                } catch {
                    // JSON parse failed
                }
            }

            // Fallback: look for direct video URLs
            const urlMatches = html.matchAll(/https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*/gi);
            for (const match of urlMatches) {
                const url = match[0];
                if (!sources.some(s => s.url === url)) {
                    sources.push({
                        url,
                        quality: url.includes('1080') ? '1080p' : url.includes('720') ? '720p' : '480p',
                        isM3U8: url.includes('.m3u8')
                    });
                }
            }

            const result: StreamingData = {
                sources,
                subtitles: []
            };

            if (sources.length > 0) {
                this.setCache(cacheKey, result, this.cacheTTL.stream);
            }

            return result;
        } catch (error) {
            logger.error(`[Hanime] getStreamingLinks failed:`, error);
            return { sources: [], subtitles: [] };
        }
    }
}
