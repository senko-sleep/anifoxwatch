/**
 * Home page anime rows — sourced only from AniList GraphQL (public API).
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
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: { Page?: { media?: AniListHomeMedia[]; pageInfo?: { hasNextPage: boolean; currentPage: number; total: number } } };
  };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList query failed');
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
