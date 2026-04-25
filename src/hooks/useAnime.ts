import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient, SourceHealth, StreamingData, EpisodeServer, ScheduleResponse, LeaderboardResponse, SeasonalResponse } from '@/lib/api-client';
import { Anime, TopAnime, AnimeSearchResult, Episode } from '@/types/anime';
import { enrichWithAniListCovers } from '@/lib/anilist-covers';
import { fetchSeasonalFromAniList } from '@/lib/anilist-home-queries';

// ─── Direct AniList seasonal fallback ────────────────────────────────────────
// Used when the server-side /api/anime/seasonal returns empty (e.g. AniList
// rate-limits the Cloudflare Worker). Queries AniList directly from the browser.

// Query keys for caching and invalidation
export const queryKeys = {
    trending: (page: number, source?: string) => ['trending', page, source] as const,
    latest: (page: number, source?: string) => ['latest', page, source] as const,
    topRated: (page: number, limit: number, source?: string) => ['topRated', page, limit, source] as const,
    search: (query: string, page: number, source?: string, mode?: 'safe' | 'mixed' | 'adult') => ['search', query, page, source, mode] as const,
    genre: (genre: string, page: number, source?: string) => ['genre', genre, page, source] as const,
    anime: (id: string) => ['anime', id] as const,
    episodes: (animeId: string) => ['episodes', animeId] as const,
    servers: (episodeId: string) => ['servers', episodeId] as const,
    stream: (episodeId: string, server?: string, category?: string) => ['stream', episodeId, server, category] as const,
    sources: ['sources'] as const,
    sourceHealth: ['sourceHealth'] as const,
    schedule: (startDate?: string, endDate?: string, page?: number) => ['schedule', startDate, endDate, page] as const,
    leaderboard: (type: string, page: number) => ['leaderboard', type, page] as const,
    seasonal: (year?: number, season?: string, page?: number) => ['seasonal', year, season, page] as const,
};

// ============ ANIME DATA HOOKS ============

export function useTrending(page: number = 1, limit?: number, mode: 'safe' | 'mixed' | 'adult' = 'safe') {
    return useQuery<Anime[], Error>({
        queryKey: queryKeys.trending(page, limit?.toString()),
        queryFn: async () => {
            const results = await apiClient.getTrending(page, undefined, limit);
            // Enrich with AniList HD covers (include adult content for adult mode)
            const includeAdult = mode === 'adult' || mode === 'mixed';
            return enrichWithAniListCovers(results, includeAdult);
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });
}

export function useLatest(page: number = 1, source?: string, mode: 'safe' | 'mixed' | 'adult' = 'safe') {
    return useQuery<Anime[], Error>({
        queryKey: queryKeys.latest(page, source),
        queryFn: async () => {
            const results = await apiClient.getLatest(page, source);
            // Enrich with AniList HD covers (include adult content for adult mode)
            const includeAdult = mode === 'adult' || mode === 'mixed';
            return enrichWithAniListCovers(results, includeAdult);
        },
        staleTime: 3 * 60 * 1000, // Shorter for latest
        gcTime: 5 * 60 * 1000,
    });
}

export function useTopRated(page: number = 1, limit: number = 10, source?: string) {
    return useQuery<TopAnime[], Error>({
        queryKey: queryKeys.topRated(page, limit, source),
        queryFn: () => apiClient.getTopRated(page, limit, source),
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

export function useSearch(query: string, page: number = 1, source?: string, enabled: boolean = true, mode: 'safe' | 'mixed' | 'adult' = 'safe') {
    return useQuery<AnimeSearchResult, Error>({
        queryKey: queryKeys.search(query, page, source, mode),
        queryFn: () => apiClient.search(query, page, source, mode),
        enabled: enabled && query.trim().length >= 2,
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 8000),
    });
}

export function useGenre(genre: string, page: number = 1, source?: string, enabled: boolean = true) {
    return useQuery<AnimeSearchResult, Error>({
        queryKey: queryKeys.genre(genre, page, source),
        queryFn: () => apiClient.getAnimeByGenre(genre, page, source),
        enabled: enabled && genre.length > 0,
        staleTime: 2 * 60 * 1000,
    });
}

// Browse filters interface
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

export function useBrowse(filters: BrowseFilters, page: number = 1, enabled: boolean = true, bypassCache: boolean = false, limit: number = 25) {
    // Create a stable query key from filters
    const filterKey = JSON.stringify(filters);

    return useQuery<AnimeSearchResult, Error>({
        queryKey: ['browse', filterKey, page, bypassCache, limit],
        queryFn: async () => {
            const result = await apiClient.browseAnime(filters, page, bypassCache, limit);
            const includeAdult = filters.mode === 'adult' || filters.mode === 'mixed';
            const enrichedResults = await enrichWithAniListCovers(result.results, includeAdult);
            return { ...result, results: enrichedResults };
        },
        enabled,
        staleTime: bypassCache ? 0 : 2 * 60 * 1000,
        gcTime: bypassCache ? 0 : 5 * 60 * 1000,
        retry: 3,
        retryDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 8000),
    });
}

export function useAnime(id: string, enabled: boolean = true, source?: string) {
    return useQuery<Anime | null, Error>({
        queryKey: [...queryKeys.anime(id), source],
        queryFn: () => apiClient.getAnime(id, source),
        enabled: enabled && id.length > 0,
        staleTime: 10 * 60 * 1000,
    });
}

export function useEpisodes(animeId: string, enabled: boolean = true, source?: string) {
    return useQuery<Episode[], Error>({
        queryKey: [...queryKeys.episodes(animeId), source],
        queryFn: async () => {
            // For AniList IDs, resolve to the direct streaming ID first.
            // The /api/anime/resolve endpoint is reliably cached (in-memory + DB)
            // and avoids hitting AniList under rate-limit conditions on the server.
            let fetchId = animeId;
            if (animeId.startsWith('anilist-')) {
                const resolved = await apiClient.resolveAniListToStreamingId(animeId);
                if (resolved?.streamingId) fetchId = resolved.streamingId;
            }
            return apiClient.getEpisodes(fetchId, source);
        },
        enabled: enabled && animeId.length > 0,
        staleTime: 10 * 60 * 1000,
    });
}

// ============ SCHEDULE & LEADERBOARD HOOKS ============

interface DailySchedule {
    [key: string]: import('@/lib/api-client').ScheduleItem[];
}

export function useSchedule(startDate?: string, endDate?: string, page: number = 1, enabled: boolean = true) {
    return useQuery<{
        schedule: import('@/lib/api-client').ScheduleItem[];
        groupedByDay: DailySchedule;
        metadata: {
            totalShows: number;
            dateRange: { start: string; end: string };
            pageInfo: { currentPage: number; totalCount: number };
        };
    }, Error>({
        queryKey: queryKeys.schedule(startDate, endDate, page),
        queryFn: () => apiClient.getSchedule(startDate, endDate, page),
        enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes - schedule updates frequently
        gcTime: 15 * 60 * 1000,
    });
}

export function useLeaderboard(type: 'trending' | 'top-rated' = 'trending', page: number = 1, enabled: boolean = true) {
    return useQuery<import('@/lib/api-client').LeaderboardResponse, Error>({
        queryKey: queryKeys.leaderboard(type, page),
        queryFn: () => apiClient.getLeaderboard(type, page),
        enabled,
        staleTime: 10 * 60 * 1000, // 10 minutes
        gcTime: 30 * 60 * 1000,
    });
}

export function useSeasonal(year?: number, season?: string, page: number = 1, enabled: boolean = true, mode: 'safe' | 'mixed' | 'adult' = 'safe') {
    return useQuery<import('@/lib/api-client').SeasonalResponse, Error>({
        queryKey: queryKeys.seasonal(year, season, page),
        queryFn: async () => {
            const includeAdult = mode === 'adult' || mode === 'mixed';

            // Try server first
            try {
                const response = await apiClient.getSeasonal(year, season, page);
                if (response.results && response.results.length > 0) {
                    const enrichedResults = await enrichWithAniListCovers(response.results, includeAdult);
                    return { ...response, results: enrichedResults };
                }
            } catch { /* fall through to AniList direct */ }

            // Server returned empty or failed — query AniList directly from the browser
            if (year && season) {
                const direct = await fetchSeasonalFromAniList(year, season);
                return direct;
            }

            // Last resort: empty response
            return {
                results: [],
                pageInfo: { hasNextPage: false, currentPage: 1, totalPages: 1, totalItems: 0 },
                seasonInfo: { year: year ?? new Date().getFullYear(), season: season ?? '' },
                source: 'empty',
            };
        },
        enabled,
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

export function usePopular(page: number = 1, enabled: boolean = true) {
    return useQuery<Anime[], Error>({
        queryKey: ['popular', page],
        queryFn: () => apiClient.getTrending(page), // Popular uses trending endpoint
        enabled,
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

export function useUpcoming(page: number = 1, enabled: boolean = true) {
    return useQuery<AnimeSearchResult, Error>({
        queryKey: ['upcoming', page],
        queryFn: () => apiClient.browseAnime({ status: 'upcoming', sort: 'popularity' }, page),
        enabled,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
    });
}

// ============ STREAMING HOOKS ============

export function useEpisodeServers(episodeId: string, enabled: boolean = true) {
    return useQuery<EpisodeServer[], Error>({
        queryKey: queryKeys.servers(episodeId),
        queryFn: () => apiClient.getEpisodeServers(episodeId),
        enabled: enabled && episodeId.length > 0,
        staleTime: 60 * 60 * 1000, // 1 hour
        refetchOnWindowFocus: false,
    });
}

export function useStreamingLinks(episodeId: string, server?: string, category?: string, enabled: boolean = true, episodeNum?: number, anilistId?: number) {
    return useQuery<StreamingData, Error>({
        queryKey: queryKeys.stream(episodeId, server, category),
        queryFn: () => apiClient.getStreamingLinks(episodeId, server, category, episodeNum, anilistId),
        enabled: enabled && episodeId.length > 0,
        staleTime: 2 * 60 * 1000,   // 2 min — reuse when toggling sub/dub or returning quickly
        gcTime: 5 * 60 * 1000,
        // AbortError = hard timeout (10s). Don't retry or the UI can appear to "load forever".
        retry: (failureCount, error) => {
            if (error?.name === 'AbortError') return false;
            const status = (error as { status?: number })?.status;
            if (status === 404) return false;
            const msg = String((error as Error)?.message || '');
            if (/404|no streaming sources found/i.test(msg)) return false;
            return failureCount < 2;
        },
        retryDelay: (attempt: number) => Math.min(2000 * Math.pow(2, attempt), 10000),
        refetchOnWindowFocus: false,
    });
}

/**
 * Fetches a dub-category stream once (when user is on SUB) to detect dub availability
 * when server lists omit type:dub. Skipped when dub is already implied by servers/metadata/active dub playback.
 */
export function useDubStreamProbe(
    episodeId: string,
    servers: EpisodeServer[] | undefined,
    skip: boolean
) {
    const firstServer = servers?.[0]?.name;
    return useQuery<StreamingData, Error>({
        queryKey: ['dubStreamProbe', episodeId, firstServer],
        queryFn: () => apiClient.getStreamingLinks(episodeId, firstServer, 'dub'),
        enabled: !skip && !!episodeId && !!firstServer,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 0,
        refetchOnWindowFocus: false,
    });
}

// ============ SOURCE HOOKS ============

export function useSources() {
    return useQuery<string[], Error>({
        queryKey: queryKeys.sources,
        queryFn: () => apiClient.getSources(),
        staleTime: 60 * 60 * 1000,
    });
}

export function useSourceHealth(options?: { autoRefresh?: boolean; refreshInterval?: number }) {
    const { autoRefresh = true, refreshInterval = 30000 } = options || {};
    
    return useQuery<Array<{
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
    }>, Error>({
        queryKey: ['sourceHealthEnhanced', options],
        queryFn: () => apiClient.getSourceHealthEnhanced(),
        staleTime: refreshInterval,
        refetchInterval: autoRefresh ? refreshInterval : false,
        retry: 1,
        retryDelay: 2000,
    });
}

/**
 * Get recommended source based on current conditions (success rate and latency)
 */
export function useRecommendedSource() {
    const queryClient = useQueryClient();
    
    return (): string | null => {
        const sources = queryClient.getQueryData<SourceHealth[]>(queryKeys.sourceHealth);
        if (!sources) return null;
        
        // Just return first online source for now
        const online = sources.find(s => s.status === 'online');
        return online?.name || null;
    };
}

/**
 * Hook to prefetch episode data for smoother navigation
 */
export function usePrefetchNextEpisode() {
    const queryClient = useQueryClient();

    return (animeId: string, episodeId: string, category?: string, episodeNum?: number, anilistId?: number) => {
        // Prefetch episodes if not already cached
        if (!queryClient.getQueryData(queryKeys.episodes(animeId))) {
            queryClient.prefetchQuery({
                queryKey: queryKeys.episodes(animeId),
                queryFn: () => apiClient.getEpisodes(animeId),
                staleTime: 10 * 60 * 1000,
            });
        }
        // Prefetch servers for the next episode
        if (!queryClient.getQueryData(queryKeys.servers(episodeId))) {
            queryClient.prefetchQuery({
                queryKey: queryKeys.servers(episodeId),
                queryFn: () => apiClient.getEpisodeServers(episodeId),
                staleTime: 60 * 60 * 1000,
            });
        }
        // Prefetch streaming links (auto server) so video loads instantly on episode switch
        const streamKey = queryKeys.stream(episodeId, undefined, category);
        if (!queryClient.getQueryData(streamKey)) {
            queryClient.prefetchQuery({
                queryKey: streamKey,
                queryFn: () => apiClient.getStreamingLinks(episodeId, undefined, category, episodeNum, anilistId),
                staleTime: 2 * 60 * 1000,
            });
        }
    };
}

export function useRefreshSourceHealth() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => apiClient.checkSourceHealth(),
        onSuccess: (data) => {
            queryClient.setQueryData(queryKeys.sourceHealth, data);
        },
    });
}

export function useSetPreferredSource() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (source: string) => apiClient.setPreferredSource(source),
        onSuccess: () => {
            // Invalidate all queries to refetch with new source
            queryClient.invalidateQueries({ queryKey: ['trending'] });
            queryClient.invalidateQueries({ queryKey: ['latest'] });
            queryClient.invalidateQueries({ queryKey: ['topRated'] });
        },
    });
}

// ============ PREFETCH UTILITIES ============

export function usePrefetchAnime() {
    const queryClient = useQueryClient();

    return (id: string) => {
        queryClient.prefetchQuery({
            queryKey: queryKeys.anime(id),
            queryFn: () => apiClient.getAnime(id),
            staleTime: 10 * 60 * 1000,
        });
    };
}

export function usePrefetchEpisodes() {
    const queryClient = useQueryClient();

    return (animeId: string) => {
        queryClient.prefetchQuery({
            queryKey: queryKeys.episodes(animeId),
            queryFn: () => apiClient.getEpisodes(animeId),
            staleTime: 10 * 60 * 1000,
        });
    };
}

// ============ UTILITY HOOKS ============

export function useProxyUrl(hlsUrl: string | undefined): string | null {
    if (!hlsUrl) return null;
    return apiClient.getProxyUrl(hlsUrl);
}
