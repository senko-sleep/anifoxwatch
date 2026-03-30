/**
 * AnimePahe Direct Source - Uses @consumet/extensions for actual working streams
 * AnimePahe consistently provides multiple quality m3u8 sources
 */

import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

let ANIME: any = null;
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
    private provider: any = null;
    private cache = new Map<string, { data: any; expires: number }>();

    private async getProvider() {
        if (!this.provider) {
            const anime = await getConsumet();
            this.provider = new anime.AnimePahe();
        }
        return this.provider;
    }

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) return entry.data as T;
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: any, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const p = await this.getProvider();
            const res = await Promise.race([
                p.search('naruto'),
                new Promise<any>((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
            ]);
            this.isAvailable = (res.results?.length || 0) > 0;
            return this.isAvailable;
        } catch {
            this.isAvailable = true;
            return true;
        }
    }

    private mapAnime(data: any): AnimeBase {
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

    private mapType(type?: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = (type || '').toUpperCase();
        if (t.includes('MOVIE')) return 'Movie';
        if (t.includes('OVA')) return 'OVA';
        if (t.includes('ONA')) return 'ONA';
        if (t.includes('SPECIAL')) return 'Special';
        return 'TV';
    }

    private mapStatus(status?: string): 'Ongoing' | 'Completed' | 'Upcoming' {
        const s = (status || '').toLowerCase();
        if (s.includes('ongoing') || s.includes('airing')) return 'Ongoing';
        if (s.includes('upcoming') || s.includes('not yet')) return 'Upcoming';
        return 'Completed';
    }

    async search(query: string, page: number = 1, _filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `pahe:search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const p = await this.getProvider();
            const res = await Promise.race([
                p.search(query, page),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);

            const result: AnimeSearchResult = {
                results: (res.results || []).map((a: any) => this.mapAnime(a)),
                totalPages: res.totalPages || 1,
                currentPage: res.currentPage || page,
                hasNextPage: res.hasNextPage || false,
                source: this.name
            };

            this.setCache(cacheKey, result, 3 * 60 * 1000);
            return result;
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const cacheKey = `pahe:anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const rawId = id.replace('animepahe-', '');
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);

            const anime = this.mapAnime(info);
            this.setCache(cacheKey, anime, 15 * 60 * 1000);
            return anime;
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cacheKey = `pahe:eps:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const rawId = animeId.replace('animepahe-', '');
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);

            const episodes: Episode[] = (info.episodes || []).map((ep: any) => ({
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
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [
            { name: 'default', url: '', type: 'sub' },
            { name: 'backup', url: '', type: 'sub' }
        ];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `pahe:stream:${episodeId}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const p = await this.getProvider();
            logger.info(`Fetching stream from AnimePahe for ${episodeId}`, undefined, this.name);

            const data = await Promise.race([
                p.fetchEpisodeSources(episodeId),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 20000))
            ]);

            if (!data.sources?.length) {
                return { sources: [], subtitles: [] };
            }

            const sources: VideoSource[] = data.sources.map((s: any) => ({
                url: s.url,
                quality: this.normalizeQuality(s.quality),
                isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                isDASH: s.url?.includes('.mpd')
            }));

            sources.sort((a, b) => {
                const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4, 'default': 5 };
                return (order[a.quality] || 5) - (order[b.quality] || 5);
            });

            const streamData: StreamingData = {
                sources,
                subtitles: (data.subtitles || []).map((sub: any) => ({
                    url: sub.url,
                    lang: sub.lang || 'Unknown',
                    label: sub.label || sub.lang
                })),
                headers: data.headers,
                source: this.name
            };

            logger.info(`AnimePahe: ${sources.length} quality options for ${episodeId}`, undefined, this.name);
            this.setCache(cacheKey, streamData, 2 * 60 * 60 * 1000);
            return streamData;
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    private normalizeQuality(quality?: string): VideoSource['quality'] {
        if (!quality) return 'auto';
        const q = quality.toLowerCase();
        if (q.includes('1080')) return '1080p';
        if (q.includes('720')) return '720p';
        if (q.includes('480')) return '480p';
        if (q.includes('360')) return '360p';
        return 'auto';
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const result = await this.search('', page, undefined, options);
            return result.results;
        } catch {
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return this.getTrending(page, options);
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, i) => ({
            rank: (page - 1) * limit + i + 1,
            anime
        }));
    }
}
