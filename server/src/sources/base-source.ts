import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { logger } from '../utils/logger.js';

/**
 * Extended interface for sources that support genre-specific fetching
 */
export interface GenreAwareSource extends AnimeSource {
    getByGenre(genre: string, page?: number): Promise<AnimeSearchResult>;
    getGenres(): Promise<string[]>;
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
    healthCheck(): Promise<boolean>;

    // Search
    search(query: string, page?: number, filters?: any): Promise<AnimeSearchResult>;

    // Get anime details
    getAnime(id: string): Promise<AnimeBase | null>;

    // Get episodes
    getEpisodes(animeId: string): Promise<Episode[]>;

    // Get trending/popular anime
    getTrending(page?: number): Promise<AnimeBase[]>;

    // Get latest anime
    getLatest(page?: number): Promise<AnimeBase[]>;

    // Get top rated anime
    getTopRated(page?: number, limit?: number): Promise<TopAnime[]>;
}

/**
 * Abstract base class with common functionality
 */
export abstract class BaseAnimeSource implements AnimeSource {
    abstract name: string;
    abstract baseUrl: string;
    isAvailable: boolean = true;

    abstract healthCheck(): Promise<boolean>;
    abstract search(query: string, page?: number, filters?: any): Promise<AnimeSearchResult>;
    abstract getAnime(id: string): Promise<AnimeBase | null>;
    abstract getEpisodes(animeId: string): Promise<Episode[]>;
    abstract getTrending(page?: number): Promise<AnimeBase[]>;
    abstract getLatest(page?: number): Promise<AnimeBase[]>;
    abstract getTopRated(page?: number, limit?: number): Promise<TopAnime[]>;

    protected handleError(error: unknown, operation: string): void {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error during ${operation}`, err, { operation }, this.name);
        this.isAvailable = false;
    }
}
