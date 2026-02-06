/**
 * Cloudflare Workers Source Manager
 * Uses fetch-based sources that work in Cloudflare Workers environment
 * No Node.js dependencies (axios, http.Agent, aniwatch package) required
 */

import { CloudflareHiAnimeAPISource } from '../sources/cloudflare-hianime-api-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime, SourceHealth } from '../types/anime.js';
import { SourceRequestOptions } from '../sources/base-source.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

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
    private primarySource: string = 'CloudflareHiAnimeAPI';
    private healthStatus: Map<string, SourceHealth> = new Map();
    private sourceOrder: string[] = ['CloudflareHiAnimeAPI'];

    constructor() {
        // Register Cloudflare-compatible sources
        this.registerSource(new CloudflareHiAnimeAPISource());

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
        // For hianime- prefixed IDs, use CloudflareHiAnimeAPI
        if (id.toLowerCase().startsWith('hianime-')) {
            return this.sources.get('CloudflareHiAnimeAPI') || null;
        }
        return this.getAvailableSource();
    }

    // ============ ANIME DATA METHODS ============

    async search(query: string, page: number = 1, sourceName?: string): Promise<AnimeSearchResult> {
        const source = this.getAvailableSource(sourceName);
        if (!source) {
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
        }

        try {
            return await source.search(query, page);
        } catch (error) {
            logger.error(`Search failed`, error as Error, { query }, 'CloudflareSourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
        }
    }

    async getAnime(id: string): Promise<AnimeBase | null> {
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
        const source = this.getAvailableSource(sourceName);
        if (!source) return [];

        try {
            return await source.getTrending(page);
        } catch (error) {
            logger.error(`getTrending failed`, error as Error, undefined, 'CloudflareSourceManager');
            return [];
        }
    }

    async getLatest(page: number = 1, sourceName?: string): Promise<AnimeBase[]> {
        const source = this.getAvailableSource(sourceName);
        if (!source) return [];

        try {
            return await source.getLatest(page);
        } catch (error) {
            logger.error(`getLatest failed`, error as Error, undefined, 'CloudflareSourceManager');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, sourceName?: string): Promise<TopAnime[]> {
        const source = this.getAvailableSource(sourceName);
        if (!source) return [];

        try {
            return await source.getTopRated(page, limit);
        } catch (error) {
            logger.error(`getTopRated failed`, error as Error, undefined, 'CloudflareSourceManager');
            return [];
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
