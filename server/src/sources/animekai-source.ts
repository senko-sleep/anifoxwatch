/**
 * AnimeKai Source - Uses @consumet/extensions AnimeKai provider
 * Reliable backup streaming provider
 */

import axios, { AxiosError } from 'axios';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

function axiosConfigFullUrl(cfg: AxiosError['config']): string {
    if (!cfg) return '';
    const u = cfg.url || '';
    if (u.startsWith('http')) return u;
    const base = (cfg.baseURL || '').replace(/\/$/, '');
    const path = u.startsWith('/') ? u : `/${u}`;
    return `${base}${path}`;
}

/** Consumet AnimeKai → MegaUp posts to enc-dec.app/api/dec-mega; often 400 "please do not deploy at scale" or "queue full". */
function isConsumetEmbedDecoderRejected(err: unknown): boolean {
    const bodyContainsDeploy = (raw: unknown): boolean => {
        const bodyStr =
            typeof raw === 'string'
                ? raw
                : raw && typeof raw === 'object'
                  ? JSON.stringify(raw) +
                    ('error' in (raw as object) ? String((raw as { error?: string }).error || '') : '')
                  : '';
        return /please do not deploy at scale|queue full|decrypt failure/i.test(bodyStr);
    };

    const inspect = (e: unknown): boolean => {
        if (axios.isAxiosError(e)) {
            const status = e.response?.status;
            const fullUrl = axiosConfigFullUrl(e.config);
            const raw = e.response?.data;
            if (bodyContainsDeploy(raw)) return true;
            if (status === 400 && /enc-dec\.app|\/dec-mega\b/i.test(fullUrl)) return true;
            if (status === 400 && /\/dec-mega\b/i.test(String(e.config?.url || ''))) return true;
        }
        // Some builds lose `axios.isAxiosError` identity — duck-type 400 + dec endpoint
        if (e && typeof e === 'object' && 'response' in e && 'config' in e) {
            const ex = e as { response?: { status?: number; data?: unknown }; config?: AxiosError['config'] };
            if (ex.response?.status === 400) {
                const fullUrl = axiosConfigFullUrl(ex.config);
                if (/enc-dec\.app|\/dec-mega\b/i.test(fullUrl)) return true;
                if (bodyContainsDeploy(ex.response.data)) return true;
            }
        }
        const msg = e instanceof Error ? e.message : String(e);
        if (/please do not deploy at scale|queue full|decrypt failure/i.test(msg)) return true;
        return false;
    };
    if (inspect(err)) return true;
    const cause = err && typeof err === 'object' && 'cause' in err ? (err as { cause?: unknown }).cause : undefined;
    if (cause !== undefined) return isConsumetEmbedDecoderRejected(cause);
    return false;
}

let ANIME: any = null;
async function getConsumet() {
    if (!ANIME) {
        const mod = await import('@consumet/extensions');
        ANIME = mod.ANIME;
    }
    return ANIME;
}

export class AnimeKaiSource extends BaseAnimeSource {
    name = 'AnimeKai';
    baseUrl = 'https://animekai.to';
    private provider: any = null;
    private cache = new Map<string, { data: any; expires: number }>();

    private async getProvider() {
        if (!this.provider) {
            const anime = await getConsumet();
            this.provider = new anime.AnimeKai();
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

    private cleanDescription(raw?: string): string {
        if (!raw) return 'No description available.';
        let desc = raw.replace(/<[^>]*>/g, '');
        // Strip metadata that leaks into AnimeKai descriptions
        desc = desc.replace(/Country:\s*.*/i, '').trim();
        desc = desc.replace(/Genres?:\s*.*/i, '').trim();
        desc = desc.replace(/Premiered:\s*.*/i, '').trim();
        desc = desc.replace(/Date aired:\s*.*/i, '').trim();
        desc = desc.replace(/Broadcast:\s*.*/i, '').trim();
        desc = desc.replace(/Episodes:\s*\d+.*/i, '').trim();
        desc = desc.replace(/Duration:\s*.*/i, '').trim();
        desc = desc.replace(/\s{2,}/g, ' ').trim();
        return desc || 'No description available.';
    }

    private mapAnime(data: any): AnimeBase {
        return {
            id: `animekai-${data.id}`,
            title: data.title || 'Unknown',
            titleJapanese: data.japaneseTitle,
            image: data.image || '',
            cover: data.cover || data.image,
            description: this.cleanDescription(data.description),
            type: this.mapType(data.type),
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
        const cacheKey = `kai:search:${query}:${page}`;
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
        try {
            const rawId = id.replace('animekai-', '');
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);
            return this.mapAnime(info);
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cacheKey = `kai:eps:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const rawId = animeId.replace('animekai-', '');
            const p = await this.getProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(rawId),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000))
            ]);

            const episodes: Episode[] = (info.episodes || []).map((ep: any) => ({
                id: ep.id,
                number: ep.number || 1,
                title: ep.title || `Episode ${ep.number || 1}`,
                isFiller: false,
                hasSub: true,
                hasDub: false,
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
            { name: 'default', url: '', type: 'dub' }
        ];
    }

    private isBrokenCdn(url: string): boolean {
        try {
            const h = new URL(url).hostname;
            return ['hub26link', 'net22lab', 'streamwish'].some(bad => h.includes(bad));
        } catch { return false; }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `kai:stream:${episodeId}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached && !cached.sources.some(s => this.isBrokenCdn(s.url))) return cached;

        // Strip source prefix added by SourceManager when AnimeKai is a fallback for other sources.
        // The consumet AnimeKai provider expects its native episode ID (e.g. slug$ep=N$token=KEY).
        const rawEpisodeId = episodeId.replace(/^animekai-/i, '');

        try {
            const p = await this.getProvider();
            const mod = await import('@consumet/extensions');
            const subOrDub = category === 'dub' ? mod.SubOrSub.DUB : mod.SubOrSub.SUB;
            logger.info(`Fetching ${category} stream from AnimeKai for ${rawEpisodeId}`, undefined, this.name);

            // Try twice — keep total time under SourceManager executeReliably budget
            for (let attempt = 0; attempt < 2; attempt++) {
                const data = await Promise.race([
                    p.fetchEpisodeSources(rawEpisodeId, undefined, subOrDub),
                    new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 10_000))
                ]);

                if (!data.sources?.length) {
                    return { sources: [], subtitles: [] };
                }

                const hasBrokenUrl = data.sources.some((s: any) => this.isBrokenCdn(s.url));
                if (hasBrokenUrl && attempt < 1) {
                    logger.warn(`AnimeKai: Got broken CDN domain on attempt ${attempt + 1}, retrying...`, undefined, this.name);
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }

                const streamData: StreamingData = {
                    sources: data.sources.map((s: any): VideoSource => ({
                        url: s.url,
                        quality: s.quality?.includes('1080') ? '1080p' : s.quality?.includes('720') ? '720p' : 'auto',
                        isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                        isDASH: s.url?.includes('.mpd')
                    })),
                    subtitles: (data.subtitles || []).map((sub: any) => ({
                        url: sub.url,
                        lang: sub.lang || 'Unknown',
                        label: sub.label || sub.lang
                    })),
                    headers: data.headers,
                    source: this.name
                };

                logger.info(`AnimeKai: ${streamData.sources.length} sources for ${episodeId}`, undefined, this.name);
                this.setCache(cacheKey, streamData, 2 * 60 * 60 * 1000);
                return streamData;
            }

            return { sources: [], subtitles: [] };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            // "Server X not found" means the CDN server is no longer listed on AnimeKai's
            // episode page (e.g. megaup was removed). This is a soft failure — AnimeKai itself
            // is still online, it just can't serve this episode via that server. Returning empty
            // sources here avoids incrementing the consecutive-failure counter and prevents the
            // source from being incorrectly marked offline.
            if (isConsumetEmbedDecoderRejected(error)) {
                logger.warn(
                    `AnimeKai: remote embed decoder unavailable or rate-limited (Consumet enc-dec); skipping`,
                    undefined,
                    this.name,
                );
                return { sources: [], subtitles: [] };
            }
            if (/server .* not found/i.test(err.message)) {
                logger.warn(`AnimeKai: CDN server unavailable for ${episodeId} — ${err.message}`, undefined, this.name);
                return { sources: [], subtitles: [] };
            }
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
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
