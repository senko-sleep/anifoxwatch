import axios from 'axios';
import { BaseAnimeSource } from './base-source.js';
/**
 * Consumet API Source - Aggregates multiple anime streaming providers
 * Supports: Gogoanime, Zoro/Aniwatch, 9anime patterns, and more
 *
 * This connects to a Consumet API instance for aggregated streaming
 * You can self-host Consumet or use a public instance
 */
export class ConsumetSource extends BaseAnimeSource {
    name = 'Consumet';
    baseUrl;
    client;
    provider;
    // In-memory cache for speed
    cache = new Map();
    cacheTTL = 5 * 60 * 1000; // 5 minutes
    constructor(apiUrl = process.env.CONSUMET_API_URL || 'https://api.consumet.org', provider = 'zoro') {
        super();
        this.baseUrl = apiUrl;
        this.provider = provider;
        this.client = axios.create({
            baseURL: `${apiUrl}/anime/${provider}`,
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AniStreamHub/1.0'
            }
        });
    }
    getCached(key) {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.data;
        }
        this.cache.delete(key);
        return null;
    }
    setCache(key, data, ttl = this.cacheTTL) {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }
    async healthCheck(options) {
        try {
            const response = await this.client.get('/recent-episodes', {
                params: { page: 1 },
                signal: options?.signal,
                timeout: options?.timeout || 5000
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        }
        catch {
            // Don't set isAvailable=false here - let the caller decide
            // This prevents recovery health checks from re-disabling the source
            return false;
        }
    }
    mapAnime(data) {
        return {
            id: `consumet-${this.provider}-${data.id}`,
            title: data.title?.english || data.title?.romaji || 'Unknown',
            titleJapanese: data.title?.native || data.title?.japanese,
            image: data.image || data.poster || '',
            cover: data.cover || data.image,
            description: data.description?.replace(/<[^>]*>/g, '') || 'No description available.',
            type: this.mapType(data.type || 'TV'),
            status: this.mapStatus(data.status || 'Unknown'),
            rating: data.rating ? data.rating / 10 : undefined,
            genres: data.genres || [],
            episodes: data.episodes || data.totalEpisodes || 0,
            studios: data.studios || [],
            season: data.season,
            year: data.releaseDate || data.year,
            subCount: data.subOrDub === 'sub' ? data.totalEpisodes : data.totalEpisodes,
            dubCount: data.subOrDub === 'dub' || data.hasDub ? data.totalEpisodes : 0,
            isMature: data.isAdult || false,
            source: `${this.name}:${this.provider}`
        };
    }
    mapType(type) {
        const typeMap = {
            'TV': 'TV', 'TV_SHORT': 'TV', 'MOVIE': 'Movie', 'OVA': 'OVA',
            'ONA': 'ONA', 'SPECIAL': 'Special', 'MUSIC': 'Special'
        };
        return typeMap[String(type)?.toUpperCase()] || 'TV';
    }
    mapStatus(status) {
        const statusMap = {
            'ongoing': 'Ongoing', 'releasing': 'Ongoing', 'not_yet_aired': 'Upcoming',
            'completed': 'Completed', 'finished': 'Completed', 'cancelled': 'Completed'
        };
        return statusMap[String(status)?.toLowerCase()] || 'Completed';
    }
    async search(query, page = 1, filters, options) {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.client.get(`/${encodeURIComponent(query)}`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const result = {
                results: (response.data.results || []).map((a) => this.mapAnime(a)),
                totalPages: response.data.totalPages || 1,
                currentPage: page,
                hasNextPage: response.data.hasNextPage || false,
                source: `${this.name}:${this.provider}`
            };
            this.setCache(cacheKey, result);
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
            const animeId = id.replace(`consumet-${this.provider}-`, '');
            const response = await this.client.get(`/info/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const anime = this.mapAnime(response.data);
            this.setCache(cacheKey, anime, 10 * 60 * 1000); // 10 min cache
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
            const id = animeId.replace(`consumet-${this.provider}-`, '');
            const response = await this.client.get(`/info/${id}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const episodes = (response.data.episodes || []).map((ep) => ({
                id: ep.id,
                number: ep.number || ep.episodeNumber || 1,
                title: ep.title || `Episode ${ep.number || ep.episodeNumber || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: ep.hasDub || response.data.hasDub || false,
                thumbnail: ep.image
            }));
            this.setCache(cacheKey, episodes, 10 * 60 * 1000);
            return episodes;
        }
        catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }
    /**
     * Get available streaming servers for an episode
     */
    /** Strip `consumet-` / `consumet-{provider}-` prefix from episode ids passed from SourceManager. */
    stripConsumetEpisodePrefix(id) {
        return id
            .replace(/^consumet-gogoanime-/i, '')
            .replace(/^consumet-zoro-/i, '')
            .replace(/^consumet-/i, '');
    }
    /** HiAnime / aniwatch watch URLs use `slug?ep=KEY` — the Consumet API expects the `zoro` routes, not `gogoanime`. */
    effectiveProviderForEpisodeId(strippedId) {
        if (this.provider === '9anime')
            return '9anime';
        if (this.provider === 'zoro')
            return 'zoro';
        return /^[^/?]+\?ep=\d+$/i.test(strippedId) ? 'zoro' : 'gogoanime';
    }
    consumetWatchBase(provider) {
        return `${this.baseUrl}/anime/${provider}`;
    }
    async getEpisodeServers(episodeId, options) {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const raw = this.stripConsumetEpisodePrefix(episodeId);
            const prv = this.effectiveProviderForEpisodeId(raw);
            const enc = encodeURIComponent(raw);
            const response = await axios.get(`${this.consumetWatchBase(prv)}/servers/${enc}`, {
                signal: options?.signal,
                timeout: options?.timeout || 5000,
                headers: this.client.defaults.headers,
            });
            const servers = (response.data || []).map((s) => ({
                name: s.name,
                url: s.url,
                type: s.type || 'sub'
            }));
            this.setCache(cacheKey, servers, 30 * 60 * 1000); // 30 min cache
            return servers;
        }
        catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [];
        }
    }
    /**
     * Get streaming URLs for an episode
     * Returns multiple quality options and subtitle tracks
     */
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        const cacheKey = `stream:${episodeId}:${server || 'default'}:${category}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const params = {};
            if (server)
                params.server = server;
            // Add category if server/provider supports it
            const raw = this.stripConsumetEpisodePrefix(episodeId);
            const prv = this.effectiveProviderForEpisodeId(raw);
            const enc = encodeURIComponent(raw);
            const response = await axios.get(`${this.consumetWatchBase(prv)}/watch/${enc}`, {
                params,
                signal: options?.signal,
                timeout: options?.timeout || 15000,
                headers: this.client.defaults.headers,
            });
            const streamData = {
                sources: (response.data.sources || []).map((s) => ({
                    url: s.url,
                    quality: s.quality || 'auto',
                    isM3U8: s.isM3U8 || s.url?.includes('.m3u8') || false,
                    isDASH: s.url?.includes('.mpd') || false
                })),
                subtitles: (response.data.subtitles || []).map((sub) => ({
                    url: sub.url,
                    lang: sub.lang,
                    label: sub.label
                })),
                headers: response.data.headers,
                intro: response.data.intro,
                outro: response.data.outro,
                download: response.data.download
            };
            this.setCache(cacheKey, streamData, 60 * 60 * 1000); // 1 hour cache
            return streamData;
        }
        catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }
    async getTrending(page = 1, options) {
        const cacheKey = `trending:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const response = await this.client.get('/top-airing', {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const results = (response.data.results || []).map((a) => this.mapAnime(a));
            this.setCache(cacheKey, results);
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
            const response = await this.client.get('/recent-episodes', {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const results = (response.data.results || []).map((a) => this.mapAnime(a));
            this.setCache(cacheKey, results);
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
            const response = await this.client.get('/top-airing', {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const results = (response.data.results || [])
                .slice(0, limit)
                .map((a, i) => ({
                rank: (page - 1) * limit + i + 1,
                anime: this.mapAnime(a)
            }));
            this.setCache(cacheKey, results);
            return results;
        }
        catch (error) {
            this.handleError(error, 'getTopRated');
            return [];
        }
    }
}
//# sourceMappingURL=consumet-source.js.map