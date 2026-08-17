/**
 * Hanime Source - Adult anime streaming from hanime.tv
 * Uses axios for HTTP requests with cheerio for HTML parsing
 * Hentai only source
 * 
 * NOTE: Hanime.tv requires complex JavaScript rendering and API authentication.
 * This source is kept as a placeholder for future implementation.
 * Currently, WatchHentai serves as the primary hentai source.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { getHentaiProxyConfig } from '../utils/proxy-config.js';

export class HanimeSource extends BaseAnimeSource {
    name = 'Hanime';
    baseUrl = 'https://hanime.tv';

    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = {
        search: 3 * 60 * 1000,
        anime: 15 * 60 * 1000,
        stream: 2 * 60 * 60 * 1000,
    };

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.data as T;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: unknown, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const proxyConfig = getHentaiProxyConfig();
            const response = await axios.get(this.baseUrl, {
                timeout: options?.timeout || 10000,
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                proxy: proxyConfig || options?.proxy
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        // Hanime.tv requires JavaScript rendering - return empty for now
        // WatchHentai serves as the primary hentai source
        logger.warn(`[Hanime] Search not implemented - requires JS rendering. Use WatchHentai instead.`);
        return { 
            results: [], 
            totalPages: 0, 
            currentPage: page, 
            hasNextPage: false, 
            source: this.name 
        };
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        // Hanime.tv requires JavaScript rendering - return null for now
        logger.warn(`[Hanime] getAnime not implemented - requires JS rendering. Use WatchHentai instead.`);
        return null;
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        // Hanime.tv requires JavaScript rendering - return empty for now
        logger.warn(`[Hanime] getEpisodes not implemented - requires JS rendering. Use WatchHentai instead.`);
        return [];
    }

    async getStreamingLinks(episodeId: string, server?: string, category?: 'sub' | 'dub', options?: SourceRequestOptions): Promise<StreamingData> {
        // Hanime.tv requires JavaScript rendering - return empty for now
        logger.warn(`[Hanime] getStreamingLinks not implemented - requires JS rendering. Use WatchHentai instead.`);
        return {
            sources: [],
            subtitles: [],
            source: this.name,
            category: category || 'sub'
        };
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [];
    }

    // Optional methods not implemented
    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }

    async getGenres(options?: SourceRequestOptions): Promise<string[]> {
        return [];
    }
}