import { Anime, TopAnime, AnimeSearchResult, Episode } from '@/types/anime';

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

// Use different API URLs based on environment
const API_BASE_URL = import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? 'http://localhost:3001' : 'https://anifoxwatch.onrender.com');

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
    private readonly MAX_RETRIES = 3;
    private readonly TIMEOUT_MS = 30000;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    /**
     * Execute fetch with retry logic and timeout
     */
    private async fetchWithRetry<T>(
        endpoint: string,
        options?: RequestInit,
        retries: number = this.MAX_RETRIES
    ): Promise<T> {
        // Check cache first for GET requests
        if (!options?.method || options.method === 'GET') {
            const cacheKey = `${endpoint}`;
            const cached = this.cache.get(cacheKey);
            if (cached && cached.expires > Date.now()) {
                return cached.data as T;
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
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

                    throw new Error(errorMessage);
                }

                const data = await response.json();

                // Cache for 2 minutes - store with proper type
                if (!options?.method || options.method === 'GET') {
                    const cacheKey = `${endpoint}`;
                    this.cache.set(cacheKey, { data, expires: Date.now() + 2 * 60 * 1000 } as CacheEntry<T>);
                }

                return data;
            } catch (error) {
                lastError = error as Error;

                // Check if it's a timeout
                if (lastError.name === 'AbortError') {
                    throw new Error('Request timeout - please try again');
                }

                // Check if we should retry (network errors)
                const isRetryable = attempt < retries && (
                    lastError.message.includes('network') ||
                    lastError.message.includes('Failed to fetch') ||
                    lastError.message.includes('timeout')
                );

                if (isRetryable) {
                    // Exponential backoff
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                throw lastError;
            } finally {
                clearTimeout(timeoutId);
            }
        }

        throw lastError || new Error('Unknown error');
    }

    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        return this.fetchWithRetry<T>(endpoint, options);
    }

    // Clear cache for fresh data
    clearCache(): void {
        this.cache.clear();
    }

    // ============ ANIME ENDPOINTS ============

    async search(query: string, page: number = 1, source?: string, mode: 'safe' | 'mixed' | 'adult' = 'mixed'): Promise<AnimeSearchResult> {
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

    async browseAnime(filters: BrowseFilters, page: number = 1, bypassCache: boolean = false): Promise<AnimeSearchResult> {
        const params = new URLSearchParams({ page: String(page), limit: '50' });

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
}

export const apiClient = new AnimeApiClient();
