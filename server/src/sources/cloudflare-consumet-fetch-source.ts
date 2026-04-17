/**
 * Consumet API via native fetch — for Cloudflare Workers (no axios).
 */
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

interface ConsumetAnimeResponse {
    id: string | number;
    title?: { english?: string; romaji?: string; native?: string; japanese?: string };
    image?: string;
    poster?: string;
    cover?: string;
    description?: string;
    type?: string;
    status?: string;
    rating?: number;
    genres?: string[];
    episodes?: number;
    totalEpisodes?: number;
    releaseDate?: number;
    year?: number;
    season?: string;
    studios?: string[];
    subOrDub?: 'sub' | 'dub';
    hasDub?: boolean;
    isAdult?: boolean;
}

interface ConsumetEpisodeResponse {
    id: string;
    number?: number;
    episodeNumber?: number;
    title?: string;
    isFiller?: boolean;
    image?: string;
    hasDub?: boolean;
}

export class CloudflareConsumetFetchSource extends BaseAnimeSource {
    name = 'CloudflareConsumet';
    baseUrl: string;
    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = 5 * 60 * 1000;

    constructor(apiUrl: string = process.env.CONSUMET_API_URL || 'https://api.consumet.org') {
        super();
        this.baseUrl = apiUrl.replace(/\/$/, '');
    }

    private apiPath(provider: string, suffix: string): string {
        return `${this.baseUrl}/anime/${provider}${suffix}`;
    }

    private getCached<T>(key: string): T | null {
        const e = this.cache.get(key);
        if (e && e.expires > Date.now()) return e.data as T;
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: unknown, ttl: number = this.cacheTTL): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    private async fetchJson<T>(provider: string, path: string, query?: Record<string, string>, options?: SourceRequestOptions): Promise<T> {
        const u = new URL(this.apiPath(provider, path));
        if (query) {
            for (const [k, v] of Object.entries(query)) {
                if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
            }
        }
        const ctl = new AbortController();
        const ms = Math.min(options?.timeout ?? 8000, 10000);
        const tid = setTimeout(() => ctl.abort(), ms);
        try {
            if (options?.signal) {
                if (options.signal.aborted) throw new Error('Aborted');
                options.signal.addEventListener('abort', () => ctl.abort(), { once: true });
            }
            const res = await fetch(u.toString(), {
                headers: { Accept: 'application/json', 'User-Agent': 'AniStreamHub/1.0' },
                signal: ctl.signal,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as T;
        } finally {
            clearTimeout(tid);
        }
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            await this.fetchJson<{ results?: unknown[] }>('gogoanime', '/recent-episodes', { page: '1' }, { ...options, timeout: 5000 });
            this.isAvailable = true;
            return true;
        } catch {
            return false;
        }
    }

    private mapAnime(data: ConsumetAnimeResponse, provider: string): AnimeBase {
        return {
            id: `consumet-${provider}-${data.id}`,
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
            subCount: data.totalEpisodes,
            dubCount: data.subOrDub === 'dub' || data.hasDub ? data.totalEpisodes : 0,
            isMature: data.isAdult || false,
            source: `${this.name}:${provider}`,
        };
    }

    private mapType(type: unknown): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const typeMap: Record<string, 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special'> = {
            TV: 'TV',
            TV_SHORT: 'TV',
            MOVIE: 'Movie',
            OVA: 'OVA',
            ONA: 'ONA',
            SPECIAL: 'Special',
            MUSIC: 'Special',
        };
        return typeMap[String(type)?.toUpperCase()] || 'TV';
    }

    private mapStatus(status: unknown): 'Ongoing' | 'Completed' | 'Upcoming' {
        const m: Record<string, 'Ongoing' | 'Completed' | 'Upcoming'> = {
            ongoing: 'Ongoing',
            releasing: 'Ongoing',
            not_yet_aired: 'Upcoming',
            completed: 'Completed',
            finished: 'Completed',
            cancelled: 'Completed',
        };
        return m[String(status)?.toLowerCase()] || 'Completed';
    }

    async search(query: string, page: number = 1, _filters?: unknown, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const provider = 'gogoanime'; // Default search uses gogoanime
        const key = `search:${query}:${page}`;
        const hit = this.getCached<AnimeSearchResult>(key);
        if (hit) return hit;
        try {
            const data = await this.fetchJson<{
                results?: ConsumetAnimeResponse[];
                totalPages?: number;
                hasNextPage?: boolean;
            }>(provider, `/${encodeURIComponent(query)}`, { page: String(page) }, options);
            const result: AnimeSearchResult = {
                results: (data.results || []).map((a) => this.mapAnime(a, provider)),
                totalPages: data.totalPages || 1,
                currentPage: page,
                hasNextPage: data.hasNextPage || false,
                source: `${this.name}:${provider}`,
            };
            this.setCache(key, result);
            return result;
        } catch (e) {
            logger.warn(`Consumet search failed`, { err: String(e) }, this.name);
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const provider = id.includes('-zoro-') ? 'zoro' : 'gogoanime';
        const key = `anime:${id}`;
        const hit = this.getCached<AnimeBase>(key);
        if (hit) return hit;
        try {
            const raw = id.replace(`consumet-${provider}-`, '');
            const data = await this.fetchJson<ConsumetAnimeResponse>(provider, `/info/${encodeURIComponent(raw)}`, undefined, options);
            const anime = this.mapAnime(data, provider);
            this.setCache(key, anime, 10 * 60 * 1000);
            return anime;
        } catch (e) {
            logger.warn(`Consumet getAnime failed`, { id, err: String(e) }, this.name);
            return null;
        }
    }

    private stripConsumetEpisodePrefix(id: string): string {
        return id
            .replace(/^consumet-gogoanime-/i, '')
            .replace(/^consumet-zoro-/i, '')
            .replace(/^consumet-/i, '');
    }

    private effectiveProviderForEpisodeId(strippedId: string): 'gogoanime' | 'zoro' {
        return (/[?&]ep=/i.test(strippedId) || /\$ep=/i.test(strippedId)) ? 'zoro' : 'gogoanime';
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const provider = animeId.includes('-zoro-') ? 'zoro' : 'gogoanime';
        const key = `ep:${animeId}`;
        const hit = this.getCached<Episode[]>(key);
        if (hit) return hit;
        try {
            const id = animeId.replace(`consumet-${provider}-`, '');
            const data = await this.fetchJson<ConsumetAnimeResponse & { episodes?: ConsumetEpisodeResponse[] }>(
                provider,
                `/info/${encodeURIComponent(id)}`,
                undefined,
                options
            );
            const eps: Episode[] = (data.episodes || []).map((ep) => ({
                id: ep.id.split('?')[0], // Strip query params like ?ep=123
                number: ep.number || ep.episodeNumber || 1,
                title: ep.title || `Episode ${ep.number || ep.episodeNumber || 1}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: ep.hasDub || data.hasDub || false,
                thumbnail: ep.image,
            }));
            this.setCache(key, eps, 10 * 60 * 1000);
            return eps;
        } catch (e) {
            logger.warn(`Consumet getEpisodes failed`, { animeId, err: String(e) }, this.name);
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const key = `srv:${episodeId}`;
        const hit = this.getCached<EpisodeServer[]>(key);
        if (hit) return hit;
        try {
            const raw = this.stripConsumetEpisodePrefix(episodeId);
            const provider = this.effectiveProviderForEpisodeId(raw);
            const data = await this.fetchJson<Array<{ name: string; url: string; type?: string }>>(
                provider,
                `/servers/${encodeURIComponent(raw)}`,
                undefined,
                options
            );
            const servers: EpisodeServer[] = (Array.isArray(data) ? data : []).map((s) => ({
                name: s.name,
                url: s.url,
                type: (s.type || 'sub') as 'sub' | 'dub' | 'raw',
            }));
            this.setCache(key, servers, 30 * 60 * 1000);
            return servers;
        } catch {
            return [];
        }
    }

    async getStreamingLinks(
        episodeId: string,
        server?: string,
        category: 'sub' | 'dub' = 'sub',
        options?: SourceRequestOptions
    ): Promise<StreamingData> {
        const key = `stream:${episodeId}:${server || 'd'}:${category}`;
        const hit = this.getCached<StreamingData>(key);
        if (hit) return hit;
        try {
            const raw = this.stripConsumetEpisodePrefix(episodeId);
            const provider = this.effectiveProviderForEpisodeId(raw);
            const q: Record<string, string> = {};
            if (server) q.server = server;
            const data = await this.fetchJson<{
                sources?: Array<{ url: string; quality?: string; isM3U8?: boolean }>;
                subtitles?: Array<{ url: string; lang: string; label?: string }>;
                headers?: Record<string, string>;
                intro?: { start: number; end: number };
                outro?: { start: number; end: number };
                download?: string;
            }>(provider, `/watch/${encodeURIComponent(raw)}`, q, options);

            const streamData: StreamingData = {
                sources: (data.sources || []).map(
                    (s): VideoSource => ({
                        url: s.url,
                        quality: (s.quality as VideoSource['quality']) || 'auto',
                        isM3U8: s.isM3U8 || s.url?.includes('.m3u8') || false,
                        isDASH: s.url?.includes('.mpd') || false,
                    })
                ),
                subtitles: (data.subtitles || []).map((sub) => ({
                    url: sub.url,
                    lang: sub.lang,
                    label: sub.label,
                })),
                headers: data.headers,
                intro: data.intro,
                outro: data.outro,
                download: data.download,
            };
            this.setCache(key, streamData, 60 * 60 * 1000);
            return streamData;
        } catch (e) {
            logger.warn(`Consumet watch failed`, { episodeId, err: String(e) }, this.name);
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const provider = 'gogoanime';
        const key = `tr:${page}`;
        const hit = this.getCached<AnimeBase[]>(key);
        if (hit) return hit;
        try {
            const data = await this.fetchJson<{ results?: ConsumetAnimeResponse[] }>(
                provider,
                '/top-airing',
                { page: String(page) },
                options
            );
            const list = (data.results || []).map((a) => this.mapAnime(a, provider));
            this.setCache(key, list);
            return list;
        } catch {
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const provider = 'gogoanime';
        const key = `la:${page}`;
        const hit = this.getCached<AnimeBase[]>(key);
        if (hit) return hit;
        try {
            const data = await this.fetchJson<{ results?: ConsumetAnimeResponse[] }>(
                provider,
                '/recent-episodes',
                { page: String(page) },
                options
            );
            const list = (data.results || []).map((a) => this.mapAnime(a, provider));
            this.setCache(key, list);
            return list;
        } catch {
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, i) => ({
            rank: (page - 1) * limit + i + 1,
            anime,
        }));
    }
}
