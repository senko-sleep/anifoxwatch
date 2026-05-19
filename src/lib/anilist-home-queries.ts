/**
 * Home page anime rows — Multi-source fallback including AniList, Jikan, Kitsu.
 * Works even when AniList is down.
 */

import { fetchAniListGraphQL } from '@/lib/anilist-graphql';
import type { SeasonalResponse } from '@/lib/api-client';
import type { Anime, AnimeSearchResult } from '@/types/anime';

const MEDIA_FIELDS = `
  id
  title { romaji english }
  coverImage { extraLarge large }
  bannerImage
  description
  genres
  episodes
  duration
  format
  status
  averageScore
  popularity
  seasonYear
  season
  studios(isMain: true) { nodes { name } }
`;

const statusMap: Record<string, Anime['status']> = {
  RELEASING: 'Ongoing',
  FINISHED: 'Completed',
  NOT_YET_RELEASED: 'Upcoming',
  CANCELLED: 'Completed',
  HIATUS: 'Ongoing',
};

const formatMap: Record<string, Anime['type']> = {
  TV: 'TV',
  MOVIE: 'Movie',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Special',
};

export interface AniListHomeMedia {
  id: number;
  title: { english: string | null; romaji: string };
  coverImage: { extraLarge: string; large: string };
  bannerImage: string | null;
  description: string | null;
  genres: string[];
  episodes: number | null;
  duration: number | null;
  format: string | null;
  status: string | null;
  averageScore: number | null;
  seasonYear: number | null;
  season: string | null;
  studios: { nodes: { name: string }[] };
}

export function mapAniListMediaToAnime(m: AniListHomeMedia, yearFallback?: number): Anime {
  const year = yearFallback ?? m.seasonYear ?? undefined;
  return {
    id: `anilist-${m.id}`,
    title: m.title.english || m.title.romaji || 'Unknown',
    titleJapanese: m.title.romaji || undefined,
    image: m.coverImage.extraLarge || m.coverImage.large || '',
    cover: m.coverImage.extraLarge || m.coverImage.large || '',
    banner: m.bannerImage || undefined,
    description: (m.description || '').replace(/<[^>]+>/g, '').trim(),
    type: formatMap[m.format || ''] ?? 'TV',
    status: statusMap[m.status || ''] ?? 'Ongoing',
    rating: m.averageScore ? m.averageScore / 10 : undefined,
    episodes: m.episodes || 0,
    genres: m.genres || [],
    studios: m.studios?.nodes?.map((s) => s.name) ?? [],
    year,
    season: m.season || undefined,
    isMature: false,
    source: 'anilist',
  };
}

async function fetchMediaPage(query: string): Promise<{
  media: AniListHomeMedia[];
  pageInfo: { hasNextPage: boolean; currentPage: number; total: number };
}> {
  const res = await fetchAniListGraphQL({ query });
  // Handle HTTP errors (403, etc.) - return empty to allow fallback
  if (!res.ok) {
    console.warn(`[AniList] HTTP ${res.status} - API may be temporarily unavailable`);
    return { media: [], pageInfo: { hasNextPage: false, currentPage: 1, total: 0 } };
  }
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: { Page?: { media?: AniListHomeMedia[]; pageInfo?: { hasNextPage: boolean; currentPage: number; total: number } } };
  };
  if (json.errors?.length) {
    // Log error but return empty instead of throwing to allow fallback
    console.warn('[AniList] Query error:', json.errors[0]?.message);
    return { media: [], pageInfo: { hasNextPage: false, currentPage: 1, total: 0 } };
  }
  const page = json.data?.Page;
  return {
    media: (page?.media ?? []) as AniListHomeMedia[],
    pageInfo: page?.pageInfo ?? { hasNextPage: false, currentPage: 1, total: 0 },
  };
}

const CARD_FORMATS = 'format_in:[TV,MOVIE,ONA,OVA]';

/** Trending worldwide (safe, typical TV+film formats). */
export async function fetchTrendingFromAniList(perPage: number = 24): Promise<Anime[]> {
  const query = `{
    Page(page:1,perPage:${perPage}) {
      media(type:ANIME,sort:TRENDING_DESC,isAdult:false,${CARD_FORMATS}) { ${MEDIA_FIELDS} }
    }
  }`;
  const { media } = await fetchMediaPage(query);
  return media.map((m) => mapAniListMediaToAnime(m));
}

/** Recently updated entries (closest AniList analogue to “latest episodes”). */
export async function fetchLatestFromAniList(perPage: number = 24): Promise<Anime[]> {
  const query = `{
    Page(page:1,perPage:${perPage}) {
      media(type:ANIME,sort:UPDATED_AT_DESC,status:RELEASING,isAdult:false,${CARD_FORMATS}) { ${MEDIA_FIELDS} }
    }
  }`;
  const { media } = await fetchMediaPage(query);
  return media.map((m) => mapAniListMediaToAnime(m));
}

export async function fetchSeasonalFromAniList(year: number, season: string): Promise<SeasonalResponse> {
  const query = `{
    Page(page:1,perPage:40) {
      pageInfo { hasNextPage currentPage total }
      media(type:ANIME,season:${season},seasonYear:${year},sort:POPULARITY_DESC,isAdult:false,${CARD_FORMATS}) { ${MEDIA_FIELDS} }
    }
  }`;
  const { media, pageInfo } = await fetchMediaPage(query);
  const results = media.map((m) => mapAniListMediaToAnime(m, year));

  return {
    results,
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      currentPage: pageInfo.currentPage,
      totalPages: 1,
      totalItems: pageInfo.total ?? results.length,
    },
    seasonInfo: { year, season: season.toLowerCase() },
    source: 'AniList',
  };
}

export async function fetchUpcomingFromAniList(perPage: number = 24): Promise<AnimeSearchResult> {
  const query = `{
    Page(page:1,perPage:${perPage}) {
      pageInfo { hasNextPage currentPage total }
      media(type:ANIME,sort:POPULARITY_DESC,status:NOT_YET_RELEASED,isAdult:false,${CARD_FORMATS}) { ${MEDIA_FIELDS} }
    }
  }`;
  const { media, pageInfo } = await fetchMediaPage(query);
  const results = media.map((m) => mapAniListMediaToAnime(m));
  return {
    results,
    totalPages: 1,
    currentPage: 1,
    hasNextPage: pageInfo.hasNextPage,
    totalResults: pageInfo.total ?? results.length,
  };
}

export async function fetchPopularMoviesFromAniList(perPage: number = 20): Promise<AnimeSearchResult> {
  const query = `{
    Page(page:1,perPage:${perPage}) {
      pageInfo { hasNextPage currentPage total }
      media(type:ANIME,format:MOVIE,sort:POPULARITY_DESC,isAdult:false) { ${MEDIA_FIELDS} }
    }
  }`;
  const { media, pageInfo } = await fetchMediaPage(query);
  const results = media.map((m) => mapAniListMediaToAnime(m));
  return {
    results,
    totalPages: 1,
    currentPage: 1,
    hasNextPage: pageInfo.hasNextPage,
    totalResults: pageInfo.total ?? results.length,
  };
}

export async function fetchActionTrendingFromAniList(perPage: number = 20): Promise<AnimeSearchResult> {
  const query = `{
    Page(page:1,perPage:${perPage}) {
      pageInfo { hasNextPage currentPage total }
      media(type:ANIME,genre:"Action",sort:TRENDING_DESC,isAdult:false,${CARD_FORMATS}) { ${MEDIA_FIELDS} }
    }
  }`;
  const { media, pageInfo } = await fetchMediaPage(query);
  const results = media.map((m) => mapAniListMediaToAnime(m));
  return {
    results,
    totalPages: 1,
    currentPage: 1,
    hasNextPage: pageInfo.hasNextPage,
    totalResults: pageInfo.total ?? results.length,
  };
}

// ─── Jikan (MyAnimeList API) Fallbacks ─────────────────────────────────────────

async function fetchFromJikanTop(page: number, perPage: number, filter: string = 'airing'): Promise<Anime[]> {
  try {
    const response = await fetch(`https://api.jikan.moe/v4/top/anime?page=${page}&limit=${perPage}&filter=${filter}`);
    if (!response.ok) return [];
    const json = (await response.json()) as { data?: Array<{
      mal_id: number;
      title: string;
      title_english?: string;
      images?: { jpg?: { image_url?: string; large_image?: string } };
      synopsis?: string;
      genres?: Array<{ name: string }>;
      score?: number;
      episodes?: number;
      status?: string;
    }> };
    return (json.data || []).map((item) => ({
      id: `mal-${item.mal_id}`,
      title: item.title_english || item.title,
      titleJapanese: item.title,
      image: item.images?.jpg?.large_image || item.images?.jpg?.image_url || '',
      cover: item.images?.jpg?.image_url || '',
      banner: undefined,
      description: (item.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'TV' as const,
      status: item.status === 'Airing' ? 'Ongoing' : item.status === 'Complete' ? 'Completed' : 'Unknown',
      rating: item.score,
      episodes: item.episodes || 0,
      genres: item.genres?.map((g) => g.name) || [],
      studios: [],
      year: undefined,
      season: undefined,
      isMature: false,
      source: 'jikan',
    }));
  } catch {
    return [];
  }
}

// ─── Kitsu API Fallbacks ───────────────────────────────────────────────────────

async function fetchFromKitsuPopular(page: number, perPage: number): Promise<Anime[]> {
  try {
    const offset = (page - 1) * perPage;
    const response = await fetch(`https://kitsu.io/api/edge/anime?page[limit]=${perPage}&page[offset]=${offset}&sort=-popularityRank&filter[status]=current`, {
      headers: { Accept: 'application/vnd.api+json' },
    });
    if (!response.ok) return [];
    const json = (await response.json()) as {
      data?: Array<{
        id: string;
        attributes?: {
          titles?: { en?: string; en_jp?: string };
          coverImage?: { large?: string };
          synopsis?: string;
          averageRating?: string;
          episodeCount?: number;
          status?: string;
        };
      }>;
    };
    return (json.data || []).map((item) => ({
      id: `kitsu-${item.id}`,
      title: item.attributes?.titles?.en || item.attributes?.titles?.en_jp || '',
      titleJapanese: item.attributes?.titles?.en_jp,
      image: item.attributes?.coverImage?.large || '',
      cover: item.attributes?.coverImage?.large || '',
      banner: undefined,
      description: (item.attributes?.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'TV' as const,
      status: item.attributes?.status === 'current' ? 'Ongoing' : 'Unknown',
      rating: item.attributes?.averageRating ? parseFloat(item.attributes.averageRating) : undefined,
      episodes: item.attributes?.episodeCount || 0,
      genres: [],
      studios: [],
      year: undefined,
      season: undefined,
      isMature: false,
      source: 'kitsu',
    }));
  } catch {
    return [];
  }
}

// ─── Public fallback functions (used by hooks) ─────────────────────────────────

export async function fetchTrendingFromJikan(perPage: number = 24): Promise<Anime[]> {
  return fetchFromJikanTop(1, perPage, 'airing');
}

export async function fetchTrendingFromKitsu(perPage: number = 24): Promise<Anime[]> {
  return fetchFromKitsuPopular(1, perPage);
}

export async function fetchLatestFromJikan(perPage: number = 24): Promise<Anime[]> {
  return fetchFromJikanTop(1, perPage, 'airing');
}
