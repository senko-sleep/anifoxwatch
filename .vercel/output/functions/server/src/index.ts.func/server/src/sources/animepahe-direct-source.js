/**
 * AnimePahe Direct Source - Uses @consumet/extensions for actual working streams
 * AnimePahe consistently provides multiple quality m3u8 sources
 */
import { BaseAnimeSource } from './base-source.js';
import { logger } from '../utils/logger.js';
let ANIME = null;
async function getConsumet() {
    if (!ANIME) {
        const mod = await import('@consumet/extensions');
        ANIME = mod.ANIME;
    }
    return ANIME;
}
export class AnimePaheDirectSource extends BaseAnimeSource {
    name = 'AnimePahe';
    baseUrl = 'https://animepahe.ru';
    provider = null;
    cache = new Map();
    async getProvider() {
        if (!this.provider) {
            const anime = await getConsumet();
            this.provider = new anime.AnimePahe();
        }
        return this.provider;
    }
    getCached(key) {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now())
            return entry.data;
        this.cache.delete(key);
        return null;
    }
    setCache(key, data, ttl) {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }
    async healthCheck(options) {
        try {
            const p = await this.getProvider();
            const res = await Promise.race([
                p.search('naruto'),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
            ]);
            this.isAvailable = (res.results?.length || 0) > 0;
            return this.isAvailable;
        }
        catch {
            this.isAvailable = true;
            return true;
        }
    }
    mapAnime(data) {
        return {
            id: `animepahe-${data.id}`,
            title: data.title || 'Unknown',
            titleJapanese: data.japaneseTitle,
            image: data.image || '',
            cover: data.cover || data.image,
            description: data.description?.replace(/<[^>]*>/g, '') || 'No description available.',
            type: this.mapType(data.type || data.subOrDub),
            status: this.mapStatus(data.status),
            rating: data.rating ? parseFloat(data.rating) / 10 : undefined,
            episodes: data.totalEpisodes || 0,
            episodesAired: data.totalEpisodes || 0,
            genres: data.genres || [],
            studios: [],
            year: data.releaseDate ? parseInt(data.releaseDate) : undefined,
            subCount: data.totalEpisodes || 0,
            dubCount: data.hasDub ? data.totalEpisodes : 0,
            isMature: false,
            source: this.name
        };
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
        if (s.includes('ongoing') || s.includes('airing'))
            return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not yet'))
            return 'Upcoming';
        return 'Completed';
    }
    async search(query, page = 1, _filters, options) {
        const cacheKey = `pahe:search:${query}:${page}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const p = await this.getProvider();
            const res = await Promise.race([
                p.search(query, page),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);
            const result = {
                results: (res.results || []).map((a) => this.mapAnime(a)),
                totalPages: res.totalPages || 1,
                currentPage: res.currentPage || page,
                hasNextPage: res.hasNextPage || false,
                source: this.name
            };
            this.setCache(cacheKey, result, 3 * 60 * 1000);
            return result;
        }
        catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
    async getAnime(id, options) {
        const cacheKey = `pahe:anime:${id}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const rawId = id.replace('animepahe-', '');
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);
            const anime = this.mapAnime(info);
            this.setCache(cacheKey, anime, 15 * 60 * 1000);
            return anime;
        }
        catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }
    async getEpisodes(animeId, options) {
        const cacheKey = `pahe:eps:${animeId}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const rawId = animeId.replace('animepahe-', '');
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);
            const episodes = (info.episodes || []).map((ep) => ({
                id: ep.id,
                number: ep.number || 1,
                title: ep.title || `Episode ${ep.number || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: ep.hasDub || false,
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
    async getEpisodeServers(episodeId, options) {
        return [
            { name: 'default', url: '', type: 'sub' },
            { name: 'default', url: '', type: 'dub' },
        ];
    }
    isEngDub(qualityName) {
        const q = (qualityName || '').toLowerCase();
        return q.includes(' eng') || q.includes('english') || q.endsWith('eng');
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        const cacheKey = `pahe:stream:${episodeId}:${category}`;
        const cached = this.getCached(cacheKey);
        if (cached)
            return cached;
        try {
            const p = await this.getProvider();
            logger.info(`Fetching ${category} stream from AnimePahe for ${episodeId}`, undefined, this.name);
            const data = await Promise.race([
                p.fetchEpisodeSources(episodeId),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 20000))
            ]);
            if (!data.sources?.length) {
                return { sources: [], subtitles: [] };
            }
            // AnimePahe returns both sub and dub in one response
            // Dub sources have "eng" in their quality name (e.g. "720p BD eng")
            const allSources = data.sources;
            const wantDub = category === 'dub';
            let filtered = allSources.filter(s => this.isEngDub(s.quality || '') === wantDub);
            // If no dub sources found, fall back to all sources
            if (filtered.length === 0) {
                filtered = allSources;
                logger.info(`AnimePahe: no ${category}-specific sources, using all ${allSources.length}`, undefined, this.name);
            }
            const sources = filtered.map((s) => ({
                url: s.url,
                quality: this.normalizeQuality(s.quality),
                isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                isDASH: s.url?.includes('.mpd')
            }));
            sources.sort((a, b) => {
                const order = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                return (order[a.quality] || 5) - (order[b.quality] || 5);
            });
            const streamData = {
                sources,
                subtitles: (data.subtitles || []).map((sub) => ({
                    url: sub.url,
                    lang: sub.lang || 'Unknown',
                    label: sub.label || sub.lang
                })),
                headers: data.headers,
                source: this.name
            };
            logger.info(`AnimePahe: ${sources.length} ${category} sources for ${episodeId} (from ${allSources.length} total)`, undefined, this.name);
            this.setCache(cacheKey, streamData, 2 * 60 * 60 * 1000);
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
        if (q.includes('1080'))
            return '1080p';
        if (q.includes('720'))
            return '720p';
        if (q.includes('480'))
            return '480p';
        if (q.includes('360'))
            return '360p';
        return 'auto';
    }
    async getTrending(page = 1, options) {
        try {
            const result = await this.search('', page, undefined, options);
            return result.results;
        }
        catch {
            return [];
        }
    }
    async getLatest(page = 1, options) {
        return this.getTrending(page, options);
    }
    async getTopRated(page = 1, limit = 10, options) {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, i) => ({
            rank: (page - 1) * limit + i + 1,
            anime
        }));
    }
}
//# sourceMappingURL=animepahe-direct-source.js.map