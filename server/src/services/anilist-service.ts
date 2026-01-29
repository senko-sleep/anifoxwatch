/**
 * AniList Service - Fetches accurate genre data from AniList API
 * Used for proper genre filtering and enrichment of local anime data
 */

import { AnimeBase, AnimeSearchResult } from '../types/anime.js';

interface AniListGenre {
    id: number;
    name: string;
    category?: string;
}

interface AniListMedia {
    id: number;
    idMal?: number;
    title: {
        romaji: string;
        english?: string;
        native?: string;
    };
    type: 'ANIME';
    format: 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL';
    status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED';
    description?: string;
    startDate: {
        year: number;
        month: number;
        day: number;
    };
    endDate?: {
        year: number;
        month: number;
        day: number;
    };
    season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
    seasonYear?: number;
    episodes?: number;
    duration?: number;
    averageScore?: number;
    meanScore?: number;
    genres: string[];
    tags?: Array<{
        id: number;
        name: string;
        category: string;
        rank: number;
    }>;
    studios?: {
        nodes: Array<{
            id: number;
            name: string;
        }>;
    };
    coverImage: {
        large: string;
        medium: string;
    };
    bannerImage?: string;
    isAdult: boolean;
}

interface AniListResponse {
    data: {
        Media: AniListMedia | null;
    };
}

interface AniListSearchResponse {
    data: {
        Page: {
            media: AniListMedia[];
            pageInfo: {
                currentPage: number;
                lastPage: number;
                hasNextPage: boolean;
                perPage: number;
            };
        };
    };
}

interface AniListGenreResponse {
    data: {
        GenreCollection: string[];
    };
}

/**
 * AniList API configuration
 */
const ANILIST_API_URL = 'https://graphql.anilist.co';
const ANILIST_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Mapping from AniList formats to our formats
 */
const formatMapping: Record<string, AnimeBase['type']> = {
    'TV': 'TV',
    'MOVIE': 'Movie',
    'OVA': 'OVA',
    'ONA': 'ONA',
    'SPECIAL': 'Special'
};

/**
 * Mapping from AniList status to our status
 */
const statusMapping: Record<string, AnimeBase['status']> = {
    'FINISHED': 'Completed',
    'RELEASING': 'Ongoing',
    'NOT_YET_RELEASED': 'Upcoming',
    'CANCELLED': 'Completed'
};

/**
 * Normalize genre names for matching
 */
function normalizeGenre(genre: string): string {
    return genre.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Check if two genres match (accounting for variations)
 */
function genresMatch(a: string, b: string): boolean {
    const normA = normalizeGenre(a);
    const normB = normalizeGenre(b);
    return normA === normB || normA.includes(normB) || normB.includes(normA);
}

export class AniListService {
    private cache: Map<string, { data: unknown; expires: number }> = new Map();

    /**
     * Get cached data
     */
    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.data as T;
        }
        this.cache.delete(key);
        return null;
    }

    /**
     * Set cached data
     */
    private setCache<T>(key: string, data: T, ttl: number = ANILIST_CACHE_TTL): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    /**
     * Execute a GraphQL query against AniList
     */
    private async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
        const cacheKey = `graphql:${query.substring(0, 50)}:${JSON.stringify(variables)}`;
        const cached = this.getCached<T>(cacheKey);
        if (cached) return cached;

        try {
            const response = await fetch(ANILIST_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ query, variables })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[AniList] API error: ${response.status}`, errorText);
                return null;
            }

            const data = await response.json();
            
            // Check for GraphQL errors
            if (data && typeof data === 'object' && 'errors' in data) {
                console.error('[AniList] GraphQL errors:', JSON.stringify((data as { errors: unknown }).errors));
                return null;
            }
            
            this.setCache(cacheKey, data);
            return data as T;
        } catch (error) {
            console.error('[AniList] Query failed:', error);
            return null;
        }
    }

    /**
     * Search for anime by title and get accurate genre information
     */
    async searchByTitle(title: string): Promise<AnimeBase | null> {
        const query = `
            query ($search: String) {
                Media(search: $search, type: ANIME) {
                    id
                    idMal
                    title {
                        romaji
                        english
                        native
                    }
                    type
                    format
                    status
                    description
                    startDate {
                        year
                        month
                        day
                    }
                    endDate {
                        year
                        month
                        day
                    }
                    season
                    seasonYear
                    episodes
                    duration
                    averageScore
                    genres
                    tags {
                        id
                        name
                        category
                        rank
                    }
                    studios {
                        nodes {
                            id
                            name
                        }
                    }
                    coverImage {
                        large
                        medium
                    }
                    bannerImage
                    isAdult
                }
            }
        `;

        const response = await this.query<AniListResponse>(query, { search: title });
        const media = response?.data?.Media;

        if (!media) return null;

        return this.mapToAnimeBase(media);
    }

    /**
     * Search anime by genre(s) using AniList
     * Supports single genre or multiple genres
     */
    async searchByGenre(genre: string, page: number = 1, perPage: number = 20): Promise<AnimeSearchResult> {
        // Support multiple genres (comma-separated)
        const genres = genre.split(',').map(g => g.trim()).filter(Boolean);
        const mainGenre = genres[0] || genre;
        
        // Build separate query for single vs multi-genre to avoid unused variable errors
        let query: string;
        let variables: Record<string, unknown>;
        
        if (genres.length > 1) {
            // Multiple genres - use genre_in
            query = `
                query ($genreIn: [String], $page: Int, $perPage: Int) {
                    Page(page: $page, perPage: $perPage) {
                        media(genre_in: $genreIn, type: ANIME, isAdult: false) {
                            id
                            idMal
                            title {
                                romaji
                                english
                                native
                            }
                            type
                            format
                            status
                            description
                            startDate {
                                year
                                month
                                day
                            }
                            endDate {
                                year
                                month
                                day
                            }
                            season
                            seasonYear
                            episodes
                            duration
                            averageScore
                            genres
                            tags {
                                id
                                name
                                category
                                rank
                            }
                            studios {
                                nodes {
                                    id
                                    name
                                }
                            }
                            coverImage {
                                large
                                medium
                            }
                            bannerImage
                            isAdult
                        }
                        pageInfo {
                            currentPage
                            lastPage
                            hasNextPage
                            perPage
                        }
                    }
                }
            `;
            variables = { genreIn: genres, page, perPage };
        } else {
            // Single genre - use genre
            query = `
                query ($genre: String, $page: Int, $perPage: Int) {
                    Page(page: $page, perPage: $perPage) {
                        media(genre: $genre, type: ANIME, isAdult: false) {
                            id
                            idMal
                            title {
                                romaji
                                english
                                native
                            }
                            type
                            format
                            status
                            description
                            startDate {
                                year
                                month
                                day
                            }
                            endDate {
                                year
                                month
                                day
                            }
                            season
                            seasonYear
                            episodes
                            duration
                            averageScore
                            genres
                            tags {
                                id
                                name
                                category
                                rank
                            }
                            studios {
                                nodes {
                                    id
                                    name
                                }
                            }
                            coverImage {
                                large
                                medium
                            }
                            bannerImage
                            isAdult
                        }
                        pageInfo {
                            currentPage
                            lastPage
                            hasNextPage
                            perPage
                        }
                    }
                }
            `;
            variables = { genre: mainGenre, page, perPage };
        }

        const response = await this.query<AniListSearchResponse>(query, variables);

        const pageData = response?.data?.Page;
        const media = pageData?.media || [];

        if (media.length === 0 && page === 1) {
            // Fallback: search by tag if genre not found
            return this.searchByTag(mainGenre, page, perPage);
        }

        return {
            results: media.map(m => this.mapToAnimeBase(m)),
            totalPages: pageData?.pageInfo?.lastPage || 1,
            currentPage: page,
            hasNextPage: pageData?.pageInfo?.hasNextPage || false,
            source: 'AniList'
        };
    }

    /**
     * Search anime by tag (fallback for genre searches)
     */
    async searchByTag(tag: string, page: number = 1, perPage: number = 20): Promise<AnimeSearchResult> {
        const query = `
            query ($tag: String, $page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    media(tag: $tag, type: ANIME, isAdult: false) {
                        id
                        idMal
                        title {
                            romaji
                            english
                            native
                        }
                        type
                        format
                        status
                        description
                        startDate {
                            year
                            month
                            day
                        }
                        endDate {
                            year
                            month
                            day
                        }
                        season
                        seasonYear
                        episodes
                        duration
                        averageScore
                        genres
                        tags {
                            id
                            name
                            category
                            rank
                        }
                        studios {
                            nodes {
                                id
                                name
                            }
                        }
                        coverImage {
                            large
                            medium
                        }
                        bannerImage
                        isAdult
                    }
                    pageInfo {
                        currentPage
                        lastPage
                        hasNextPage
                        perPage
                    }
                }
            }
        `;

        const response = await this.query<AniListSearchResponse>(query, { 
            tag, 
            page, 
            perPage 
        });

        const pageData = response?.data?.Page;
        const media = pageData?.media || [];

        return {
            results: media.map(m => this.mapToAnimeBase(m)),
            totalPages: pageData?.pageInfo?.lastPage || 1,
            currentPage: page,
            hasNextPage: pageData?.pageInfo?.hasNextPage || false,
            source: 'AniList'
        };
    }

    /**
     * Get genres for a specific anime by ID
     */
    async getGenresById(id: number): Promise<string[]> {
        const query = `
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    genres
                    tags {
                        name
                        rank
                    }
                }
            }
        `;

        interface GenreResponse {
            data: {
                Media: {
                    genres: string[];
                    tags: Array<{ name: string; rank: number }>;
                } | null;
            };
        }

        const response = await this.query<GenreResponse>(query, { id });
        const media = response?.data?.Media;

        if (!media) return [];

        // Combine genres and high-ranking tags
        const tags = media.tags
            ?.filter(t => t.rank >= 50)
            .map(t => t.name) || [];

        return [...media.genres, ...tags];
    }

    /**
     * Enrich local anime with AniList genre data
     */
    async enrichWithGenres(anime: AnimeBase): Promise<AnimeBase> {
        // Try to extract ID from the anime ID
        const idMatch = anime.id.match(/(\d+)$/);
        if (!idMatch) {
            // Fallback: search by title
            const anilistData = await this.searchByTitle(anime.title);
            if (anilistData && anilistData.genres.length > 0) {
                return {
                    ...anime,
                    genres: anilistData.genres
                };
            }
            return anime;
        }

        const malId = parseInt(idMatch[1], 10);
        const genres = await this.getGenresById(malId);

        if (genres.length > 0) {
            return {
                ...anime,
                genres
            };
        }

        return anime;
    }

    /**
     * Enrich multiple anime with AniList genre data
     */
    async enrichBatchWithGenres(animeList: AnimeBase[]): Promise<AnimeBase[]> {
        const enriched: AnimeBase[] = [];

        for (const anime of animeList) {
            const enrichedAnime = await this.enrichWithGenres(anime);
            enriched.push(enrichedAnime);
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return enriched;
    }

    /**
     * Check if an anime matches the given genres
     */
    async matchesGenre(anime: AnimeBase, genre: string): Promise<boolean> {
        // First check local genres
        if (anime.genres && anime.genres.some(g => genresMatch(g, genre))) {
            return true;
        }

        // Enrich with AniList data and check again
        const enriched = await this.enrichWithGenres(anime);
        return enriched.genres.some(g => genresMatch(g, genre));
    }

    /**
     * Get all available genres from AniList
     */
    async getGenreCollection(): Promise<string[]> {
        const query = `
            query {
                GenreCollection
            }
        `;

        interface CollectionResponse {
            data: {
                GenreCollection: string[];
            };
        }

        const response = await this.query<CollectionResponse>(query);
        return response?.data?.GenreCollection || [];
    }

    /**
     * Map AniList media to our AnimeBase format
     */
    private mapToAnimeBase(media: AniListMedia): AnimeBase {
        return {
            id: `anilist-${media.id}`,
            title: media.title.english || media.title.romaji,
            titleJapanese: media.title.native,
            image: media.coverImage.large || media.coverImage.medium,
            cover: media.coverImage.large || media.coverImage.medium,
            banner: media.bannerImage,
            description: media.description?.replace(/<[^>]*>/g, '').trim() || 'No description available.',
            type: formatMapping[media.format] || 'TV',
            status: statusMapping[media.status] || 'Completed',
            rating: media.averageScore,
            episodes: media.episodes || 0,
            duration: media.duration ? `${media.duration}m` : undefined,
            genres: media.genres,
            studios: media.studios?.nodes.map(s => s.name) || [],
            season: media.season?.toLowerCase(),
            year: media.startDate.year,
            subCount: media.episodes,
            dubCount: 0,
            isMature: media.isAdult,
            source: 'AniList'
        };
    }
}

export const anilistService = new AniListService();
