import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer, VideoSubtitle } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { streamExtractor } from '../services/stream-extractor.js';

export class ReAnimeSource extends BaseAnimeSource {
    name = 'ReAnime';
    baseUrl = 'https://reanime.to';
    private client: AxiosInstance;

    private cache: Map<string, { data: any; expires: number }> = new Map();
    private readonly CACHE_TTL = 15 * 60 * 1000;
    // Map from slug (e.g. "chainsmoker-cat-9dyhxc") to real AniList ID
    private slugToAnilistId: Map<string, number> = new Map();

    constructor() {
        super();
        const keepAliveAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 15,
            timeout: 15000,
        });
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 12000,
            httpsAgent: keepAliveAgent,
            headers: {
                Accept: 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                Referer: 'https://reanime.to/'
            }
        });
    }

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) return entry.data as T;
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: any, ttl: number = this.CACHE_TTL): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const resp = await this.client.get('/api/v1/search?q=cat', { signal: options?.signal });
            return resp.status === 200;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const resp = await this.client.get(`/api/v1/search?q=${encodeURIComponent(query)}`, { signal: options?.signal });
            const data = resp.data;
            const items = Array.isArray(data) ? data : (data.results || data.data || []);
            const results: AnimeBase[] = items.map((item: any) => {
                const slug = item.anime_id || String(item.anilist_id);
                let anilistIdNum = item.anilist_id ? parseInt(String(item.anilist_id), 10) : 0;
                if (!anilistIdNum && item.cover_image) {
                    const coverStr = typeof item.cover_image === 'string' ? item.cover_image : JSON.stringify(item.cover_image);
                    const m = /bx(\d+)/i.exec(coverStr);
                    if (m) anilistIdNum = parseInt(m[1], 10);
                }
                if (anilistIdNum && item.anime_id) {
                    this.slugToAnilistId.set(String(item.anime_id), anilistIdNum);
                }
                return {
                    id: `reanime-${slug}`,
                    title: item.title?.english || item.title?.romaji || item.title?.native || 'Unknown Title',
                    titleJapanese: item.title?.native,
                    titleEnglish: item.title?.english,
                    titleRomaji: item.title?.romaji,
                    image: item.cover_image?.large || item.cover_image?.medium || '',
                    cover: item.cover_image?.large || item.cover_image?.medium || '',
                    banner: item.cover_image?.extra_large,
                    description: '',
                    status: 'Ongoing' as const,
                    type: 'TV' as const,
                    episodes: 0,
                    genres: [],
                    source: this.name
                };
            });

            const result: AnimeSearchResult = {
                results,
                currentPage: page,
                totalPages: 1,
                hasNextPage: false,
                totalResults: results.length,
                source: this.name
            };
            this.setCache(cacheKey, result);
            return result;
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], currentPage: page, totalPages: 1, hasNextPage: false, totalResults: 0, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const cleanId = id.replace(/^reanime-/, '');
        const episodes = await this.getEpisodes(id, options);
        return {
            id: `reanime-${cleanId}`,
            title: cleanId.replace(/-[a-z0-9]+$/, '').replace(/-/g, ' ').toUpperCase(),
            image: '',
            description: '',
            status: 'Ongoing',
            type: 'TV',
            episodes: episodes.length,
            genres: [],
            source: this.name
        };
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cleanId = animeId.replace(/^reanime-/, '');
        const cacheKey = `episodes:${cleanId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const resp = await this.client.get(`/api/v1/anime/${cleanId}/episodes?limit=2000`, { signal: options?.signal });
            const epList = resp.data?.data || [];
            const episodes: Episode[] = epList.map((ep: any) => ({
                id: `reanime-${cleanId}$ep=${ep.episode_number}`,
                number: ep.episode_number,
                title: ep.title || `Episode ${ep.episode_number}`,
                isFiller: Boolean(ep.is_filler),
                hasSub: true,
                hasDub: true
            }));
            this.setCache(cacheKey, episodes);
            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const res = await this.search('a', page, undefined, options);
        return res.results;
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const res = await this.search('e', page, undefined, options);
        return res.results;
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const res = await this.search('o', page, undefined, options);
        return res.results.slice(0, limit).map((a, i) => ({ rank: i + 1, anime: a }));
    }

    private extractAnilistId(episodeId: string): number | null {
        const match = /anilist-(\d+)/i.exec(episodeId);
        return match ? parseInt(match[1], 10) : null;
    }

    private extractEpisodeNum(episodeId: string, options?: SourceRequestOptions): number {
        if (options?.episodeNum && options.episodeNum > 0) return options.episodeNum;
        const match = /\$ep=(\d+)/i.exec(episodeId) || /ep-(\d+)/i.exec(episodeId) || /[?&]ep=(\d+)/i.exec(episodeId);
        return match ? parseInt(match[1], 10) : 1;
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const epNum = this.extractEpisodeNum(episodeId, options);
        let anilistId = options?.anilistId || this.extractAnilistId(episodeId);

        if (!anilistId) {
            // Try slug → AniList ID map populated during search()
            const cleanSlug = episodeId.replace(/^reanime-/, '').split(/[\$?&]/)[0].replace(/=\d+$/, '');
            if (this.slugToAnilistId.has(cleanSlug)) {
                anilistId = this.slugToAnilistId.get(cleanSlug)!;
            } else {
                try {
                    // Search by cleaned title query to trigger population of slugToAnilistId
                    const searchQuery = cleanSlug.replace(/-[a-z0-9]{5,}$/i, '').replace(/[-_]/g, ' ');
                    const searchRes = await this.search(searchQuery, 1, undefined, options);
                    if (searchRes.results.length > 0) {
                        // Check map again after search (populated by search())
                        if (this.slugToAnilistId.has(cleanSlug)) {
                            anilistId = this.slugToAnilistId.get(cleanSlug)!;
                        } else {
                            // Fallback: try extracting numeric ID from result ID
                            const numMatch = /(\d{4,})/.exec(searchRes.results[0].id);
                            if (numMatch) anilistId = parseInt(numMatch[1], 10);
                        }
                    }
                } catch (e) {}
            }
        }

        if (!anilistId) {
            logger.warn(`[ReAnime] No AniList ID could be determined for ${episodeId}`);
            return { sources: [], subtitles: [] };
        }

        const cacheKey = `stream:${anilistId}:${epNum}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            const flixUrl = `/api/flix/${anilistId}/${epNum}`;
            const resp = await this.client.get(flixUrl, { signal: options?.signal });
            const servers: any[] = resp.data?.servers || [];

            const matchedServers = servers.filter((s: any) => {
                if (category === 'dub') return s.dataType === 'dub';
                return s.dataType === 'sub' || !s.dataType;
            });

            const sources: VideoSource[] = [];
            const subtitles: VideoSubtitle[] = [];

            for (const s of matchedServers) {
                if (s.dataLink) {

                    try {
                        const extracted = await streamExtractor.extractFromEmbed(s.dataLink);
                        if (extracted && extracted.streams && extracted.streams.length > 0) {
                            sources.push(...extracted.streams.map(src => ({
                                url: src.url,
                                quality: (src.quality || 'auto') as VideoSource['quality'],
                                isM3U8: src.type === 'hls' || src.url.includes('.m3u8'),
                                category: s.dataType || category,
                                server: s.serverName || 'HD-1'
                            })));
                            if (extracted.subtitles) {
                                subtitles.push(...extracted.subtitles.map(sub => ({ url: sub.url, lang: sub.lang })));
                            }
                        } else {
                            sources.push({
                                url: s.dataLink,
                                quality: 'auto',
                                isM3U8: s.dataLink.includes('.m3u8'),
                                category: s.dataType || category,
                                server: s.serverName || 'HD-1'
                            });
                        }
                    } catch {
                        sources.push({
                            url: s.dataLink,
                            quality: 'auto',
                            isM3U8: false,
                            category: s.dataType || category,
                            server: s.serverName || 'HD-1'
                        });
                    }
                }
            }

            const streamData: StreamingData = { sources, subtitles, source: this.name, category };
            if (sources.length > 0) {
                this.setCache(cacheKey, streamData);
                this.handleSuccess();
            }
            return streamData;

        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const epNum = this.extractEpisodeNum(episodeId, options);
        let anilistId = options?.anilistId || this.extractAnilistId(episodeId);

        if (!anilistId) return [];

        try {
            const flixUrl = `/api/flix/${anilistId}/${epNum}`;
            const resp = await this.client.get(flixUrl, { signal: options?.signal });
            const servers: any[] = resp.data?.servers || [];

            return servers.map((s: any) => ({
                name: `${s.serverName || 'HD'} (${(s.dataType || 'sub').toUpperCase()})`,
                url: s.dataLink || '',
                type: s.dataType || 'sub'
            }));
        } catch {
            return [];
        }
    }
}
