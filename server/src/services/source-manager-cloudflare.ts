/**
 * Cloudflare Workers Source Manager
 * Uses fetch-based sources that work in Cloudflare Workers environment
 * No Node.js dependencies (axios, http.Agent, aniwatch package) required
 */

import { CloudflareConsumetFetchSource } from '../sources/cloudflare-consumet-fetch-source.js';
import { WatchHentaiSource } from '../sources/watchhentai-source.js';
import { HanimeSource } from '../sources/hanime-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime, SourceHealth } from '../types/anime.js';
import { SourceRequestOptions } from '../sources/base-source.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { anilistService } from './anilist-service.js';

interface StreamingSource {
    name: string;
    isAvailable: boolean;
    healthCheck(options?: SourceRequestOptions): Promise<boolean>;
    search(query: string, page?: number, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult>;
    getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null>;
    getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]>;
    getTrending(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]>;
    getLatest(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]>;
    getTopRated(page?: number, limit?: number, options?: SourceRequestOptions): Promise<TopAnime[]>;
    getStreamingLinks?(episodeId: string, server?: string, category?: 'sub' | 'dub', options?: SourceRequestOptions): Promise<StreamingData>;
    getEpisodeServers?(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]>;
}

/**
 * CloudflareSourceManager - Lightweight source manager for Cloudflare Workers
 * Uses only fetch-based sources that are compatible with Workers runtime
 */
export class CloudflareSourceManager {
    private sources: Map<string, StreamingSource> = new Map();
    private primarySource: string = 'CloudflareConsumet';
    private healthStatus: Map<string, SourceHealth> = new Map();
    private sourceOrder: string[] = ['CloudflareConsumet'];

    constructor() {
        this.registerSource(new CloudflareConsumetFetchSource());
        this.registerSource(new WatchHentaiSource());
        this.registerSource(new HanimeSource());

        logger.info(`[CloudflareSourceManager] Initialized with ${this.sources.size} sources`, undefined, 'CloudflareSourceManager');
    }

    private registerSource(source: StreamingSource): void {
        this.sources.set(source.name, source);
        this.healthStatus.set(source.name, {
            name: source.name,
            status: 'online',
            lastCheck: new Date()
        });
    }

    async checkAllHealth(): Promise<Map<string, SourceHealth>> {
        const checks = Array.from(this.sources.entries()).map(async ([name, source]) => {
            const start = Date.now();
            try {
                const isHealthy = await source.healthCheck({ timeout: 5000 });
                const latency = Date.now() - start;
                this.healthStatus.set(name, {
                    name,
                    status: isHealthy ? 'online' : 'offline',
                    latency,
                    lastCheck: new Date()
                });
                source.isAvailable = isHealthy;
            } catch (error) {
                const latency = Date.now() - start;
                // Don't change isAvailable on health check errors - keep current state
                // Source will be marked offline only after consecutive real request failures
                const currentStatus = this.healthStatus.get(name);
                this.healthStatus.set(name, {
                    name,
                    status: currentStatus?.status || 'online',
                    latency,
                    lastCheck: new Date()
                });
            }
        });

        await Promise.all(checks);
        return this.healthStatus;
    }

    getHealthStatus(): SourceHealth[] {
        return Array.from(this.healthStatus.values());
    }

    getAvailableSources(): string[] {
        return Array.from(this.sources.keys());
    }

    private getAvailableSource(preferred?: string): StreamingSource | null {
        if (preferred && this.sources.has(preferred)) {
            const source = this.sources.get(preferred)!;
            if (source.isAvailable) return source;
        }

        for (const name of this.sourceOrder) {
            if (this.sources.has(name)) {
                const source = this.sources.get(name)!;
                if (source.isAvailable) return source;
            }
        }

        // Return first available source
        for (const source of this.sources.values()) {
            if (source.isAvailable) return source;
        }

        // Return primary source even if not marked available (it might work)
        return this.sources.get(this.primarySource) || null;
    }

    private getStreamingSource(id: string): StreamingSource | null {
        // Try to identify source from ID prefix
        for (const source of this.sources.values()) {
            if (id.startsWith(`${source.name.toLowerCase()}-`)) {
                return source;
            }
        }
        
        // Specific id patterns
        if (id.startsWith('hanime-')) return this.sources.get('Hanime') || null;
        if (id.startsWith('watchhentai-')) return this.sources.get('WatchHentai') || null;

        return this.getAvailableSource();
    }

    // ============ ANIME DATA METHODS ============
    // Strategy mirrors Render's SourceManager: AniList is primary for all metadata.
    // Consumet is used only for streaming (episodes/watch).

    async search(query: string, page: number = 1, sourceName?: string, options?: { mode?: string }): Promise<AnimeSearchResult> {
        const mode = options?.mode || 'safe';

        // Adult mode: delegate to WatchHentai/Hanime
        if (mode === 'adult') {
            const source = this.getAvailableSource(sourceName || 'WatchHentai');
            if (source) {
                try { return await source.search(query, page); } catch {}
            }
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
        }

        // Safe/mixed: AniList primary, Consumet fallback
        try {
            const result = await anilistService.advancedSearch({ search: query, sort: ['SEARCH_MATCH'], perPage: 20, page });
            if (result.results.length > 0) return result;
        } catch (e) {
            logger.warn(`AniList search failed`, { query, err: String(e) }, 'CloudflareSourceManager');
        }

        // Consumet fallback
        const source = this.getAvailableSource(sourceName);
        if (source) {
            try { return await source.search(query, page); } catch {}
        }
        return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
    }

    async getAnime(id: string): Promise<AnimeBase | null> {
        // AniList ID: query AniList directly
        if (id.toLowerCase().startsWith('anilist-')) {
            const numericId = parseInt(id.replace(/^anilist-/i, ''), 10);
            if (!isNaN(numericId)) {
                try {
                    const data = await anilistService.getAnimeById(numericId);
                    if (data) return { ...data, id: `anilist-${numericId}` };
                } catch (e) {
                    logger.warn(`AniList getAnimeById failed`, { id, err: String(e) }, 'CloudflareSourceManager');
                }
            }
            return null;
        }

        // Streaming source ID (consumet-*, watchhentai-*, hanime-*)
        const source = this.getStreamingSource(id);
        if (!source) return null;
        try {
            return await source.getAnime(id);
        } catch (error) {
            logger.error(`getAnime failed`, error as Error, { id }, 'CloudflareSourceManager');
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        // AniList ID: find streaming source by title (same as Render)
        if (animeId.toLowerCase().startsWith('anilist-')) {
            const numericId = parseInt(animeId.replace(/^anilist-/i, ''), 10);
            if (!isNaN(numericId)) {
                try {
                    const anilistData = await anilistService.getAnimeById(numericId);
                    if (anilistData?.title) {
                        // Search Consumet by title to get streaming episodes
                        const consumet = this.sources.get('CloudflareConsumet');
                        if (consumet) {
                            const searchResult = await consumet.search(anilistData.title, 1).catch(() => null);
                            if (searchResult?.results?.length) {
                                const streamingId = searchResult.results[0].id;
                                if (streamingId && !streamingId.startsWith('anilist-')) {
                                    const episodes = await consumet.getEpisodes(streamingId).catch(() => []);
                                    if (episodes.length > 0) return episodes;
                                }
                            }
                        }
                    }
                } catch (e) {
                    logger.warn(`getEpisodes AniList lookup failed`, { animeId, err: String(e) }, 'CloudflareSourceManager');
                }
            }
            return [];
        }

        const source = this.getStreamingSource(animeId);
        if (!source) return [];
        try {
            return await source.getEpisodes(animeId);
        } catch (error) {
            logger.error(`getEpisodes failed`, error as Error, { animeId }, 'CloudflareSourceManager');
            return [];
        }
    }

    async getTrending(page: number = 1, sourceName?: string): Promise<AnimeBase[]> {
        // AniList primary (same as Render's fallback which always wins in CF since no scrapers)
        try {
            const result = await anilistService.advancedSearch({ sort: ['TRENDING_DESC'], perPage: 24, page });
            if (result.results.length > 0) return result.results;
        } catch (e) {
            logger.warn(`AniList getTrending failed`, { err: String(e) }, 'CloudflareSourceManager');
        }

        // Consumet fallback
        const source = this.getAvailableSource(sourceName);
        if (!source) return [];
        try {
            return await source.getTrending(page);
        } catch {
            return [];
        }
    }

    async getLatest(page: number = 1, sourceName?: string): Promise<AnimeBase[]> {
        // AniList primary
        try {
            const result = await anilistService.advancedSearch({ sort: ['START_DATE_DESC'], status: 'RELEASING', perPage: 24, page });
            if (result.results.length > 0) return result.results;
        } catch (e) {
            logger.warn(`AniList getLatest failed`, { err: String(e) }, 'CloudflareSourceManager');
        }

        // Consumet fallback
        const source = this.getAvailableSource(sourceName);
        if (!source) return [];
        try {
            return await source.getLatest(page);
        } catch {
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, sourceName?: string): Promise<TopAnime[]> {
        try {
            const result = await anilistService.getTopRatedAnime(page, limit);
            if (result.results.length > 0) {
                return result.results.map((a, i): TopAnime => ({
                    rank: (page - 1) * limit + i + 1,
                    anime: a,
                }));
            }
        } catch (e) {
            logger.warn(`AniList getTopRated failed`, { err: String(e) }, 'CloudflareSourceManager');
        }

        const source = this.getAvailableSource(sourceName);
        if (!source) return [];
        try {
            return await source.getTopRated(page, limit);
        } catch {
            return [];
        }
    }

    async getAnimeByGenre(genre: string, page: number = 1, _sourceName?: string): Promise<AnimeSearchResult> {
        try {
            return await anilistService.searchByGenre(genre, page, 25);
        } catch (error) {
            logger.error(`getAnimeByGenre failed`, error as Error, undefined, 'CloudflareSourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
        }
    }

    async browseAnime(filters: any): Promise<AnimeSearchResult> {
        const page = filters.page || 1;
        const limit = filters.limit || 25;
        const mode = filters.mode || 'safe';

        // Adult mode: use WatchHentai/Hanime (same as Render)
        if (mode === 'adult') {
            const source = this.getAvailableSource(filters.source || 'WatchHentai');
            if (!source) return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
            try {
                // First try genre if provided
                if (filters.genres?.length > 0 && 'getByGenre' in source) {
                    const genreResult = await (source as any).getByGenre(filters.genres[0], page);
                    // Use genre results if found, otherwise fall back to getLatest
                    if (genreResult.results && genreResult.results.length > 0) {
                        return genreResult;
                    }
                }
                // Use getLatest for initial load or when genre not found - avoids 48-page crawl
                const res = await source.getLatest(page);
                const totalPages = 5;
                return { results: res, totalPages, currentPage: page, hasNextPage: page < totalPages, source: source.name };
            } catch {
                return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
            }
        }

        // Safe/mixed: AniList strategy (mirrors Render's _executeBrowse)
        try {
            let anilistResult: AnimeSearchResult;

            if (filters.genres?.length > 0) {
                anilistResult = await anilistService.searchByGenre(filters.genres.join(','), page, limit, filters);
            } else {
                // Map sort values to AniList sorts (same as Render)
                const sortMap: Record<string, string> = {
                    popularity: 'POPULARITY_DESC',
                    trending: 'TRENDING_DESC',
                    recently_released: 'START_DATE_DESC',
                    rating: 'SCORE_DESC',
                    year: 'START_DATE_DESC',
                    title: 'TITLE_ENGLISH_DESC',
                };
                const sort = sortMap[filters.sort || 'trending'] || 'TRENDING_DESC';

                anilistResult = await anilistService.advancedSearch({
                    page,
                    perPage: limit,
                    sort: [sort],
                    type: filters.type?.toUpperCase(),
                    status: filters.status?.toUpperCase(),
                    season: filters.season?.toUpperCase(),
                    year: filters.year,
                    yearGreater: filters.startYear,
                    yearLesser: filters.endYear,
                    search: filters.search,
                });
            }

            return anilistResult;
        } catch (e) {
            logger.warn(`AniList browseAnime failed`, { err: String(e) }, 'CloudflareSourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
        }
    }

    // ============ STREAMING METHODS ============

    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const source = this.getStreamingSource(episodeId);
        if (!source || !source.getEpisodeServers) {
            return [
                { name: 'hd-2', url: '', type: 'sub' },
                { name: 'hd-1', url: '', type: 'sub' }
            ];
        }

        try {
            return await source.getEpisodeServers(episodeId);
        } catch (error) {
            logger.error(`getEpisodeServers failed`, error as Error, { episodeId }, 'CloudflareSourceManager');
            return [
                { name: 'hd-2', url: '', type: 'sub' },
                { name: 'hd-1', url: '', type: 'sub' }
            ];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub'): Promise<StreamingData> {
        const source = this.getStreamingSource(episodeId);
        if (!source || !source.getStreamingLinks) {
            logger.warn(`No streaming source available for ${episodeId}`, undefined, 'CloudflareSourceManager');
            return { sources: [], subtitles: [] };
        }

        try {
            logger.info(`Getting streaming links for ${episodeId} (server: ${server}, category: ${category})`, undefined, 'CloudflareSourceManager');
            const streamData = await source.getStreamingLinks(episodeId, server, category);
            
            if (streamData.sources.length > 0) {
                logger.info(`Found ${streamData.sources.length} sources for ${episodeId}`, undefined, 'CloudflareSourceManager');
            } else {
                logger.warn(`No sources found for ${episodeId}`, undefined, 'CloudflareSourceManager');
            }

            return streamData;
        } catch (error) {
            logger.error(`getStreamingLinks failed`, error as Error, { episodeId, server }, 'CloudflareSourceManager');
            return { sources: [], subtitles: [] };
        }
    }
}
