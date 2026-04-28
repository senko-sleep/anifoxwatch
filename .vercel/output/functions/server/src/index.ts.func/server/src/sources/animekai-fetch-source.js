/**
 * AnimeKai Fetch Source - Cloudflare Workers compatible
 * Directly queries AnimeKai's API endpoints using native fetch.
 * No axios, no @consumet/extensions.
 */
import { BaseAnimeSource } from './base-source.js';
import { logger } from '../utils/logger.js';
export class AnimeKaiFetchSource extends BaseAnimeSource {
    name = 'AnimeKaiFetch';
    baseUrl = 'https://animekai.to';
    apiBase = 'https://api.animekai.to';
    cache = new Map();
    getCached(key) {
        const e = this.cache.get(key);
        if (e && e.expires > Date.now())
            return e.data;
        this.cache.delete(key);
        return null;
    }
    setCache(key, data, ttl) {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }
    async fetchJson(path, options) {
        const url = path.startsWith('http') ? path : `${this.apiBase}${path}`;
        const ctl = new AbortController();
        const ms = Math.min(options?.timeout ?? 10_000, 15_000);
        const tid = setTimeout(() => ctl.abort(), ms);
        try {
            if (options?.signal?.aborted)
                throw new Error('Aborted');
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://animekai.to/',
                    'Origin': 'https://animekai.to',
                },
                signal: ctl.signal,
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            return await res.json();
        }
        finally {
            clearTimeout(tid);
        }
    }
    async healthCheck(options) {
        try {
            const data = await this.fetchJson('/search?keyword=naruto', { ...options, timeout: 5000 });
            return Array.isArray(data?.results) || data?.success === true;
        }
        catch {
            return false;
        }
    }
    mapAnime(data) {
        return {
            id: `animekai-${data.id || data.slug}`,
            title: data.title || data.name || 'Unknown',
            image: data.image || data.poster || data.thumbnail || '',
            description: (data.description || data.synopsis || '').replace(/<[^>]*>/g, '') || 'No description.',
            type: this.mapType(data.type),
            status: this.mapStatus(data.status),
            genres: data.genres || [],
            episodes: data.totalEpisodes || data.episodes || 0,
            rating: data.rating ? parseFloat(data.rating) / 10 : undefined,
            year: data.releaseDate ? parseInt(data.releaseDate) : data.year,
            source: this.name,
        };
    }
    mapType(type) {
        const t = (type || '').toUpperCase();
        if (t === 'TV')
            return 'TV';
        if (t === 'MOVIE')
            return 'Movie';
        if (t === 'OVA')
            return 'OVA';
        if (t === 'ONA')
            return 'ONA';
        return 'TV';
    }
    mapStatus(status) {
        const s = (status || '').toLowerCase();
        if (s.includes('airing') || s.includes('ongoing'))
            return 'Ongoing';
        if (s.includes('completed') || s.includes('finished'))
            return 'Completed';
        if (s.includes('upcoming'))
            return 'Upcoming';
        return 'Completed';
    }
    async search(query, page = 1, _filters, options) {
        const key = `search:${query}:${page}`;
        const hit = this.getCached(key);
        if (hit)
            return hit;
        try {
            const data = await this.fetchJson(`/search?keyword=${encodeURIComponent(query)}&page=${page}`, options);
            const result = {
                results: (data.results || []).map(a => this.mapAnime(a)),
                totalPages: data.totalPages || 1,
                currentPage: page,
                hasNextPage: data.hasNextPage || false,
                source: this.name,
            };
            this.setCache(key, result, 5 * 60 * 1000);
            return result;
        }
        catch (e) {
            logger.warn('AnimeKaiFetch search failed', { err: String(e) }, this.name);
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
    async getAnime(id, options) {
        const slug = id.replace(/^animekai-/, '');
        try {
            const data = await this.fetchJson(`/anime/${encodeURIComponent(slug)}`, options);
            return this.mapAnime(data);
        }
        catch (e) {
            logger.warn('AnimeKaiFetch getAnime failed', { id, err: String(e) }, this.name);
            return null;
        }
    }
    async getEpisodes(animeId, options) {
        const slug = animeId.replace(/^animekai-/, '');
        const key = `ep:${slug}`;
        const hit = this.getCached(key);
        if (hit)
            return hit;
        try {
            const data = await this.fetchJson(`/anime/${encodeURIComponent(slug)}/episodes`, options);
            const rawEps = Array.isArray(data) ? data : data.episodes || [];
            const eps = rawEps.map((ep) => ({
                id: `animekai-${ep.id || `${slug}$ep=${ep.number}`}`,
                number: ep.number || ep.episodeNumber || 1,
                title: ep.title || `Episode ${ep.number || ep.episodeNumber || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: ep.hasDub || false,
                thumbnail: ep.thumbnail || ep.image,
            }));
            this.setCache(key, eps, 10 * 60 * 1000);
            return eps;
        }
        catch (e) {
            logger.warn('AnimeKaiFetch getEpisodes failed', { animeId, err: String(e) }, this.name);
            return [];
        }
    }
    async getEpisodeServers(episodeId, options) {
        return [{ name: 'default', url: '', type: 'sub' }];
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        const key = `stream:${episodeId}:${category}`;
        const hit = this.getCached(key);
        if (hit)
            return hit;
        try {
            // Strip prefix to get raw AnimeKai ID: e.g. "spy-x-family-season-3-v2q8$ep=1$token=..."
            const rawId = episodeId.replace(/^animekai-/, '');
            // AnimeKai API endpoint for streaming sources
            const data = await this.fetchJson(`/episode/sources?id=${encodeURIComponent(rawId)}&type=${category}`, options);
            if (!data.sources?.length) {
                return { sources: [], subtitles: [] };
            }
            const streamData = {
                sources: data.sources.map((s) => ({
                    url: s.url,
                    quality: (s.quality?.includes('1080') ? '1080p' : s.quality?.includes('720') ? '720p' : 'auto'),
                    isM3U8: s.isM3U8 || s.url?.includes('.m3u8') || false,
                    isDASH: s.url?.includes('.mpd') || false,
                })),
                subtitles: (data.subtitles || []).map(sub => ({
                    url: sub.url,
                    lang: sub.lang,
                    label: sub.label,
                })),
                source: this.name,
            };
            this.setCache(key, streamData, 30 * 60 * 1000);
            return streamData;
        }
        catch (e) {
            logger.warn('AnimeKaiFetch getStreamingLinks failed', { episodeId, err: String(e) }, this.name);
            return { sources: [], subtitles: [] };
        }
    }
    async getTrending(page = 1, options) {
        try {
            const r = await this.search('', page, undefined, options);
            return r.results;
        }
        catch {
            return [];
        }
    }
    async getLatest(page = 1, options) {
        return this.getTrending(page, options);
    }
    async getTopRated(page = 1, limit = 10, options) {
        const t = await this.getTrending(page, options);
        return t.slice(0, limit).map((anime, i) => ({ rank: (page - 1) * limit + i + 1, anime }));
    }
}
//# sourceMappingURL=animekai-fetch-source.js.map