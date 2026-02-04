import axios from 'axios';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime, SourceHealth } from '../types/anime.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

/**
 * Common options for all source requests
 */
export interface SourceRequestOptions {
    signal?: AbortSignal;
    timeout?: number;
    priority?: 'high' | 'normal' | 'low';
}

/**
 * Extended interface for sources that support genre-specific fetching
 */
export interface GenreAwareSource extends AnimeSource {
    getByGenre(genre: string, page?: number, options?: SourceRequestOptions): Promise<AnimeSearchResult>;
    getGenres(options?: SourceRequestOptions): Promise<string[]>;
}

/**
 * Base interface for all anime sources
 * Each source must implement these methods
 */
export interface AnimeSource {
    name: string;
    baseUrl: string;
    isAvailable: boolean;

    // Health check
    healthCheck(options?: SourceRequestOptions): Promise<boolean>;

    // Search
    search(query: string, page?: number, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult>;

    // Get anime details
    getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null>;

    // Get episodes
    getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]>;

    // Get trending/popular anime
    getTrending(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]>;

    // Get latest anime
    getLatest(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]>;

    // Get top rated anime
    getTopRated(page?: number, limit?: number, options?: SourceRequestOptions): Promise<TopAnime[]>;

    // Optional methods that might be implemented by some sources
    getStreamingLinks?(episodeId: string, server?: string, category?: 'sub' | 'dub', options?: SourceRequestOptions): Promise<StreamingData>;
    getEpisodeServers?(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]>;
}

/**
 * Abstract base class with common functionality
 */
export abstract class BaseAnimeSource implements AnimeSource {
    abstract name: string;
    abstract baseUrl: string;
    isAvailable: boolean = true;

    abstract healthCheck(options?: SourceRequestOptions): Promise<boolean>;
    abstract search(query: string, page?: number, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult>;
    abstract getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null>;
    abstract getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]>;
    abstract getTrending(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]>;
    abstract getLatest(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]>;
    abstract getTopRated(page?: number, limit?: number, options?: SourceRequestOptions): Promise<TopAnime[]>;

    protected handleError(error: unknown, operation: string): void {
        const err = error instanceof Error ? error : new Error(String(error));
        // Don't mark as unavailable if it was just a cancellation
        if (err.name === 'AbortError' || err.message.includes('aborted') || axios.isCancel(error)) {
            logger.debug(`Operation ${operation} was aborted`, undefined, this.name);
            return;
        }
        logger.error(`Error during ${operation}`, err, { operation }, this.name);
        this.isAvailable = false;
    }
}
