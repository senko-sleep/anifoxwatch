import { useQuery } from '@tanstack/react-query';
import type { SeasonalResponse } from '@/lib/api-client';
import type { Anime, AnimeSearchResult } from '@/types/anime';
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
    queryFn: () => fetchTrendingFromAniList(perPage),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeLatest(perPage: number = 24) {
  return useQuery<Anime[], Error>({
    queryKey: [...homeAnilistKey.latest, perPage],
    queryFn: () => fetchLatestFromAniList(perPage),
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeSeasonal(year: number, season: string, enabled: boolean = true) {
  return useQuery<SeasonalResponse, Error>({
    queryKey: homeAnilistKey.seasonal(year, season),
    queryFn: () => fetchSeasonalFromAniList(year, season),
    enabled: enabled && !!year && !!season,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeUpcoming(perPage: number = 24) {
  return useQuery<AnimeSearchResult, Error>({
    queryKey: [...homeAnilistKey.upcoming, perPage],
    queryFn: () => fetchUpcomingFromAniList(perPage),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeMovies(perPage: number = 20) {
  return useQuery<AnimeSearchResult, Error>({
    queryKey: [...homeAnilistKey.movies, perPage],
    queryFn: () => fetchPopularMoviesFromAniList(perPage),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...homeRetry,
  });
}

export function useAnilistHomeAction(perPage: number = 20) {
  return useQuery<AnimeSearchResult, Error>({
    queryKey: [...homeAnilistKey.action, perPage],
    queryFn: () => fetchActionTrendingFromAniList(perPage),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...homeRetry,
  });
}
