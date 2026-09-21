import { apiUrl } from '@/lib/api-config';
import type { Anime, AnimeSearchResult, Episode } from '@/types/anime';

/**
 * Client for the adult catalog's own API (`/api/hentai/*`) — the counterpart to
 * the anime endpoints. Everything adult reads from here, so a title's page, its
 * episodes and its video always come from the same source.
 */

export type HentaiSort = 'popular' | 'trending' | 'rating' | 'newest' | 'title';

export interface HentaiSection {
  key: string;
  title: string;
  subtitle?: string;
  /** Genre slug for a genre shelf, so the UI can link to the full list. */
  genre?: string;
  items: Anime[];
}

export interface HentaiGenre {
  slug: string;
  name: string;
}

export interface HentaiHomeData {
  featured: Anime[];
  sections: HentaiSection[];
  genres: HentaiGenre[];
}

export interface HentaiTitleData {
  anime: Anime;
  episodes: Episode[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw Object.assign(new Error(`Adult catalog request failed (${res.status})`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export const hentaiApi = {
  home: () => getJson<HentaiHomeData>('/api/hentai/home'),

  browse: (genre: string | undefined, page = 1, sort?: HentaiSort) =>
    getJson<AnimeSearchResult>(
      `/api/hentai/browse?page=${page}${genre ? `&genre=${encodeURIComponent(genre)}` : ''}${sort ? `&sort=${sort}` : ''}`
    ),

  search: (query: string, page = 1) =>
    getJson<AnimeSearchResult>(`/api/hentai/search?q=${encodeURIComponent(query)}&page=${page}`),

  genres: () => getJson<{ genres: HentaiGenre[] }>('/api/hentai/genres'),

  title: (slug: string) => getJson<HentaiTitleData>(`/api/hentai/title/${encodeURIComponent(slug)}`),
};
