import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient, SourceHealth, StreamingData, EpisodeServer } from '@/lib/api-client';
import { Anime, TopAnime, AnimeSearchResult, Episode } from '@/types/anime';

// Query keys for caching and invalidation
export const queryKeys = {
    trending: (page: number, source?: string) => ['trending', page, source] as const,
    latest: (page: number, source?: string) => ['latest', page, source] as const,
    topRated: (page: number, limit: number, source?: string) => ['topRated', page, limit, source] as const,
    search: (query: string, page: number, source?: string) => ['search', query, page, source] as const,
    genre: (genre: string, page: number, source?: string) => ['genre', genre, page, source] as const,
    anime: (id: string) => ['anime', id] as const,
    episodes: (animeId: string) => ['episodes', animeId] as const,
    servers: (episodeId: string) => ['servers', episodeId] as const,
    stream: (episodeId: string, server?: string, category?: string) => ['stream', episodeId, server, category] as const,
    sources: ['sources'] as const,
    sourceHealth: ['sourceHealth'] as const,
};

// ============ ANIME DATA HOOKS ============

export function useTrending(page: number = 1, limit?: number) {
    return useQuery<Anime[], Error>({
        queryKey: queryKeys.trending(page, limit?.toString()),
        queryFn: () => apiClient.getTrending(page, undefined, limit),
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });
}

export function useLatest(page: number = 1, source?: string) {
    return useQuery<Anime[], Error>({
        queryKey: queryKeys.latest(page, source),
        queryFn: () => apiClient.getLatest(page, source),
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

export function useSearch(query: string, page: number = 1, source?: string, enabled: boolean = true) {
    return useQuery<AnimeSearchResult, Error>({
        queryKey: queryKeys.search(query, page, source),
        queryFn: () => apiClient.search(query, page, source),
        enabled: enabled && query.length > 0,
        staleTime: 2 * 60 * 1000,
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

export function useAnime(id: string, enabled: boolean = true) {
    return useQuery<Anime | null, Error>({
        queryKey: queryKeys.anime(id),
        queryFn: () => apiClient.getAnime(id),
        enabled: enabled && id.length > 0,
        staleTime: 10 * 60 * 1000,
    });
}

export function useEpisodes(animeId: string, enabled: boolean = true) {
    return useQuery<Episode[], Error>({
        queryKey: queryKeys.episodes(animeId),
        queryFn: () => apiClient.getEpisodes(animeId),
        enabled: enabled && animeId.length > 0,
        staleTime: 10 * 60 * 1000,
    });
}

// ============ STREAMING HOOKS ============

export function useEpisodeServers(episodeId: string, enabled: boolean = true) {
    return useQuery<EpisodeServer[], Error>({
        queryKey: queryKeys.servers(episodeId),
        queryFn: () => apiClient.getEpisodeServers(episodeId),
        enabled: enabled && episodeId.length > 0,
        staleTime: 60 * 60 * 1000, // 1 hour
    });
}

export function useStreamingLinks(episodeId: string, server?: string, category?: string, enabled: boolean = true) {
    return useQuery<StreamingData, Error>({
        queryKey: queryKeys.stream(episodeId, server, category),
        queryFn: () => apiClient.getStreamingLinks(episodeId, server, category),
        enabled: enabled && episodeId.length > 0,
        staleTime: 5 * 60 * 1000, // 5 minutes - streams expire quickly
        gcTime: 10 * 60 * 1000,
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
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

export function useSourceHealth() {
    return useQuery<SourceHealth[], Error>({
        queryKey: queryKeys.sourceHealth,
        queryFn: () => apiClient.getSourceHealth(),
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
    });
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
