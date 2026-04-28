import axios from 'axios';
import { BaseAnimeSource } from './base-source.js';
/**
 * Aniwave Source - Backup streaming provider
 * Features:
 * - High-quality HD streams (720p, 1080p)
 * - Both Sub and Dub support
 * - Multiple server fallbacks (Vidplay, MyCloud, Filemoon)
 * - Concurrency control to prevent rate limiting
 * - Smart caching for performance
 */
export class AniwaveSource extends BaseAnimeSource {
    name = 'Aniwave';
    baseUrl;
    client;
    // Concurrency control
    activeRequests = 0;
    maxConcurrent = 3;
    minDelay = 250;
    lastRequest = 0;
    requestQueue = [];
    // Smart caching with TTL
    cache = new Map();
    cacheTTL = {
        search: 3 * 60 * 1000,
        anime: 15 * 60 * 1000,
        episodes: 10 * 60 * 1000,
        stream: 2 * 60 * 60 * 1000,
        servers: 60 * 60 * 1000,
    };
    constructor(apiUrl = process.env.ANIME_API_URL || 'https://api.consumet.org') {
        super();
        // Aniwave uses similar API patterns to other providers
        this.baseUrl = `${apiUrl}/anime/animepahe`;
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 12000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AniStreamHub/1.0 (Premium)',
                'Accept-Encoding': 'gzip, deflate'
            }
        });
        // Note: Cache cleanup is done on-demand in getCached/setCache
        // setInterval is not allowed in Cloudflare Workers global scope
    }
    // ============ CONCURRENCY CONTROL ============
    async throttledRequest(fn, signal) {
        if (signal?.aborted)
            throw new Error('Aborted');
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ fn, resolve, reject, signal });
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.activeRequests >= this.maxConcurrent || this.requestQueue.length === 0) {
            return;
        }
        const now = Date.now();
        const timeSinceLast = now - this.lastRequest;
        if (timeSinceLast < this.minDelay) {
            setTimeout(() => this.processQueue(), this.minDelay - timeSinceLast);
            return;
        }
        const request = this.requestQueue.shift();
        if (!request)
            return;
        if (request.signal?.aborted) {
            request.reject(new Error('Aborted'));
            this.processQueue();
            return;
        }
        this.activeRequests++;
        this.lastRequest = Date.now();
        try {
            const result = await request.fn(request.signal);
            request.resolve(result);
        }
        catch (error) {
            request.reject(error);
        }
        finally {
            this.activeRequests--;
            this.processQueue();
        }
    }
    // ============ CACHING ============
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
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (value.expires < now)
                this.cache.delete(key);
        }
    }
    // ============ DATA MAPPING ============
    mapAnime(data) {
        const episodes = data.totalEpisodes || data.episodes?.length || 0;
        return {
            id: `aniwave-${data.id}`,
            title: data.title?.english || data.title?.romaji || data.title || data.name || 'Unknown',
            titleJapanese: data.title?.native || data.japaneseTitle,
            image: data.image || data.poster || '',
            cover: data.cover || data.image,
            banner: data.banner || data.cover || data.image,
            description: this.cleanDescription(data.description || data.synopsis),
            type: this.mapType(data.type),
            status: this.mapStatus(data.status),
            rating: data.rating ? parseFloat(String(data.rating)) / 10 : (data.score || undefined),
            episodes,
            episodesAired: data.currentEpisodes || episodes,
            duration: data.duration ? `${data.duration}m` : '24m',
            genres: data.genres || [],
            studios: data.studios || [],
            season: data.season,
            year: data.releaseDate || data.year,
            subCount: episodes,
            dubCount: data.hasDub ? episodes : 0,
            isMature: data.isAdult || false,
            source: this.name
        };
    }
    cleanDescription(desc) {
        if (!desc)
            return 'No description available.';
        return desc.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
    mapType(type) {
        const t = (type || '').toUpperCase();
        if (t.includes('MOVIE'))
            return 'Movie';
        if (t.includes('OVA'))
            return 'OVA';
        if (t.includes('ONA'))
            return 'ONA';
        if (t.includes('SPECIAL'))
            return 'Special';
        return 'TV';
    }
    mapStatus(status) {
        const s = (status || '').toLowerCase();
        if (s.includes('ongoing') || s.includes('airing') || s.includes('releasing'))
            return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not_yet'))
            return 'Upcoming';
        return 'Completed';
    }
    // ============ API METHODS ============
    async healthCheck(options) {
        try {
            const response = await this.throttledRequest((signal) => this.client.get('/recent-episodes', {
                params: { page: 1 },
                timeout: options?.timeout || 5000,
                signal
            }), options?.signal);
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        }
        catch {
            return false;
        }
    }
    async search(query, page = 1, filters, options) {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.throttledRequest((signal) => this.client.get(`/${encodeURIComponent(query)}`, {
                params: { page },
                signal,
                timeout: options?.timeout || 10000
            }), options?.signal);
            const result = {
                results: (response.data.results || []).map((a) => this.mapAnime(a)),
                totalPages: response.data.totalPages || 1,
                currentPage: page,
                hasNextPage: response.data.hasNextPage || false,
                source: this.name
            };
            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        }
        catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
    async getAnime(id, options) {
        const cacheKey = `anime:${id}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const animeId = id.replace('aniwave-', '');
            const response = await this.throttledRequest((signal) => this.client.get(`/info/${animeId}`, {
                signal,
                timeout: options?.timeout || 10000
            }), options?.signal);
            const anime = this.mapAnime(response.data);
            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        }
        catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }
    async getEpisodes(animeId, options) {
        const cacheKey = `episodes:${animeId}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const id = animeId.replace('aniwave-', '');
            const response = await this.throttledRequest((signal) => this.client.get(`/info/${id}`, {
                signal,
                timeout: options?.timeout || 10000
            }), options?.signal);
            const episodes = (response.data.episodes || []).map((ep) => ({
                id: ep.id,
                number: ep.number || 1,
                title: ep.title || `Episode ${ep.number || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: ep.hasDub || response.data.hasDub || false,
                thumbnail: ep.image
            }));
            this.setCache(cacheKey, episodes, this.cacheTTL.episodes);
            return episodes;
        }
        catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }
    /**
     * Get streaming servers with quality info
     */
    async getEpisodeServers(episodeId, options) {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.throttledRequest((signal) => this.client.get(`/servers/${episodeId}`, {
                signal,
                timeout: options?.timeout || 5000
            }), options?.signal);
            const servers = (response.data || []).map((s) => ({
                name: s.name,
                url: s.url || '',
                type: (s.type || 'sub')
            }));
            this.setCache(cacheKey, servers, this.cacheTTL.servers);
            return servers;
        }
        catch {
            // Return default servers on error
            return [
                { name: 'vidplay', url: '', type: 'sub' },
                { name: 'mycloud', url: '', type: 'sub' },
                { name: 'filemoon', url: '', type: 'sub' }
            ];
        }
    }
    /**
     * Get HD streaming links with multiple quality options
     */
    async getStreamingLinks(episodeId, server = 'vidplay', category = 'sub', options) {
        const cacheKey = `stream:${episodeId}:${server}:${category}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.throttledRequest((signal) => this.client.get(`/watch/${episodeId}`, {
                params: { server, category },
                timeout: options?.timeout || 8000,
                signal
            }), options?.signal);
            if (!response.data) {
                return { sources: [], subtitles: [] };
            }
            // Map to HD quality options
            const sources = (response.data.sources || []).map((s) => ({
                url: s.url,
                quality: this.normalizeQuality(s.quality),
                isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                isDASH: s.url?.includes('.mpd')
            }));
            // Sort by quality (highest first)
            sources.sort((a, b) => {
                const order = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                return (order[a.quality] || 5) - (order[b.quality] || 5);
            });
            const streamData = {
                sources,
                subtitles: (response.data.subtitles || []).map((sub) => ({
                    url: sub.url,
                    lang: sub.lang,
                    label: sub.label || sub.lang
                })),
                headers: response.data.headers,
                intro: response.data.intro,
                outro: response.data.outro
            };
            this.setCache(cacheKey, streamData, this.cacheTTL.stream);
            return streamData;
        }
        catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }
    normalizeQuality(quality) {
        if (!quality)
            return 'auto';
        const q = quality.toLowerCase();
        if (q.includes('1080') || q.includes('fhd') || q.includes('full'))
            return '1080p';
        if (q.includes('720') || q.includes('hd'))
            return '720p';
        if (q.includes('480') || q.includes('sd'))
            return '480p';
        if (q.includes('360'))
            return '360p';
        return 'auto';
    }
    async getTrending(page = 1, options) {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.throttledRequest((signal) => this.client.get('/airing', {
                params: { page },
                signal,
                timeout: options?.timeout || 10000
            }), options?.signal);
            const results = (response.data.results || []).map((a) => this.mapAnime(a));
            this.setCache(cacheKey, results, 10 * 60 * 1000);
            return results;
        }
        catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }
    async getLatest(page = 1, options) {
        const cacheKey = `latest:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.throttledRequest((signal) => this.client.get('/recent-episodes', {
                params: { page },
                signal,
                timeout: options?.timeout || 10000
            }), options?.signal);
            const results = (response.data.results || []).map((a) => this.mapAnime(a));
            this.setCache(cacheKey, results, 3 * 60 * 1000);
            return results;
        }
        catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }
    async getTopRated(page = 1, limit = 10, options) {
        const cacheKey = `topRated:${page}:${limit}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.throttledRequest((signal) => this.client.get('/airing', {
                params: { page },
                signal,
                timeout: options?.timeout || 15000
            }), options?.signal);
            const results = (response.data.results || [])
                .slice(0, limit)
                .map((a, i) => ({
                rank: (page - 1) * limit + i + 1,
                anime: this.mapAnime(a)
            }));
            this.setCache(cacheKey, results, 15 * 60 * 1000);
            return results;
        }
        catch (error) {
            this.handleError(error, 'getTopRated');
            return [];
        }
    }
}
//# sourceMappingURL=aniwave-source.js.map