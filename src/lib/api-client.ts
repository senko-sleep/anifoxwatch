import { Anime, TopAnime, AnimeSearchResult, Episode } from '@/types/anime';
import { getApiConfig } from './api-config';

interface BrowseFilters {
    type?: string;
    genre?: string;
    status?: string;
    year?: number;
    startYear?: number;
    endYear?: number;
    sort?: 'popularity' | 'trending' | 'recently_released' | 'shuffle' | 'rating' | 'year' | 'title';
    order?: 'asc' | 'desc';
    source?: string;
    mode?: 'safe' | 'mixed' | 'adult';
}

// Use API configuration from api-config.ts
const API_BASE_URL = getApiConfig().baseUrl;

// Streaming types
export interface VideoSource {
    url: string;
    quality: '360p' | '480p' | '720p' | '1080p' | 'auto' | 'default';
    isM3U8: boolean;
    isDASH?: boolean;
}

export interface VideoSubtitle {
    url: string;
    lang: string;
    label?: string;
}

export interface StreamingData {
    sources: VideoSource[];
    subtitles: VideoSubtitle[];
    headers?: Record<string, string>;
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
    source: string;
}

export interface EpisodeServer {
    name: string;
    url: string;
    type: 'sub' | 'dub' | 'raw';
}

export interface SourceHealth {
    name: string;
    status: 'online' | 'offline' | 'degraded';
    latency?: number;
    lastCheck: string;
}

interface ApiResponse<T> {
    results?: T[];
    source?: string;
    error?: string;
}

interface CacheEntry<T = unknown> {
    data: T;
    expires: number;
}

// Enhanced Schedule types with date range support
export interface ScheduleItem {
    id: number;
    title: string;
    episode: number;
    airingAt: number;
    media: {
        thumbnail: string;
        format: string;
        genres: string[];
    };
}

export interface ScheduleResponse {
    schedule: (ScheduleItem & { countdown: number; timeUntilAiring: number })[];
    groupedByDay: Record<string, ScheduleItem[]>;
    metadata: {
        totalShows: number;
        dateRange: {
            start: string;
            end: string;
        };
        pageInfo: {
            currentPage: number;
            totalCount: number;
        };
    };
    hasNextPage: boolean;
    currentPage: number;
}

// Enhanced Leaderboard types with movement indicators
export interface LeaderboardResponse {
    results: Anime[];
    pageInfo: {
        hasNextPage: boolean;
        currentPage: number;
        totalPages: number;
    };
    type: 'trending' | 'top-rated';
    source: string;
}

// Enhanced Seasonal types with pagination metadata
export interface SeasonalResponse {
    results: Anime[];
    pageInfo: {
        hasNextPage: boolean;
        currentPage: number;
        totalPages: number;
        totalItems: number;
    };
    seasonInfo: {
        year: number;
        season: string;
    };
    source: string;
}


class AnimeApiClient {
    private baseUrl: string;
    private cache: Map<string, CacheEntry<unknown>> = new Map();
    private inflight: Map<string, Promise<unknown>> = new Map();
    private readonly MAX_RETRIES = 3;
    private readonly TIMEOUT_MS = 30000;
    private _online = true;
    private _lastOnlineCheck = 0;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => { this._online = true; });
            window.addEventListener('offline', () => { this._online = false; });
            this._online = navigator.onLine;
        }
    }

    get isOnline(): boolean {
        return this._online;
    }

    /**
     * Execute fetch with retry logic, timeout, and request deduplication
     */
    private async fetchWithRetry<T>(
        endpoint: string,
        options?: RequestInit,
        retries: number = this.MAX_RETRIES
    ): Promise<T> {
        const isGet = !options?.method || options.method === 'GET';

        // Check cache first for GET requests
        if (isGet) {
            const cacheKey = endpoint;
            const cached = this.cache.get(cacheKey);
            if (cached && cached.expires > Date.now()) {
                return cached.data as T;
            }

            // Deduplicate in-flight GET requests
            const existing = this.inflight.get(cacheKey);
            if (existing) {
                return existing as Promise<T>;
            }
        }

        // Fail fast if offline
        if (!this._online) {
            throw new Error('You appear to be offline. Please check your connection.');
        }

        const promise = this._doFetch<T>(endpoint, options, retries);

        // Track in-flight GET requests for deduplication
        if (isGet) {
            this.inflight.set(endpoint, promise);
            promise.finally(() => this.inflight.delete(endpoint));
        }

        return promise;
    }

    private async _doFetch<T>(
        endpoint: string,
        options?: RequestInit,
        retries: number = this.MAX_RETRIES
    ): Promise<T> {
        const isGet = !options?.method || options.method === 'GET';
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

            try {
                const response = await fetch(`${this.baseUrl}${endpoint}`, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        ...options?.headers
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage = `API Error: ${response.status} ${response.statusText}`;

                    try {
                        const errorData = JSON.parse(errorText);
                        if (errorData.error) {
                            errorMessage = errorData.error;
                        }
                    } catch {
                        // Ignore JSON parse errors
                    }

                    const err = Object.assign(new Error(errorMessage), { status: response.status });

                    // Retry on 5xx server errors
                    if (response.status >= 500 && attempt < retries) {
                        lastError = err;
                        const delay = Math.min(Math.pow(2, attempt) * 1000, 4000);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw err;
                }

                const data = await response.json();

                // Cache with endpoint-aware TTL
                if (isGet) {
                    const ttl = this.getCacheTTL(endpoint);
                    this.cache.set(endpoint, { data, expires: Date.now() + ttl } as CacheEntry<T>);
                }

                this._online = true;
                return data;
            } catch (error) {
                clearTimeout(timeoutId);
                lastError = error as Error;

                if (lastError.name === 'AbortError') {
                    throw new Error('Request timeout - please try again');
                }

                // Retry on network errors and server errors
                const isRetryable = attempt < retries && (
                    lastError.message.includes('network') ||
                    lastError.message.includes('Failed to fetch') ||
                    lastError.message.includes('timeout') ||
                    lastError.message.includes('502') ||
                    lastError.message.includes('503') ||
                    lastError.message.includes('504')
                );

                if (isRetryable) {
                    const delay = Math.min(Math.pow(2, attempt) * 1000, 4000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                throw lastError;
            }
        }

        throw lastError || new Error('Unknown error');
    }

    /**
     * Get cache TTL based on endpoint type
     */
    private getCacheTTL(endpoint: string): number {
        if (endpoint.includes('/stream/')) return 3 * 60 * 1000; // 3 min for streams
        if (endpoint.includes('/trending') || endpoint.includes('/latest')) return 5 * 60 * 1000; // 5 min
        if (endpoint.includes('/top-rated') || endpoint.includes('/seasonal')) return 15 * 60 * 1000; // 15 min
        if (endpoint.includes('/schedule')) return 5 * 60 * 1000; // 5 min
        if (endpoint.includes('/sources')) return 30 * 1000; // 30s for health
        if (endpoint.includes('/anime?id=') || endpoint.includes('/episodes')) return 10 * 60 * 1000; // 10 min
        return 2 * 60 * 1000; // default 2 min
    }

    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        return this.fetchWithRetry<T>(endpoint, options);
    }

    // Clear cache for fresh data
    clearCache(): void {
        this.cache.clear();
        this.inflight.clear();
    }

    // ============ ANIME ENDPOINTS ============

    async search(query: string, page: number = 1, source?: string, mode: 'safe' | 'mixed' | 'adult' = 'safe'): Promise<AnimeSearchResult> {
        const params = new URLSearchParams({ q: query, page: String(page) });
        if (source) params.append('source', source);
        if (mode) params.append('mode', mode);
        return this.fetch<AnimeSearchResult>(`/api/anime/search?${params}`);
    }

    async searchAll(query: string, page: number = 1): Promise<{ results: Anime[]; sources: string[] }> {
        const params = new URLSearchParams({ q: query, page: String(page) });
        return this.fetch(`/api/anime/search-all?${params}`);
    }

    async getTrending(page: number = 1, source?: string, limit?: number): Promise<Anime[]> {
        const params = new URLSearchParams({ page: String(page) });
        if (source) params.append('source', source);
        if (limit) params.append('limit', String(limit));
        const response = await this.fetch<ApiResponse<Anime>>(`/api/anime/trending?${params}`);
        return response.results || [];
    }

    async getLatest(page: number = 1, source?: string): Promise<Anime[]> {
        const params = new URLSearchParams({ page: String(page) });
        if (source) params.append('source', source);
        const response = await this.fetch<ApiResponse<Anime>>(`/api/anime/latest?${params}`);
        return response.results || [];
    }

    async getTopRated(page: number = 1, limit: number = 10, source?: string): Promise<TopAnime[]> {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (source) params.append('source', source);
        const response = await this.fetch<{ results: TopAnime[] }>(`/api/anime/top-rated?${params}`);
        return response.results || [];
    }

    async getAnimeByGenre(genre: string, page: number = 1, source?: string): Promise<AnimeSearchResult> {
        const params = new URLSearchParams({ page: String(page) });
        if (source) params.append('source', source);
        return this.fetch<AnimeSearchResult>(`/api/anime/genre/${encodeURIComponent(genre)}?${params}`);
    }

    async getAnimeByGenreAniList(genre: string, page: number = 1): Promise<AnimeSearchResult> {
        const params = new URLSearchParams({ page: String(page) });
        return this.fetch<AnimeSearchResult>(`/api/anime/genre-anilist/${encodeURIComponent(genre)}?${params}`);
    }

    async filterAnime(filters: Partial<BrowseFilters>, page: number = 1): Promise<AnimeSearchResult> {
        const params = new URLSearchParams({ page: String(page) });
        
        if (filters.type) params.append('type', filters.type);
        if (filters.genre) params.append('genre', filters.genre);
        if (filters.status) params.append('status', filters.status);
        if (filters.year) params.append('year', String(filters.year));
        if (filters.sort) params.append('sort', filters.sort);
        if (filters.order) params.append('order', filters.order);
        if (filters.source) params.append('source', filters.source);

        return this.fetch<AnimeSearchResult>(`/api/anime/filter?${params}`);
    }

    async browseAnime(filters: BrowseFilters, page: number = 1, bypassCache: boolean = false, limit: number = 25): Promise<AnimeSearchResult> {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });

        if (filters.type) params.append('type', filters.type);
        if (filters.genre) params.append('genre', filters.genre);
        if (filters.status) params.append('status', filters.status);
        if (filters.year) params.append('year', String(filters.year));
        if (filters.startYear) params.append('startYear', String(filters.startYear));
        if (filters.endYear) params.append('endYear', String(filters.endYear));
        if (filters.sort) params.append('sort', filters.sort);
        if (filters.order) params.append('order', filters.order);
        if (filters.source) params.append('source', filters.source);
        if (filters.mode) params.append('mode', filters.mode);

        // Add cache-busting timestamp for shuffle requests
        if (bypassCache || filters.sort === 'shuffle') {
            params.append('_t', String(Date.now()));
        }

        return this.fetch<AnimeSearchResult>(`/api/anime/browse?${params}`);
    }

    async getRandomAnime(source?: string): Promise<Anime | null> {
        try {
            const params = new URLSearchParams();
            if (source) params.append('source', source);
            const queryString = params.toString() ? `?${params.toString()}` : '';
            return await this.fetch<Anime>(`/api/anime/random${queryString}`);
        } catch {
            return null;
        }
    }

    async getAnime(id: string): Promise<Anime | null> {
        try {
            return await this.fetch<Anime>(`/api/anime?id=${encodeURIComponent(id)}`);
        } catch {
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const response = await this.fetch<{ episodes: Episode[] }>(
            `/api/anime/episodes?id=${encodeURIComponent(animeId)}`
        );
        return response.episodes || [];
    }

    // ============ SCHEDULE & LEADERBOARD ENDPOINTS ============

    async getSchedule(startDate?: string, endDate?: string, page: number = 1): Promise<ScheduleResponse> {
        const params = new URLSearchParams({ page: String(page) });
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        return this.fetch<ScheduleResponse>(`/api/anime/schedule?${params}`);
    }

    async getLeaderboard(type: 'trending' | 'top-rated' = 'trending', page: number = 1): Promise<LeaderboardResponse> {
        const params = new URLSearchParams({ type, page: String(page) });
        return this.fetch<LeaderboardResponse>(`/api/anime/leaderboard?${params}`);
    }

    async getSeasonal(year?: number, season?: string, page: number = 1): Promise<SeasonalResponse> {
        const params = new URLSearchParams({ page: String(page) });
        if (year) params.append('year', String(year));
        if (season) params.append('season', season);
        return this.fetch<SeasonalResponse>(`/api/anime/seasonal?${params}`);
    }

    // ============ STREAMING ENDPOINTS ============

    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const response = await this.fetch<{ servers: EpisodeServer[] }>(
            `/api/stream/servers/${encodeURIComponent(episodeId)}`
        );
        return response.servers || [];
    }

    async getStreamingLinks(episodeId: string, server?: string, category?: string): Promise<StreamingData> {
        const params = new URLSearchParams();
        if (server) params.append('server', server);
        if (category) params.append('category', category);

        const queryString = params.toString() ? `?${params.toString()}` : '';

        console.log(`[API] 📺 Fetching stream for episode: ${episodeId}`, { server, category });

        try {
            const data = await this.fetch<StreamingData>(
                `/api/stream/watch/${encodeURIComponent(episodeId)}${queryString}`
            );

            console.log(`[API] ✅ Stream received:`, {
                sources: data.sources?.length || 0,
                qualities: data.sources?.map(s => s.quality).join(', '),
                subtitles: data.subtitles?.length || 0,
                hasIntro: !!data.intro,
                source: data.source
            });

            return data;
        } catch (error) {
            console.error(`[API] ❌ Stream fetch failed:`, error);
            throw error;
        }
    }

    getProxyUrl(hlsUrl: string): string {
        return `${this.baseUrl}/api/stream/proxy?url=${encodeURIComponent(hlsUrl)}`;
    }

    // ============ SOURCE ENDPOINTS ============

    async getSources(): Promise<string[]> {
        const response = await this.fetch<{ sources: string[] }>('/api/sources');
        return response.sources || [];
    }

    async getSourceHealth(): Promise<SourceHealth[]> {
        const response = await this.fetch<{ sources: SourceHealth[] }>('/api/sources/health');
        return response.sources || [];
    }

    /**
     * Get enhanced source health with capabilities and performance metrics
     */
    async getSourceHealthEnhanced(): Promise<Array<{
        name: string;
        status: string;
        lastCheck: string;
        capabilities?: {
            supportsDub: boolean;
            supportsSub: boolean;
            hasScheduleData: boolean;
            hasGenreFiltering: boolean;
            quality: 'high' | 'medium' | 'low';
        };
        successRate?: number;
        avgLatency?: number;
    }>> {
        const response = await this.fetch<{ sources: Array<{
            name: string;
            status: string;
            lastCheck: Date;
            capabilities?: {
                supportsDub: boolean;
                supportsSub: boolean;
                hasScheduleData: boolean;
                hasGenreFiltering: boolean;
                quality: 'high' | 'medium' | 'low';
            };
            successRate?: number;
            avgLatency?: number;
        }> }>('/api/sources/health/enhanced');
        return response.sources || [];
    }

    /**
     * Get recommended source based on performance metrics
     */
    async getRecommendedSource(): Promise<{
        recommended: string | null;
        capabilities?: {
            supportsDub: boolean;
            supportsSub: boolean;
            hasScheduleData: boolean;
            hasGenreFiltering: boolean;
            quality: 'high' | 'medium' | 'low';
        };
    }> {
        const response = await this.fetch<{
            recommended: string | null;
            capabilities?: {
                supportsDub: boolean;
                supportsSub: boolean;
                hasScheduleData: boolean;
                hasGenreFiltering: boolean;
                quality: 'high' | 'medium' | 'low';
            };
        }>('/api/sources/recommended');
        return response;
    }

    async checkSourceHealth(): Promise<SourceHealth[]> {
        const response = await fetch(`${this.baseUrl}/api/sources/check`, { method: 'POST' });
        const data = await response.json();
        return data.sources || [];
    }

    async setPreferredSource(source: string): Promise<boolean> {
        const response = await fetch(`${this.baseUrl}/api/sources/preferred`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source })
        });
        return response.ok;
    }

    // ============ UTILITY ENDPOINTS ============

    async getAnimeTypes(): Promise<{ value: string; label: string; description: string }[]> {
        const response = await this.fetch<{ types: { value: string; label: string; description: string }[] }>('/api/anime/types');
        return response.types || [];
    }

    async getAnimeGenres(): Promise<string[]> {
        const response = await this.fetch<{ genres: string[] }>('/api/anime/genres');
        return response.genres || [];
    }

    async getAnimeStatuses(): Promise<{ value: string; label: string; description: string }[]> {
        const response = await this.fetch<{ statuses: { value: string; label: string; description: string }[] }>('/api/anime/statuses');
        return response.statuses || [];
    }

    async getAnimeSeasons(): Promise<{ value: string; label: string; months: string }[]> {
        const response = await this.fetch<{ seasons: { value: string; label: string; months: string }[] }>('/api/anime/seasons');
        return response.seasons || [];
    }

    async getAnimeYears(): Promise<{ value: number; label: string; decade: string }[]> {
        const response = await this.fetch<{ years: { value: number; label: string; decade: string }[] }>('/api/anime/years');
        return response.years || [];
    }
}

export const apiClient = new AnimeApiClient();
