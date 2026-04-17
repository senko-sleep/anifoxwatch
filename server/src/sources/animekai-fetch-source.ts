/**
 * AnimeKai Fetch Source - Cloudflare Workers compatible
 * Directly queries AnimeKai's API endpoints using native fetch.
 * No axios, no @consumet/extensions.
 */
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

export class AnimeKaiFetchSource extends BaseAnimeSource {
    name = 'AnimeKaiFetch';
    baseUrl = 'https://animekai.to';
    private apiBase = 'https://api.animekai.to';
    private cache: Map<string, { data: unknown; expires: number }> = new Map();

    private getCached<T>(key: string): T | null {
        const e = this.cache.get(key);
        if (e && e.expires > Date.now()) return e.data as T;
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: unknown, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    private async fetchJson<T>(path: string, options?: SourceRequestOptions): Promise<T> {
        const url = path.startsWith('http') ? path : `${this.apiBase}${path}`;
        const ctl = new AbortController();
        const ms = Math.min(options?.timeout ?? 10_000, 15_000);
        const tid = setTimeout(() => ctl.abort(), ms);
        try {
            if (options?.signal?.aborted) throw new Error('Aborted');
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://animekai.to/',
                    'Origin': 'https://animekai.to',
                },
                signal: ctl.signal,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json() as T;
        } finally {
            clearTimeout(tid);
        }
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const data = await this.fetchJson<{ results?: unknown[] }>('/search?keyword=naruto', { ...options, timeout: 5000 });
            return Array.isArray((data as any)?.results) || (data as any)?.success === true;
        } catch {
            return false;
        }
    }

    private mapAnime(data: any): AnimeBase {
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

    private mapType(type?: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = (type || '').toUpperCase();
        if (t === 'TV') return 'TV';
        if (t === 'MOVIE') return 'Movie';
        if (t === 'OVA') return 'OVA';
        if (t === 'ONA') return 'ONA';
        return 'TV';
    }

    private mapStatus(status?: string): 'Ongoing' | 'Completed' | 'Upcoming' {
        const s = (status || '').toLowerCase();
        if (s.includes('airing') || s.includes('ongoing')) return 'Ongoing';
        if (s.includes('completed') || s.includes('finished')) return 'Completed';
        if (s.includes('upcoming')) return 'Upcoming';
        return 'Completed';
    }

    async search(query: string, page: number = 1, _filters?: unknown, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const key = `search:${query}:${page}`;
        const hit = this.getCached<AnimeSearchResult>(key);
        if (hit) return hit;
        try {
            const data = await this.fetchJson<{ results?: any[]; totalPages?: number; hasNextPage?: boolean }>(
                `/search?keyword=${encodeURIComponent(query)}&page=${page}`,
                options
            );
            const result: AnimeSearchResult = {
                results: (data.results || []).map(a => this.mapAnime(a)),
                totalPages: data.totalPages || 1,
                currentPage: page,
                hasNextPage: data.hasNextPage || false,
                source: this.name,
            };
            this.setCache(key, result, 5 * 60 * 1000);
            return result;
        } catch (e) {
            logger.warn('AnimeKaiFetch search failed', { err: String(e) }, this.name);
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const slug = id.replace(/^animekai-/, '');
        try {
            const data = await this.fetchJson<any>(`/anime/${encodeURIComponent(slug)}`, options);
            return this.mapAnime(data);
        } catch (e) {
            logger.warn('AnimeKaiFetch getAnime failed', { id, err: String(e) }, this.name);
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const slug = animeId.replace(/^animekai-/, '');
        const key = `ep:${slug}`;
        const hit = this.getCached<Episode[]>(key);
        if (hit) return hit;
        try {
            const data = await this.fetchJson<{ episodes?: any[] } | any[]>(`/anime/${encodeURIComponent(slug)}/episodes`, options);
            const rawEps = Array.isArray(data) ? data : (data as any).episodes || [];
            const eps: Episode[] = rawEps.map((ep: any) => ({
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
        } catch (e) {
            logger.warn('AnimeKaiFetch getEpisodes failed', { animeId, err: String(e) }, this.name);
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [{ name: 'default', url: '', type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const key = `stream:${episodeId}:${category}`;
        const hit = this.getCached<StreamingData>(key);
        if (hit) return hit;

        try {
            // Strip prefix to get raw AnimeKai ID: e.g. "spy-x-family-season-3-v2q8$ep=1$token=..."
            const rawId = episodeId.replace(/^animekai-/, '');

            // AnimeKai API endpoint for streaming sources
            const data = await this.fetchJson<{ sources?: Array<{ url: string; quality?: string; isM3U8?: boolean }>; subtitles?: Array<{ url: string; lang: string; label?: string }> }>(
                `/episode/sources?id=${encodeURIComponent(rawId)}&type=${category}`,
                options
            );

            if (!data.sources?.length) {
                return { sources: [], subtitles: [] };
            }

            const streamData: StreamingData = {
                sources: data.sources.map((s): VideoSource => ({
                    url: s.url,
                    quality: (s.quality?.includes('1080') ? '1080p' : s.quality?.includes('720') ? '720p' : 'auto') as VideoSource['quality'],
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
        } catch (e) {
            logger.warn('AnimeKaiFetch getStreamingLinks failed', { episodeId, err: String(e) }, this.name);
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const r = await this.search('', page, undefined, options);
            return r.results;
        } catch { return []; }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return this.getTrending(page, options);
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const t = await this.getTrending(page, options);
        return t.slice(0, limit).map((anime, i) => ({ rank: (page - 1) * limit + i + 1, anime }));
    }
}
