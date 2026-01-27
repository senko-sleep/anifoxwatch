import { Anime, TopAnime, AnimeSearchResult, Episode } from '@/types/anime';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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

class AnimeApiClient {
    private baseUrl: string;
    private cache: Map<string, { data: any; expires: number }> = new Map();

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        // Check cache first
        const cacheKey = `${endpoint}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            return cached.data;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Accept': 'application/json',
                ...options?.headers
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Cache for 2 minutes
        this.cache.set(cacheKey, { data, expires: Date.now() + 2 * 60 * 1000 });

        return data;
    }

    // Clear cache for fresh data
    clearCache(): void {
        this.cache.clear();
    }

    // ============ ANIME ENDPOINTS ============

    async search(query: string, page: number = 1, source?: string): Promise<AnimeSearchResult> {
        const params = new URLSearchParams({ q: query, page: String(page) });
        if (source) params.append('source', source);
        return this.fetch<AnimeSearchResult>(`/anime/search?${params}`);
    }

    async searchAll(query: string, page: number = 1): Promise<{ results: Anime[]; sources: string[] }> {
        const params = new URLSearchParams({ q: query, page: String(page) });
        return this.fetch(`/anime/search-all?${params}`);
    }

    async getTrending(page: number = 1, source?: string): Promise<Anime[]> {
        const params = new URLSearchParams({ page: String(page) });
        if (source) params.append('source', source);
        const response = await this.fetch<ApiResponse<Anime>>(`/anime/trending?${params}`);
        return response.results || [];
    }

    async getLatest(page: number = 1, source?: string): Promise<Anime[]> {
        const params = new URLSearchParams({ page: String(page) });
        if (source) params.append('source', source);
        const response = await this.fetch<ApiResponse<Anime>>(`/anime/latest?${params}`);
        return response.results || [];
    }

    async getTopRated(page: number = 1, limit: number = 10, source?: string): Promise<TopAnime[]> {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (source) params.append('source', source);
        const response = await this.fetch<{ results: TopAnime[] }>(`/anime/top-rated?${params}`);
        return response.results || [];
    }

    async getAnimeByGenre(genre: string, page: number = 1, source?: string): Promise<AnimeSearchResult> {
        const params = new URLSearchParams({ page: String(page) });
        if (source) params.append('source', source);
        return this.fetch<AnimeSearchResult>(`/anime/genre/${encodeURIComponent(genre)}?${params}`);
    }

    async getRandomAnime(source?: string): Promise<Anime | null> {
        try {
            const params = new URLSearchParams();
            if (source) params.append('source', source);
            const queryString = params.toString() ? `?${params.toString()}` : '';
            return await this.fetch<Anime>(`/anime/random${queryString}`);
        } catch {
            return null;
        }
    }

    async getAnime(id: string): Promise<Anime | null> {
        try {
            return await this.fetch<Anime>(`/anime/${encodeURIComponent(id)}`);
        } catch {
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const response = await this.fetch<{ episodes: Episode[] }>(
            `/anime/${encodeURIComponent(animeId)}/episodes`
        );
        return response.episodes || [];
    }

    // ============ STREAMING ENDPOINTS ============

    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const response = await this.fetch<{ servers: EpisodeServer[] }>(
            `/stream/servers/${encodeURIComponent(episodeId)}`
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
                `/stream/watch/${encodeURIComponent(episodeId)}${queryString}`
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
        return `${this.baseUrl}/stream/proxy?url=${encodeURIComponent(hlsUrl)}`;
    }

    // ============ SOURCE ENDPOINTS ============

    async getSources(): Promise<string[]> {
        const response = await this.fetch<{ sources: string[] }>('/sources');
        return response.sources || [];
    }

    async getSourceHealth(): Promise<SourceHealth[]> {
        const response = await this.fetch<{ sources: SourceHealth[] }>('/sources/health');
        return response.sources || [];
    }

    async checkSourceHealth(): Promise<SourceHealth[]> {
        const response = await fetch(`${this.baseUrl}/sources/check`, { method: 'POST' });
        const data = await response.json();
        return data.sources || [];
    }

    async setPreferredSource(source: string): Promise<boolean> {
        const response = await fetch(`${this.baseUrl}/sources/preferred`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source })
        });
        return response.ok;
    }
}

export const apiClient = new AnimeApiClient();
