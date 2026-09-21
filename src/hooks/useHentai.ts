import { useQuery } from '@tanstack/react-query';
import { hentaiApi, type HentaiGenre, type HentaiHomeData, type HentaiTitleData } from '@/lib/hentai-client';

/** The adult default screen: a featured hero and curated shelves. */
export function useHentaiHome(enabled: boolean = true) {
  return useQuery<HentaiHomeData, Error>({
    queryKey: ['hentai', 'home'],
    queryFn: hentaiApi.home,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 2,
  });
}

/** One title: real details and its own episodes (with stills), from a single request. */
export function useHentaiTitle(slug: string | undefined, enabled: boolean = true) {
  return useQuery<HentaiTitleData, Error>({
    queryKey: ['hentai', 'title', slug],
    queryFn: () => hentaiApi.title(slug!),
    enabled: enabled && Boolean(slug),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // A missing series is a 404, not a hiccup — don't hammer it.
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}

/** The adult catalog's real genres (what the source actually has), for the filter chips. */
export function useHentaiGenres(enabled: boolean = true) {
  return useQuery<HentaiGenre[], Error>({
    queryKey: ['hentai', 'genres'],
    queryFn: async () => (await hentaiApi.genres()).genres,
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
