import { Anime, TopAnime, AnimeSearchResult, Episode } from '@/types/anime';
import { getApiConfig, getApiFallbackUrl } from './api-config';
import { fetchAniListAnimeByNumericId } from './anilist-anime-by-id';
import { ping } from '@/utils/keep-alive';

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

// Streaming types
export interface VideoSource {
    url: string;
    quality: '360p' | '480p' | '720p' | '1080p' | 'auto' | 'default';
    isM3U8: boolean;
    isDASH?: boolean;
    isDirect?: boolean;
    /** Source URL is bound to the server IP (e.g. Streamtape). Cannot be proxied through serverless. */
    ipLocked?: boolean;
    /** Source is an embed page (e.g. animekai.to/iframe/TOKEN). Rendered as an iframe, not HLS. */
    isEmbed?: boolean;
    originalUrl?: string;
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
    /** If true, the backend returned a SUB stream because the requested DUB was unavailable. */
    dubFallback?: boolean;
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
    private cache: Map<string, CacheEntry<unknown>> = new Map();
    private inflight: Map<string, Promise<unknown>> = new Map();
    private readonly MAX_RETRIES = 1; // Further reduced to prevent UI struggling
    private readonly TIMEOUT_MS = 25000; // 25s — allow sufficient time for stream extraction and AniList resolution
    private readonly FALLBACK_TTL = 30 * 1000; // 30s before retrying primary (reduced from 2 min)
    private _online = true;
    private _lastOnlineCheck = 0;
    /** Non-null when we've switched to a fallback URL after primary failed. */
    private _activeBase: string | null = null;
    private _activeBaseExpires: number = 0;

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => { this._online = true; });
            window.addEventListener('offline', () => { this._online = false; });
            this._online = navigator.onLine !== false;
        }
    }

    /** Returns the active base URL — fallback if primary is down, otherwise primary. */
    private apiBase(): string {
        if (this._activeBase && this._activeBaseExpires > Date.now()) {
            return this._activeBase;
        }
        this._activeBase = null;
        return getApiConfig().baseUrl;
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
            // Generate cache key with query parameters for better caching
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

        // Track in-flight GET requests for deduplication.
        // The noop .catch() prevents Node's "unhandled rejection" event from firing on the
        // stored reference before a consumer attaches their own handler — callers still see
        // the rejection via their own await/catch chain.
        if (isGet) {
            this.inflight.set(endpoint, promise);
            promise.catch(() => {});
            promise
                .finally(() => this.inflight.delete(endpoint))
                .catch(() => {});
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
                const response = await fetch(`${this.apiBase()}${endpoint}`, {
                    ...options,
                    mode: 'cors',
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

                const contentType = response.headers?.get?.('content-type') ?? null;
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error(`API returned invalid format (${contentType || 'text/html'}). The server might be down or returning an error page.`);
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
                    lastError = new Error('Request timeout - please try again');
                    // Retry on timeout instead of immediately throwing
                    if (attempt < retries) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                    throw lastError;
                }

                // Detect CORS / network failures — these surface as TypeError('Failed to fetch')
                // with no response body (cold starts, transient edge issues, etc.).
                const msg = lastError.message || '';
                const isCorsOrNetwork = (
                    msg.includes('Failed to fetch') ||
                    msg.includes('NetworkError') ||
                    msg.includes('ERR_FAILED') ||
                    msg.includes('CORS')
                );

                // Retry on network errors and server errors
                const isRetryable = attempt < retries && (
                    isCorsOrNetwork ||
                    msg.includes('network') ||
                    msg.includes('timeout') ||
                    msg.includes('502') ||
                    msg.includes('503') ||
                    msg.includes('504')
                );

                if (isRetryable) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }

                throw lastError;
            }
        }

        // All retries on primary failed — try fallback URL once if configured
        const fallbackBase = getApiFallbackUrl();
        if (fallbackBase && fallbackBase !== this.apiBase()) {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
                const response = await fetch(`${fallbackBase}${endpoint}`, {
                    ...options,
                    mode: 'cors',
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json', ...options?.headers }
                });
                clearTimeout(tid);
                if (response.ok) {
                    const data = await response.json() as T;
                    // Switch all subsequent requests to the fallback for FALLBACK_TTL
                    this._activeBase = fallbackBase;
                    this._activeBaseExpires = Date.now() + this.FALLBACK_TTL;
                    if (isGet) {
                        this.cache.set(endpoint, { data, expires: Date.now() + this.getCacheTTL(endpoint) } as CacheEntry<T>);
                    }
                    return data;
                }
            } catch (fallbackErr) {
                console.error('[API] Fallback also failed:', fallbackErr);
            }
        }

        throw lastError || new Error('Unknown error');
    }

    /**
     * Get cache TTL based on endpoint type
     */
    private getCacheTTL(endpoint: string): number {
        // Streaming links should NOT be cached - they need to be fresh for each episode
        if (endpoint.includes('/stream/watch') || endpoint.includes('/stream/proxy')) return 0; // No caching for actual streaming
        if (endpoint.includes('/stream/servers')) return 2 * 60 * 1000; // 2 min for server lists
        // Search must stay fresh — long TTL made browse/search grids feel stale vs. header autocomplete
        if (endpoint.includes('/anime/search?')) return 10 * 1000; // 10s (reduced from 20s)
        if (endpoint.includes('/trending') || endpoint.includes('/latest')) return 2 * 60 * 1000; // 2 min (reduced from 5 min)
        if (endpoint.includes('/top-rated') || endpoint.includes('/seasonal')) return 5 * 60 * 1000; // 5 min (reduced from 15 min)
        if (endpoint.includes('/schedule')) return 2 * 60 * 1000; // 2 min (reduced from 5 min)
        if (endpoint.includes('/sources')) return 15 * 1000; // 15s for health (reduced from 30s)
        if (endpoint.includes('/anime?id=') || endpoint.includes('/episodes')) return 10 * 60 * 1000; // 10 min (increased for faster episode switching)
        return 30 * 1000; // default 30s (reduced from 2 min)
    }

    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        return this.fetchWithRetry<T>(endpoint, options);
    }

    // Clear cache for fresh data
    clearCache(): void {
        this.cache.clear();
        this.inflight.clear();
    }

    // Clear cache for specific pattern
    clearCacheForPattern(pattern: string): void {
        const keysToDelete: string[] = [];
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));

        // Also clear inflight requests
        const inflightKeysToDelete: string[] = [];
        for (const key of this.inflight.keys()) {
            if (key.includes(pattern)) {
                inflightKeysToDelete.push(key);
            }
        }
        inflightKeysToDelete.forEach(key => this.inflight.delete(key));
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

    async resolveAniListToStreamingId(anilistId: string): Promise<{ id: string; streamingId: string } | null> {
        const params = new URLSearchParams({ id: anilistId });
        try {
            return await this.fetch<{ id: string; streamingId: string }>(`/api/anime/resolve?${params}`);
        } catch {
            return null;
        }
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

    async getAnime(id: string, source?: string): Promise<Anime | null> {
        try {
            const params = new URLSearchParams({ id });
            if (source) params.append('source', source);
            return await this.fetch<Anime>(`/api/anime?${params}`);
        } catch {
            return this.getAnimeAnilistFallback(id);
        }
    }

    /** When edge API returns 404 for anilist-* ids, load metadata directly from AniList GraphQL. */
    private async getAnimeAnilistFallback(id: string): Promise<Anime | null> {
        const m = /^anilist-(\d+)$/i.exec(id.trim());
        if (!m) return null;
        const numericId = parseInt(m[1], 10);
        if (Number.isNaN(numericId)) return null;
        try {
            return await fetchAniListAnimeByNumericId(numericId);
        } catch {
            return null;
        }
    }

    async getEpisodes(animeId: string, source?: string): Promise<Episode[]> {
        const params = new URLSearchParams({ id: animeId });
        if (source) params.append('source', source);
        // Add cache-busting timestamp to force fresh fetch
        params.append('_t', String(Date.now()));
        const response = await this.fetch<{ episodes: Episode[] }>(
            `/api/anime/episodes?${params}`
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
        // Simple ID normalization - just handle basic episode ID formats
        let slugPart = episodeId;
        let query = '';
        if (episodeId.includes('?ep=')) {
            const parts = episodeId.split('?ep=');
            slugPart = parts[0];
            query = `?ep=${parts[1]}`;
        } else if (episodeId.includes('&eps=')) {
            const parts = episodeId.split('&eps=');
            slugPart = parts[0];
            query = `?eps=${parts[1]}`;
        }
        const response = await this.fetch<{ servers: EpisodeServer[] }>(
            `/api/stream/servers/${encodeURIComponent(slugPart)}${query}`
        );
        return response.servers || [];
    }

    async getStreamingLinks(episodeId: string, server?: string, category?: string, episodeNum?: number, anilistId?: number, animeTitle?: string, bypassCache?: boolean): Promise<StreamingData> {
        // Simple ID normalization - just handle basic episode ID formats
        let slugPart = episodeId;
        let epPart = '';
        let epsPart = '';

        if (episodeId.includes('?ep=')) {
            const parts = episodeId.split('?ep=');
            slugPart = parts[0];
            epPart = parts[1];
        } else if (episodeId.includes('&eps=')) {
            const parts = episodeId.split('&eps=');
            slugPart = parts[0];
            epsPart = parts[1];
        }

        const params = new URLSearchParams();
        if (epPart) params.append('ep', epPart);
        if (epsPart) params.append('eps', epsPart);
        if (server) params.append('server', server);
        if (category) params.append('category', category);
        // `ep_num`: catalog episode for cross-source fallback when `?ep=` is a
        // non-numeric embed token (from `slug$ep=N$token=...` we still know N).
        const epKey = epPart || epsPart || '';
        const looksLikeNumericAniwatchEp = /^\d+$/.test(epKey);
        if (episodeNum != null) {
            params.append('ep_num', String(episodeNum));
        }
        if (anilistId != null) params.append('anilist_id', String(anilistId));
        if (animeTitle) params.append('title', animeTitle);
        if (bypassCache) params.append('nocache', 'true');

        const queryString = params.toString() ? `?${params.toString()}` : '';
        const streamPath = `/api/stream/watch/${encodeURIComponent(slugPart)}${queryString}`;

        console.log(`[API] 📺 Fetching stream for episode: ${episodeId}`, { server, category });

        const tryFetch = async (base: string): Promise<StreamingData> => {
            // 45s timeout per host — cross-source fallback & cold-start containers (e.g. Render)
            const streamTimeoutMs = 45_000;
            const maxAttempts = 1;
            let lastErr: Error | null = null;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), streamTimeoutMs);
                try {
                    const response = await fetch(`${base}${streamPath}`, {
                        signal: controller.signal,
                        headers: { 'Accept': 'application/json' }
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        const errorText = await response.text();
                        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
                        try { errorMessage = JSON.parse(errorText).error || errorMessage; } catch {}
                        const err = Object.assign(new Error(errorMessage), { status: response.status });
                        // Don't retry 4xx client errors (except 408/429)
                        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
                            throw err;
                        }
                        lastErr = err;
                        if (attempt < maxAttempts - 1) {
                            await new Promise(r => setTimeout(r, 1000));
                            continue;
                        }
                        throw err;
                    }
                    const contentType = response.headers.get('content-type');
                    if (!contentType || !contentType.includes('application/json')) {
                        throw new Error(`Stream API returned invalid format (${contentType || 'text/html'}).`);
                    }
                    return response.json();
                } catch (e) {
                    clearTimeout(timeoutId);
                    lastErr = e as Error;
                    // Simplified error handling - let Watch page handle aborts gracefully
                    if (attempt < maxAttempts - 1) {
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }
                    throw lastErr;
                }
            }
            throw lastErr || new Error('Stream fetch failed');
        };

const primaryBase = this.apiBase();
            try {
                const data = await tryFetch(primaryBase);
                // Convert relative proxy URLs to absolute URLs pointing to the API base
                // In local dev with Vite proxy, primaryBase is empty, so keep URLs relative
                if (data.sources) {
                    data.sources = data.sources.map((s: VideoSource) => {
                        if (s.url && s.url.startsWith('/api/stream/proxy')) {
                            // Keep relative URLs in local dev (Vite proxy handles them)
                            // Convert to absolute only in production
                            if (primaryBase) {
                                return {
                                    ...s,
                                    url: `${primaryBase}${s.url}`
                                };
                            }
                            return s;
                        }
                        return s;
                    });
                }
                if (data.subtitles) {
                    data.subtitles = data.subtitles.map((s: VideoSubtitle) => {
                        if (s.url && s.url.startsWith('/api/stream/proxy')) {
                            if (primaryBase) {
                                return {
                                    ...s,
                                    url: `${primaryBase}${s.url}`
                                };
                            }
                            return s;
                        }
                        return s;
                    });
                }
                console.log(`[API] ✅ Stream received:`, {
                    sources: data.sources?.length || 0,
                    qualities: data.sources?.map((s: any) => s.quality).join(', '),
                    subtitles: data.subtitles?.length || 0,
                    hasIntro: !!data.intro,
                    source: data.source
                });
                return data;
            } catch (primaryErr) {
                // Try fallback host before giving up (if configured)
                const fallback = getApiFallbackUrl();
                if (fallback && fallback !== primaryBase) {
                    console.warn(`[API] Stream primary failed, trying fallback: ${fallback}`);
                    try {
                        const data = await tryFetch(fallback);
                        // Remember fallback as active for subsequent requests
                        this._activeBase = fallback;
                        this._activeBaseExpires = Date.now() + this.FALLBACK_TTL;
                        console.log(`[API] ✅ Stream received via fallback`);
                        return data;
                    } catch (fallbackErr) {
                        console.error(`[API] ❌ Fallback stream also failed:`, fallbackErr);
                    }
                }

            const isColdStart = primaryErr instanceof TypeError &&
                (primaryErr.message.toLowerCase().includes('failed to fetch') ||
                 primaryErr.message.toLowerCase().includes('network request failed') ||
                 primaryErr.message.toLowerCase().includes('load failed'));

            // Cold-start: server was sleeping. Wait for it to wake then retry once.
            if (isColdStart) {
                console.warn('[API] ⏳ Cold-start detected — waiting for server to wake...');
                let woke = false;
                const deadline = Date.now() + 75_000; // wait up to 75 s
                while (Date.now() < deadline) {
                    await new Promise(r => setTimeout(r, 4000));
                    woke = await ping();
                    if (woke) break;
                }
                if (woke) {
                    console.log('[API] 🟢 Server woke — retrying stream fetch...');
                    try {
                        return await tryFetch(primaryBase);
                    } catch (retryErr) {
                        console.error('[API] ❌ Retry after wake also failed:', retryErr);
                        throw retryErr;
                    }
                }
                throw new Error('Server did not wake in time. Please try again.');
            }

            const isAbort = primaryErr instanceof Error && (primaryErr.name === 'AbortError' || primaryErr.message.toLowerCase().includes('aborted'));
            if (!isAbort) {
                console.error(`[API] ❌ Stream fetch failed:`, primaryErr);
            }
            throw primaryErr;
        }
    }

    getProxyUrl(hlsUrl: string): string {
        return `${this.apiBase()}/api/stream/proxy?url=${encodeURIComponent(hlsUrl)}`;
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
        const response = await fetch(`${this.apiBase()}/api/sources/check`, { method: 'POST' });
        const data = await response.json();
        return data.sources || [];
    }

    async setPreferredSource(source: string): Promise<boolean> {
        const response = await fetch(`${this.apiBase()}/api/sources/preferred`, {
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
