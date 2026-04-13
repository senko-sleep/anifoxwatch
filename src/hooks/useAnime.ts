import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient, SourceHealth, StreamingData, EpisodeServer, ScheduleResponse, LeaderboardResponse, SeasonalResponse } from '@/lib/api-client';
import { Anime, TopAnime, AnimeSearchResult, Episode } from '@/types/anime';
import { enrichWithAniListCovers } from '@/lib/anilist-covers';

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
        queryFn: async () => {
            try {
                const result = await apiClient.search(query, page, source, mode);
                return result;
            } catch (error) {
                console.error('[useSearch] Search failed:', error);
                // Return empty result instead of throwing
                return {
                    results: [],
                    totalPages: 0,
                    currentPage: page,
                    hasNextPage: false,
                    totalResults: 0,
                    source: 'error'
                };
            }
        },
        enabled: enabled && query.trim().length >= 2,
        staleTime: 0,
        gcTime: 5 * 60 * 1000,
        retry: 1,
        retryDelay: 1000,
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
            try {
                const result = await apiClient.browseAnime(filters, page, bypassCache, limit);
                // Enrich with AniList HD covers (include adult content for adult mode)
                const includeAdult = filters.mode === 'adult' || filters.mode === 'mixed';
                const enrichedResults = await enrichWithAniListCovers(result.results, includeAdult);
                return { ...result, results: enrichedResults };
            } catch (error) {
                console.error('[useBrowse] Browse failed:', error);
                // Return empty result instead of throwing
                return {
                    results: [],
                    totalPages: 0,
                    currentPage: page,
                    hasNextPage: false,
                    totalResults: 0,
                    source: 'error'
                };
            }
        },
        enabled,
        staleTime: bypassCache ? 0 : 2 * 60 * 1000,
        gcTime: bypassCache ? 0 : 5 * 60 * 1000,
        retry: 1,
        retryDelay: 1000,
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
        queryFn: () => apiClient.getEpisodes(animeId, source),
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
            const response = await apiClient.getSeasonal(year, season, page);
            // Enrich with AniList HD covers (include adult content for adult mode)
            const includeAdult = mode === 'adult' || mode === 'mixed';
            const enrichedResults = await enrichWithAniListCovers(response.results, includeAdult);
            return { ...response, results: enrichedResults };
        },
        enabled,
        staleTime: 30 * 60 * 1000, // 30 minutes - seasonal data is fairly static
        gcTime: 60 * 60 * 1000,
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

export function useStreamingLinks(episodeId: string, server?: string, category?: string, enabled: boolean = true) {
    return useQuery<StreamingData, Error>({
        queryKey: queryKeys.stream(episodeId, server, category),
        queryFn: () => apiClient.getStreamingLinks(episodeId, server, category),
        enabled: enabled && episodeId.length > 0,
        staleTime: 0,
        gcTime: 3 * 60 * 1000,
        retry: 0,
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
    
    return (animeId: string, episodeId: string) => {
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
