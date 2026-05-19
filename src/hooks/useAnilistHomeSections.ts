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
  fetchTrendingFromJikan,
  fetchTrendingFromKitsu,
  fetchLatestFromJikan,
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
      // 1) BFF trending (streaming-source backed) - best for playable content
      try {
        const results = await apiClient.getTrending(1);
        if (results?.length) return results.slice(0, perPage);
      } catch { /* ignore */ }
      
      // 2) AniList trending
      try {
        const anilistData = await fetchTrendingFromAniList(perPage);
        if (anilistData?.length) return anilistData;
      } catch (err) {
        console.error('[useAnilistHomeTrending] AniList fetch failed:', err);
      }
      
      // 3) Jikan (MyAnimeList) trending
      try {
        const jikanData = await fetchTrendingFromJikan(perPage);
        if (jikanData?.length) return jikanData;
      } catch (err) {
        console.error('[useAnilistHomeTrending] Jikan fetch failed:', err);
      }
      
      // 4) Kitsu trending
      try {
        const kitsuData = await fetchTrendingFromKitsu(perPage);
        if (kitsuData?.length) return kitsuData;
      } catch (err) {
        console.error('[useAnilistHomeTrending] Kitsu fetch failed:', err);
      }
      
      return [];
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
      // 1) AniList latest
      try {
        const anilistData = await fetchLatestFromAniList(perPage);
        if (anilistData && anilistData.length > 0) return anilistData;
      } catch (error) {
        console.error('[useAnilistHomeLatest] AniList fetch failed:', error);
      }
      
      // 2) BFF latest
      try {
        const results = await apiClient.getLatest(1);
        if (results?.length) return results.slice(0, perPage);
      } catch (error) {
        console.error('[useAnilistHomeLatest] BFF latest fetch failed:', error);
      }
      
      // 3) BFF trending
      try {
        const results = await apiClient.getTrending(1);
        if (results?.length) return results.slice(0, perPage);
      } catch (error) {
        console.error('[useAnilistHomeLatest] BFF trending fetch failed:', error);
      }
      
      // 4) Jikan latest (airing)
      try {
        const jikanData = await fetchLatestFromJikan(perPage);
        if (jikanData?.length) return jikanData;
      } catch (error) {
        console.error('[useAnilistHomeLatest] Jikan fetch failed:', error);
      }
      
      // 5) Kitsu trending
      try {
        const kitsuData = await fetchTrendingFromKitsu(perPage);
        if (kitsuData?.length) return kitsuData;
      } catch (error) {
        console.error('[useAnilistHomeLatest] Kitsu fetch failed:', error);
      }
      
      console.warn('[useAnilistHomeLatest] All sources failed, returning empty');
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
      try {
        const anilistResults = await fetchSeasonalFromAniList(year, season);
        if (anilistResults?.results?.length) return anilistResults;
      } catch (err) {
        console.error('[useAnilistHomeSeasonal] AniList fetch failed:', err);
      }
      // Return empty response instead of throwing
      return { results: [], pageInfo: { hasNextPage: false, currentPage: 1, totalPages: 0, totalItems: 0 }, seasonInfo: { year, season: season.toLowerCase() }, source: 'AniList' };
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
        const anilist = await fetchUpcomingFromAniList(perPage);
        if (anilist?.results?.length) return anilist;
      } catch (err) {
        console.error('[useAnilistHomeUpcoming] AniList fetch failed:', err);
      }
      try {
        const r = await apiClient.browseAnime({ status: 'upcoming', sort: 'popularity' }, 1, false, perPage);
        if (r?.results?.length) return r;
      } catch { /* ignore */ }
      return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
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
        const anilist = await fetchPopularMoviesFromAniList(perPage);
        if (anilist?.results?.length) return anilist;
      } catch (err) {
        console.error('[useAnilistHomeMovies] AniList fetch failed:', err);
      }
      try {
        const r = await apiClient.browseAnime({ type: 'Movie', sort: 'popularity' }, 1, false, perPage);
        if (r?.results?.length) return r;
      } catch { /* ignore */ }
      return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
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
        const anilist = await fetchActionTrendingFromAniList(perPage);
        if (anilist?.results?.length) return anilist;
      } catch (err) {
        console.error('[useAnilistHomeAction] AniList fetch failed:', err);
      }
      try {
        const r = await apiClient.browseAnime({ genre: 'Action', sort: 'trending' }, 1, false, perPage);
        if (r?.results?.length) return r;
      } catch { /* ignore */ }
      return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...homeRetry,
  });
}
