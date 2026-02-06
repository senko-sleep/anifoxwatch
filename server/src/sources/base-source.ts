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

    // Failure tracking - only disable after consecutive failures, not a single error
    private _consecutiveFailures: number = 0;
    private _maxConsecutiveFailures: number = 5;
    private _lastFailureTime: number = 0;
    private _autoRecoverMs: number = 30000; // Auto re-enable after 30s
    private _recoveryTimer: ReturnType<typeof setTimeout> | null = null;

    abstract healthCheck(options?: SourceRequestOptions): Promise<boolean>;
    abstract search(query: string, page?: number, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult>;
    abstract getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null>;
    abstract getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]>;
    abstract getTrending(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]>;
    abstract getLatest(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]>;
    abstract getTopRated(page?: number, limit?: number, options?: SourceRequestOptions): Promise<TopAnime[]>;

    protected handleError(error: unknown, operation: string): void {
        const err = error instanceof Error ? error : new Error(String(error));
        // Don't count cancellations/timeouts as failures
        if (err.name === 'AbortError' || err.message.includes('aborted') || err.message.includes('timed out') || axios.isCancel(error)) {
            logger.debug(`Operation ${operation} was aborted/timed out`, undefined, this.name);
            return;
        }

        // If already offline, don't pile on failures — recovery timer is already running
        if (!this.isAvailable) return;

        logger.error(`Error during ${operation}`, err, { operation }, this.name);
        this._consecutiveFailures++;
        this._lastFailureTime = Date.now();

        // Only mark unavailable after multiple consecutive failures
        if (this._consecutiveFailures >= this._maxConsecutiveFailures) {
            logger.warn(`Source ${this.name} marked offline after ${this._consecutiveFailures} consecutive failures`, undefined, this.name);
            this.isAvailable = false;
            this._consecutiveFailures = 0; // Reset so recovery gets a fresh start

            // Schedule auto-recovery (prevent stacking timers)
            if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
            this._recoveryTimer = setTimeout(() => {
                this._recoveryTimer = null;
                this.isAvailable = true;
                this._consecutiveFailures = 0;
                logger.info(`Source ${this.name} auto-recovered after ${this._autoRecoverMs}ms cooldown`, undefined, this.name);
            }, this._autoRecoverMs);
        }
    }

    /**
     * Call on successful operations to reset the failure counter
     */
    protected handleSuccess(): void {
        if (this._consecutiveFailures > 0) {
            this._consecutiveFailures = 0;
        }
    }
}
