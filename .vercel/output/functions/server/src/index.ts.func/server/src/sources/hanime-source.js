/**
 * Hanime Source - Additional adult anime content source
 * Uses hanime.tv API for hentai streaming
 */
import axios from '../utils/axios-edge.js';
import { BaseAnimeSource } from './base-source.js';
import { logger } from '../utils/logger.js';
export class HanimeSource extends BaseAnimeSource {
    name = 'Hanime';
    baseUrl = 'https://hanime.tv';
    apiUrl = 'https://search.htv-services.com';
    cache = new Map();
    cacheTTL = {
        search: 5 * 60 * 1000,
        anime: 15 * 60 * 1000,
        stream: 30 * 60 * 1000,
    };
    getCached(key) {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.data;
        }
        this.cache.delete(key);
        return null;
    }
    setCache(key, data, ttl) {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }
    heightToVideoQuality(height) {
        const n = typeof height === 'number' ? height : parseInt(String(height), 10);
        if (!Number.isFinite(n))
            return 'auto';
        if (n >= 1080)
            return '1080p';
        if (n >= 720)
            return '720p';
        if (n >= 480)
            return '480p';
        if (n >= 360)
            return '360p';
        return 'auto';
    }
    async healthCheck(options) {
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
        }
        catch {
            return false;
        }
    }
    convertToAnimeBase(video) {
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
    async search(query, page = 1, filters, options) {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            logger.debug(`[Hanime] Searching for: ${query} (page ${page})`);
            const response = await axios.post(this.apiUrl, {
                search_text: query,
                tags: [],
                tags_mode: 'AND',
                brands: [],
                blacklist: [],
                order_by: 'likes',
                ordering: 'desc',
                page: page - 1
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: options?.timeout || 15000,
                signal: options?.signal
            });
            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                }
                catch {
                    hits = [];
                }
            }
            const results = Array.isArray(hits) ? hits.map(v => this.convertToAnimeBase(v)) : [];
            const result = {
                results,
                totalPages: response.data.nbPages || 1,
                currentPage: page,
                hasNextPage: page < (response.data.nbPages || 1),
                totalResults: response.data.nbHits || results.length,
                source: this.name
            };
            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        }
        catch (error) {
            logger.error(`[Hanime] Search failed:`, error instanceof Error ? error : new Error(String(error)));
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
    async getTrending(page = 1, options) {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await axios.post(this.apiUrl, {
                search_text: '',
                tags: [],
                tags_mode: 'AND',
                brands: [],
                blacklist: [],
                order_by: 'views',
                ordering: 'desc',
                page: page - 1
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: options?.timeout || 15000,
                signal: options?.signal
            });
            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                }
                catch {
                    hits = [];
                }
            }
            const results = Array.isArray(hits) ? hits.map(v => this.convertToAnimeBase(v)) : [];
            this.setCache(cacheKey, results, this.cacheTTL.search);
            return results;
        }
        catch (error) {
            logger.error(`[Hanime] getTrending failed:`, error instanceof Error ? error : new Error(String(error)));
            return [];
        }
    }
    async getLatest(page = 1, options) {
        const cacheKey = `latest:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await axios.post(this.apiUrl, {
                search_text: '',
                tags: [],
                tags_mode: 'AND',
                brands: [],
                blacklist: [],
                order_by: 'released_at',
                ordering: 'desc',
                page: page - 1
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: options?.timeout || 15000,
                signal: options?.signal
            });
            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                }
                catch {
                    hits = [];
                }
            }
            const results = Array.isArray(hits) ? hits.map(v => this.convertToAnimeBase(v)) : [];
            this.setCache(cacheKey, results, this.cacheTTL.search);
            return results;
        }
        catch (error) {
            logger.error(`[Hanime] getLatest failed:`, error instanceof Error ? error : new Error(String(error)));
            return [];
        }
    }
    async getAnimeByGenre(genre, page = 1, options) {
        const cacheKey = `genre:${genre}:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await axios.post(this.apiUrl, {
                search_text: '',
                tags: [genre.toLowerCase()],
                tags_mode: 'AND',
                brands: [],
                blacklist: [],
                order_by: 'likes',
                ordering: 'desc',
                page: page - 1
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: options?.timeout || 15000,
                signal: options?.signal
            });
            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                }
                catch {
                    hits = [];
                }
            }
            const results = Array.isArray(hits) ? hits.map(v => this.convertToAnimeBase(v)) : [];
            const result = {
                results,
                totalPages: response.data.nbPages || 1,
                currentPage: page,
                hasNextPage: page < (response.data.nbPages || 1),
                totalResults: response.data.nbHits || results.length,
                source: this.name
            };
            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        }
        catch (error) {
            logger.error(`[Hanime] getAnimeByGenre failed:`, error instanceof Error ? error : new Error(String(error)));
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
    async getByGenre(genre, page = 1, options) {
        return this.getAnimeByGenre(genre, page, options);
    }
    async getGenres(options) {
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
    async getAnime(id, options) {
        // Strip prefix if present
        const slug = id.replace(/^hanime-/, '');
        const cacheKey = `anime:${slug}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            // Search for the specific video by slug
            const response = await axios.post(this.apiUrl, {
                search_text: slug.replace(/-/g, ' '),
                tags: [],
                tags_mode: 'AND',
                brands: [],
                blacklist: [],
                order_by: 'likes',
                ordering: 'desc',
                page: 0
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: options?.timeout || 15000,
                signal: options?.signal
            });
            // API returns hits as JSON string, need to parse it
            let hits = response.data.hits;
            if (typeof hits === 'string') {
                try {
                    hits = JSON.parse(hits);
                }
                catch {
                    hits = [];
                }
            }
            const hitsArray = Array.isArray(hits) ? hits : [];
            const video = hitsArray.find(v => v.slug === slug);
            if (!video)
                return null;
            const anime = this.convertToAnimeBase(video);
            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        }
        catch (error) {
            logger.error(`[Hanime] getAnime failed:`, error instanceof Error ? error : new Error(String(error)));
            return null;
        }
    }
    async getEpisodes(animeId, options) {
        // Hanime videos are typically single episodes
        const slug = animeId.replace(/^hanime-/, '');
        return [{
                id: `hanime-${slug}`,
                number: 1,
                title: 'Full Episode',
                isFiller: false,
                hasSub: true,
                hasDub: false
            }];
    }
    async getTopRated(page = 1, limit = 10, options) {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, index) => ({
            rank: index + 1,
            anime
        }));
    }
    async getStreamingLinks(episodeId, server, category, options) {
        const slug = episodeId.replace(/^hanime-/, '');
        const cacheKey = `stream:${slug}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
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
            const sources = [];
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
                                        quality: this.heightToVideoQuality(stream.height),
                                        isM3U8: stream.url?.includes('.m3u8')
                                    });
                                }
                            }
                        }
                    }
                }
                catch {
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
            const result = {
                sources,
                subtitles: []
            };
            if (sources.length > 0) {
                this.setCache(cacheKey, result, this.cacheTTL.stream);
            }
            return result;
        }
        catch (error) {
            logger.error(`[Hanime] getStreamingLinks failed:`, error instanceof Error ? error : new Error(String(error)));
            return { sources: [], subtitles: [] };
        }
    }
}
//# sourceMappingURL=hanime-source.js.map