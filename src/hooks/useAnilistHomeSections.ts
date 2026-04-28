import { useQuery } from '@tanstack/react-query';
import type { SeasonalResponse } from '@/lib/api-client';
import type { Anime, AnimeSearchResult } from '@/types/anime';
import { apiClient } from '@/lib/api-client';
import {
  fetchTrendingFromAniList,
  fetchLatestFromAniList,
  fetchSeasonalFromAniList,
  fetchUpcomingFromAniList,
  fetchPopularMoviesFromAniList,
  fetchActionTrendingFromAniList,
} from '@/lib/anilist-home-queries';

const homeRetry = {
  retry: 2 as const,
  retryDelay: (i: number) => Math.min(5000, 900 * (i + 1)),
};

const homeAnilistKey = {
  trending: ['home-anilist', 'trending'] as const,
  latest: ['home-anilist', 'latest'] as const,
  seasonal: (year: number, season: string) => ['home-anilist', 'seasonal', year, season] as const,
  upcoming: ['home-anilist', 'upcoming'] as const,
  movies: ['home-anilist', 'movies'] as const,
  action: ['home-anilist', 'action'] as const,
};

export function useAnilistHomeTrending(perPage: number = 24) {
  return useQuery<Anime[], Error>({
    queryKey: [...homeAnilistKey.trending, perPage],
    queryFn: async () => {
      // Prefer BFF trending so homepage clicks are playable (has streaming IDs).
      // Fall back to AniList-only rows if the BFF is down.
      try {
        const results = await apiClient.getTrending(1);
        if (results?.length) return results.slice(0, perPage);
      } catch { /* ignore */ }
      return fetchTrendingFromAniList(perPage);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeLatest(perPage: number = 24) {
  return useQuery<Anime[], Error>({
    queryKey: [...homeAnilistKey.latest, perPage],
    queryFn: async () => {
      // Try AniList first for covers and hover information
      try {
        const anilistData = await fetchLatestFromAniList(perPage);
        if (anilistData && anilistData.length > 0) return anilistData;
      } catch (error) {
        console.error('[useAnilistHomeLatest] AniList fetch failed:', error);
      }
      
      // Fall back to BFF API
      try {
        const results = await apiClient.getLatest(1);
        if (results?.length) return results.slice(0, perPage);
      } catch (error) {
        console.error('[useAnilistHomeLatest] BFF fetch failed:', error);
      }
      
      // Return trending as ultimate fallback
      try {
        const trending = await fetchTrendingFromAniList(perPage);
        if (trending && trending.length > 0) return trending;
      } catch (error) {
        console.error('[useAnilistHomeLatest] Trending fallback failed:', error);
      }
      
      return [];
    },
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeSeasonal(year: number, season: string, enabled: boolean = true) {
  return useQuery<SeasonalResponse, Error>({
    queryKey: homeAnilistKey.seasonal(year, season),
    queryFn: async () => {
      try {
        // BFF seasonal uses streaming sources; still keep AniList fallback for richness.
        const results = await apiClient.getSeasonal(year, season.toLowerCase(), 1);
        if (results?.results?.length) return results;
      } catch { /* ignore */ }
      return fetchSeasonalFromAniList(year, season);
    },
    enabled: enabled && !!year && !!season,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeUpcoming(perPage: number = 24) {
  return useQuery<AnimeSearchResult, Error>({
    queryKey: [...homeAnilistKey.upcoming, perPage],
    queryFn: async () => {
      // Upcoming is often AniList-only; prefer AniList but allow BFF if it returns anything.
      try {
        const r = await apiClient.browseAnime({ status: 'upcoming', sort: 'popularity' }, 1, false, perPage);
        if (r?.results?.length) return r;
      } catch { /* ignore */ }
      return fetchUpcomingFromAniList(perPage);
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeMovies(perPage: number = 20) {
  return useQuery<AnimeSearchResult, Error>({
    queryKey: [...homeAnilistKey.movies, perPage],
    queryFn: async () => {
      try {
        const r = await apiClient.browseAnime({ type: 'Movie', sort: 'popularity' }, 1, false, perPage);
        if (r?.results?.length) return r;
      } catch { /* ignore */ }
      return fetchPopularMoviesFromAniList(perPage);
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeAction(perPage: number = 20) {
  return useQuery<AnimeSearchResult, Error>({
    queryKey: [...homeAnilistKey.action, perPage],
    queryFn: async () => {
      try {
        const r = await apiClient.browseAnime({ genre: 'Action', sort: 'trending' }, 1, false, perPage);
        if (r?.results?.length) return r;
      } catch { /* ignore */ }
      return fetchActionTrendingFromAniList(perPage);
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...homeRetry,
  });
}
