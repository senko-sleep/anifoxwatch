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
    trending?: number;
    popularity?: number;
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
                total: number;
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

const GENRE_MAPPINGS: Record<string, string> = {
    'Yuri': 'Girls\' Love',
    'Yaoi': 'Boys\' Love',
    'Shounen Ai': 'Boys\' Love',
    'Shoujo Ai': 'Girls\' Love'
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
     * Handles rate limiting by returning stale cache if available
     */
    private async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
        const cacheKey = `graphql:${query.substring(0, 50)}:${JSON.stringify(variables)}`;
        const cached = this.getCached<T>(cacheKey);
        if (cached) return cached;

        // Also check for stale cache (expired but still usable as fallback)
        const staleEntry = this.cache.get(cacheKey);
        const staleData = staleEntry?.data as T | undefined;

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
                // On rate limit (429), return stale cache if available
                if (response.status === 429 && staleData) {
                    console.log('[AniList] Rate limited, using stale cache');
                    return staleData;
                }
                return null;
            }

            const data = await response.json();

            // Check for GraphQL errors (including rate limit errors in response body)
            if (data && typeof data === 'object' && 'errors' in data) {
                const errors = (data as { errors: Array<{ status?: number; message?: string }> }).errors;
                const isRateLimited = errors.some(e => e.status === 429 || e.message?.includes('Too Many Requests'));
                if (isRateLimited && staleData) {
                    console.log('[AniList] Rate limited (GraphQL error), using stale cache');
                    return staleData;
                }
                console.error('[AniList] GraphQL errors:', JSON.stringify(errors));
                return staleData || null;
            }

            this.setCache(cacheKey, data);
            return data as T;
        } catch (error) {
            console.error('[AniList] Query failed:', error);
            // Return stale cache on network errors
            if (staleData) {
                console.log('[AniList] Network error, using stale cache');
                return staleData;
            }
            return null;
        }
    }

    /**
     * Advanced search for anime with multiple filters
     */
    async advancedSearch(filters: {
        page?: number;
        perPage?: number;
        sort?: string[];
        type?: string;
        status?: string;
        season?: string;
        year?: number;
        yearGreater?: number;
        yearLesser?: number;
        format?: string;
        genres?: string[];
    }): Promise<AnimeSearchResult> {
        const page = filters.page || 1;
        const perPage = filters.perPage || 20;

        let queryArgs = '$page: Int, $perPage: Int';
        let queryBodyArgs = 'page: $page, perPage: $perPage';
        let mediaArgs = 'type: ANIME, isAdult: false'; // Default no adult for general browse

        const variables: any = { page, perPage };

        // Sort
        if (filters.sort && filters.sort.length > 0) {
            queryArgs += ', $sort: [MediaSort]';
            mediaArgs += ', sort: $sort';
            variables.sort = filters.sort;
        }

        // Format/Type
        if (filters.format || filters.type) {
            queryArgs += ', $format: MediaFormat';
            mediaArgs += ', format: $format';

            // Map types if needed
            const type = (filters.format || filters.type || '').toUpperCase();
            const typeMap: Record<string, string> = {
                'TV': 'TV', 'MOVIE': 'MOVIE', 'OVA': 'OVA', 'ONA': 'ONA', 'SPECIAL': 'SPECIAL',
                'MOVI': 'MOVIE', 'Specials': 'SPECIAL'
            };
            variables.format = typeMap[type] || type;
        }

        // Status
        if (filters.status) {
            queryArgs += ', $status: MediaStatus';
            mediaArgs += ', status: $status';
            const status = filters.status.toUpperCase();
            const statusMap: Record<string, string> = {
                'ONGOING': 'RELEASING', 'COMPLETED': 'FINISHED', 'UPCOMING': 'NOT_YET_RELEASED'
            };
            variables.status = statusMap[status] || status;
        }

        // Season
        if (filters.season) {
            queryArgs += ', $season: MediaSeason';
            mediaArgs += ', season: $season';
            variables.season = filters.season;
        }

        // Year
        if (filters.year) {
            queryArgs += ', $year: Int';
            mediaArgs += ', seasonYear: $year';
            variables.year = filters.year;
        }

        // Year Range
        if (filters.yearGreater) {
            queryArgs += ', $yearGreater: Int';
            mediaArgs += ', startDate_greater: $yearGreater';
            variables.yearGreater = filters.yearGreater * 10000; // YYYY0000
        }
        if (filters.yearLesser) {
            queryArgs += ', $yearLesser: Int';
            mediaArgs += ', startDate_lesser: $yearLesser';
            variables.yearLesser = filters.yearLesser * 10000 + 1231; // YYYY1231
        }

        // Genres
        if (filters.genres && filters.genres.length > 0) {
            if (filters.genres.length === 1) {
                queryArgs += ', $genre: String';
                mediaArgs += ', genre: $genre';
                variables.genre = filters.genres[0];
            } else {
                queryArgs += ', $genreIn: [String]';
                mediaArgs += ', genre_in: $genreIn';
                variables.genreIn = filters.genres;
            }
        }

        const query = `
            query (${queryArgs}) {
                Page(${queryBodyArgs}) {
                    media(${mediaArgs}) {
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
                        episodes
                        duration
                        averageScore
                        genres
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
                        total
                        perPage
                    }
                }
            }
        `;

        const response = await this.query<AniListSearchResponse>(query, variables);
        const pageData = response?.data?.Page;
        const media = pageData?.media || [];

        return {
            results: media.map(m => this.mapToAnimeBase(m)),
            totalPages: pageData?.pageInfo?.lastPage || 1,
            currentPage: page,
            hasNextPage: pageData?.pageInfo?.hasNextPage || false,
            totalResults: pageData?.pageInfo?.total || 0,
            source: 'AniList'
        };
    }

    /**
     * Search for anime by title and get accurate genre information
     */
    async searchByTitle(title: string, isAdult: boolean = false): Promise<AnimeBase | null> {
        const query = `
            query ($search: String, $isAdult: Boolean) {
                Media(search: $search, type: ANIME, isAdult: $isAdult) {
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

        const response = await this.query<AniListResponse>(query, { search: title, isAdult });
        const media = response?.data?.Media;

        if (!media) return null;

        return this.mapToAnimeBase(media);
    }

    /**
     * Search anime by genre(s) using AniList
     * Supports single genre or multiple genres
     * Note: Adult content is allowed for genres like Yuri, Yaoi
     */
    async searchByGenre(genre: string, page: number = 1, perPage: number = 20, filters?: { type?: string; status?: string; year?: number; isAdult?: boolean }): Promise<AnimeSearchResult> {
        // Map genres using GENRE_MAPPINGS
        const rawGenres = genre.split(',').map(g => g.trim()).filter(Boolean);
        const genres = rawGenres.map(g => GENRE_MAPPINGS[g] || g);
        const mainGenre = genres[0];

        // Check if any raw genre implies adult content
        const adultGenres = ['Yuri', 'Yaoi', 'Shounen Ai', 'Shoujo Ai', 'Girls Love', 'Boys Love', 'BL', 'GL', 'Hentai', 'Ecchi'];
        const isAdultContent = rawGenres.some(g => adultGenres.some(ag => g.toLowerCase().includes(ag.toLowerCase())));

        let queryArgs = '$page: Int, $perPage: Int';
        let queryBodyArgs = 'page: $page, perPage: $perPage';
        let mediaArgs = 'type: ANIME';

        // Add isAdult argument - allow adult content for adult genres
        const allowAdult = filters?.isAdult !== undefined ? filters.isAdult : isAdultContent;
        queryArgs += ', $isAdult: Boolean';
        mediaArgs += ', isAdult: $isAdult';

        if (genres.length > 1) {
            queryArgs += ', $genreIn: [String]';
            mediaArgs += ', genre_in: $genreIn';
        } else {
            queryArgs += ', $genre: String';
            mediaArgs += ', genre: $genre';
        }

        // Add additional filters
        if (filters?.type) {
            queryArgs += ', $format: MediaFormat';
            mediaArgs += ', format: $format';
        }
        if (filters?.status) {
            queryArgs += ', $status: MediaStatus';
            mediaArgs += ', status: $status';
        }
        if (filters?.year) {
            queryArgs += ', $year: Int';
            mediaArgs += ', seasonYear: $year';
        }

        const query = `
            query (${queryArgs}) {
                Page(${queryBodyArgs}) {
                    media(${mediaArgs}) {
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

        const variables: any = { page, perPage };
        variables.isAdult = allowAdult;

        if (genres.length > 1) {
            variables.genreIn = genres;
        } else {
            variables.genre = mainGenre;
        }

        if (filters?.type) {
            // Reverse map type to AniList format
            const typeMap: Record<string, string> = { 'TV': 'TV', 'Movie': 'MOVIE', 'OVA': 'OVA', 'ONA': 'ONA', 'Special': 'SPECIAL' };
            variables.format = typeMap[filters.type] || undefined;
        }
        if (filters?.status) {
            // Reverse map status
            const statusMap: Record<string, string> = { 'Ongoing': 'RELEASING', 'Completed': 'FINISHED', 'Upcoming': 'NOT_YET_RELEASED' };
            variables.status = statusMap[filters.status] || undefined;
        }
        if (filters?.year) {
            variables.year = filters.year;
        }

        const response = await this.query<AniListSearchResponse>(query, variables);

        const pageData = response?.data?.Page;
        const media = pageData?.media || [];

        if (media.length === 0 && page === 1 && !filters) {
            // Fallback: search by tag if genre not found (only if no other filters applied)
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
     * Note: Adult content is allowed for specific tags
     */
    async searchByTag(tag: string, page: number = 1, perPage: number = 20): Promise<AnimeSearchResult> {
        // Allow adult content for specific tags
        const adultTags = ['Yuri', 'Yaoi', 'Girls Love', 'Boys Love', 'BL', 'GL', 'Shoujo Ai', 'Shounen Ai'];
        const allowAdult = adultTags.some(t =>
            tag.toLowerCase().includes(t.toLowerCase())
        );

        const query = `
            query ($tag: String, $page: Int, $perPage: Int, $isAdult: Boolean) {
                Page(page: $page, perPage: $perPage) {
                    media(tag: $tag, type: ANIME, isAdult: $isAdult) {
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
            perPage,
            isAdult: allowAdult
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
     * Get full anime data by AniList ID
     */
    async getAnimeById(id: number): Promise<AnimeBase | null> {
        const query = `
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
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

        interface MediaResponse {
            data: {
                Media: AniListMedia | null;
            };
        }

        const response = await this.query<MediaResponse>(query, { id });
        const media = response?.data?.Media;

        if (!media) return null;

        return this.mapToAnimeBase(media);
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
     * Get airing schedule for a specific time range with date parameters
     * Returns anime episodes airing within the given time range
     * @param startDate ISO 8601 format start date
     * @param endDate ISO 8601 format end date
     * @param page Page number for pagination
     * @param perPage Items per page
     */
    async getAiringSchedule(startDate?: string, endDate?: string, page: number = 1, perPage: number = 50): Promise<{
        schedule: Array<{
            id: number;
            title: string;
            episode: number;
            airingAt: number;
            media: {
                thumbnail: string;
                format: string;
                genres: string[];
            };
        }>;
        hasNextPage: boolean;
        pageInfo: {
            currentPage: number;
            totalCount: number;
        };
    }> {
        // Parse dates or default to current week (Monday to Sunday)
        const now = new Date();
        const start = startDate ? new Date(startDate) : new Date(now);
        const end = endDate ? new Date(endDate) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // If using default (no startDate provided), default to start of current week (Monday)
        if (!startDate) {
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            start.setDate(now.getDate() - diff);
            start.setHours(0, 0, 0, 0);
        }

        // If using default (no endDate provided), default to end of current week (Sunday)
        if (!endDate) {
            const dayOfWeek = start.getDay();
            const daysUntilSunday = 7 - dayOfWeek;
            end.setTime(start.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000);
            end.setHours(23, 59, 59, 999);
        }

        const startTimestamp = Math.floor(start.getTime() / 1000);
        const endTimestamp = Math.floor(end.getTime() / 1000);

        const query = `
            query ($page: Int, $perPage: Int, $airingAtGreater: Int, $airingAtLesser: Int) {
                Page(page: $page, perPage: $perPage) {
                    airingSchedules(airingAt_greater: $airingAtGreater, airingAt_lesser: $airingAtLesser, sort: TIME) {
                        id
                        episode
                        airingAt
                        media {
                            id
                            title {
                                romaji
                                english
                            }
                            format
                            genres
                            coverImage {
                                large
                                medium
                            }
                        }
                    }
                    pageInfo {
                        currentPage
                        lastPage
                        hasNextPage
                        total
                    }
                }
            }
        `;

        interface ScheduleResponse {
            data: {
                Page: {
                    airingSchedules: Array<{
                        id: number;
                        episode: number;
                        airingAt: number;
                        media: {
                            id: number;
                            title: {
                                romaji: string;
                                english?: string;
                            };
                            format: string;
                            genres: string[];
                            coverImage: {
                                large: string;
                                medium: string;
                            };
                        };
                    }>;
                    pageInfo: {
                        currentPage: number;
                        lastPage: number;
                        hasNextPage: boolean;
                        total: number;
                    };
                };
            };
        }

        const response = await this.query<ScheduleResponse>(query, {
            page,
            perPage,
            airingAtGreater: startTimestamp,
            airingAtLesser: endTimestamp
        });

        const schedules = response?.data?.Page?.airingSchedules || [];
        const pageInfo = response?.data?.Page?.pageInfo;

        return {
            schedule: schedules.map(s => ({
                id: s.id,
                title: s.media.title.english || s.media.title.romaji,
                episode: s.episode,
                airingAt: s.airingAt,
                media: {
                    thumbnail: s.media.coverImage.large || s.media.coverImage.medium,
                    format: s.media.format,
                    genres: s.media.genres
                }
            })),
            hasNextPage: pageInfo?.hasNextPage || false,
            pageInfo: {
                currentPage: pageInfo?.currentPage || page,
                totalCount: pageInfo?.total || 0
            }
        };
    }

    /**
     * Get trending anime this week (sorted by trending score)
     * Fetches anime with high trending score
     * @param page Page number for pagination
     * @param perPage Items per page
     */
    async getTrendingThisWeek(page: number = 1, perPage: number = 10): Promise<{
        results: AnimeBase[];
        pageInfo: {
            hasNextPage: boolean;
            currentPage: number;
            totalCount: number;
        };
    }> {
        const query = `
            query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    media(
                        type: ANIME
                        sort: TRENDING_DESC
                        status_in: [RELEASING, FINISHED]
                    ) {
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
                        episodes
                        duration
                        averageScore
                        trending
                        popularity
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
                        total
                    }
                }
            }
        `;

        interface TrendingResponse {
            data: {
                Page: {
                    media: AniListMedia[];
                    pageInfo: {
                        currentPage: number;
                        lastPage: number;
                        hasNextPage: boolean;
                        perPage: number;
                        total: number;
                    };
                };
            };
        }

        const response = await this.query<TrendingResponse>(query, {
            page,
            perPage
        });

        const pageData = response?.data?.Page;
        const media = pageData?.media || [];

        return {
            results: media.map(m => this.mapToAnimeBase(m)),
            pageInfo: {
                hasNextPage: pageData?.pageInfo?.hasNextPage || false,
                currentPage: pageData?.pageInfo?.currentPage || page,
                totalCount: pageData?.pageInfo?.total || media.length
            }
        };
    }

    /**
     * Get seasonal anime for a specific year and season
     * If not provided, uses current season with fallback to Winter
     * Returns anime sorted by popularity with enhanced metadata
     */
    async getSeasonalAnime(year?: number, season?: string, page: number = 1, perPage: number = 25): Promise<{
        results: AnimeBase[];
        pageInfo: {
            hasNextPage: boolean;
            currentPage: number;
            totalCount: number;
        };
        seasonInfo: {
            year: number;
            season: string;
        };
    }> {
        // Determine current season if not provided with fallback to Winter
        const now = new Date();
        const currentYear = year || now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        let currentSeason = season?.toUpperCase();
        if (!currentSeason) {
            if (currentMonth >= 1 && currentMonth <= 3) currentSeason = 'WINTER';
            else if (currentMonth >= 4 && currentMonth <= 6) currentSeason = 'SPRING';
            else if (currentMonth >= 7 && currentMonth <= 9) currentSeason = 'SUMMER';
            else currentSeason = 'FALL';
        }

        const query = `
            query ($page: Int, $perPage: Int, $season: MediaSeason, $year: Int) {
                Page(page: $page, perPage: $perPage) {
                    media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC) {
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
                        episodes
                        duration
                        averageScore
                        popularity
                        season
                        seasonYear
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
                        total
                    }
                }
            }
        `;

        interface SeasonalResponse {
            data: {
                Page: {
                    media: AniListMedia[];
                    pageInfo: {
                        currentPage: number;
                        lastPage: number;
                        hasNextPage: boolean;
                        perPage: number;
                        total: number;
                    };
                };
            };
        }

        const response = await this.query<SeasonalResponse>(query, {
            page,
            perPage,
            season: currentSeason,
            year: currentYear
        });

        const pageData = response?.data?.Page;
        const media = pageData?.media || [];

        return {
            results: media.map(m => this.mapToAnimeBase(m)),
            pageInfo: {
                hasNextPage: pageData?.pageInfo?.hasNextPage || false,
                currentPage: pageData?.pageInfo?.currentPage || page,
                totalCount: pageData?.pageInfo?.total || 0
            },
            seasonInfo: {
                year: currentYear,
                season: currentSeason.toLowerCase()
            }
        };
    }

    /**
     * Get top rated anime with minimum rating threshold and vote count
     * Returns anime with consistently high ratings sorted by score descending
     * @param minimumRating Minimum average score threshold (default: 75)
     * @param page Page number for pagination
     * @param perPage Items per page
     */
    async getTopRated(minimumRating: number = 75, page: number = 1, perPage: number = 10): Promise<{
        results: AnimeBase[];
        pageInfo: {
            hasNextPage: boolean;
            currentPage: number;
            totalCount: number;
        };
    }> {
        const query = `
            query ($page: Int, $perPage: Int, $minRating: Int, $minVotes: Int) {
                Page(page: $page, perPage: $perPage) {
                    media(
                        type: ANIME
                        sort: SCORE_DESC
                        averageScore_greater: $minRating
                        popularity_greater: $minVotes
                        status_in: [FINISHED, RELEASING]
                    ) {
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
                        episodes
                        duration
                        averageScore
                        popularity
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
                        total
                    }
                }
            }
        `;

        interface TopRatedResponse {
            data: {
                Page: {
                    media: AniListMedia[];
                    pageInfo: {
                        currentPage: number;
                        lastPage: number;
                        hasNextPage: boolean;
                        perPage: number;
                        total: number;
                    };
                };
            };
        }

        const response = await this.query<TopRatedResponse>(query, {
            page,
            perPage,
            minRating: minimumRating,
            minVotes: 500 // Minimum 500 votes for statistical significance
        });

        const pageData = response?.data?.Page;
        const media = pageData?.media || [];

        return {
            results: media.filter(m => m.averageScore != null).map(m => this.mapToAnimeBase(m)),
            pageInfo: {
                hasNextPage: pageData?.pageInfo?.hasNextPage || false,
                currentPage: pageData?.pageInfo?.currentPage || page,
                totalCount: pageData?.pageInfo?.total || 0
            }
        };
    }

    /**
     * Get top rated anime of all time (for leaderboard - backward compatibility)
     */
    async getTopRatedAnime(page: number = 1, perPage: number = 10): Promise<AnimeSearchResult> {
        const query = `
            query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    media(type: ANIME, sort: SCORE_DESC, averageScore_greater: 70) {
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
                        episodes
                        duration
                        averageScore
                        popularity
                        genres
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

        const response = await this.query<AniListSearchResponse>(query, { page, perPage });
        const pageData = response?.data?.Page;
        const media = pageData?.media || [];

        return {
            results: media.filter(m => m.averageScore != null).map(m => this.mapToAnimeBase(m)),
            totalPages: pageData?.pageInfo?.lastPage || 1,
            currentPage: page,
            hasNextPage: pageData?.pageInfo?.hasNextPage || false,
            source: 'AniList'
        };
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
