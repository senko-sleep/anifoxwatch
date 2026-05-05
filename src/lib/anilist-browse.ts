/**
 * AniList-powered Browse & Search for the Browse page.
 *
 * Replaces the backend /api/anime/search and /api/anime/browse with direct
 * AniList GraphQL queries so the browser page always shows AniList data.
 */

import { fetchAniListGraphQL } from '@/lib/anilist-graphql';
import { mapAniListMediaToAnime, type AniListHomeMedia } from '@/lib/anilist-home-queries';
import type { Anime, AnimeSearchResult } from '@/types/anime';

// ─── Shared fragment ────────────────────────────────────────────────────────

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
  isAdult
`;

// ─── Mapping helpers ─────────────────────────────────────────────────────────

const FORMAT_MAP: Record<string, string> = {
  TV: 'TV',
  Movie: 'MOVIE',
  OVA: 'OVA',
  ONA: 'ONA',
  Special: 'SPECIAL',
};

const STATUS_MAP: Record<string, string> = {
  Ongoing: 'RELEASING',
  Completed: 'FINISHED',
  Upcoming: 'NOT_YET_RELEASED',
};

const SORT_MAP: Record<string, string> = {
  popularity: 'POPULARITY_DESC',
  trending: 'TRENDING_DESC',
  recently_released: 'UPDATED_AT_DESC',
  rating: 'SCORE_DESC',
  year: 'START_DATE_DESC',
  title: 'TITLE_ROMAJI',
};

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Search anime on AniList by query string.
 */
export async function searchAniList(
  query: string,
  page: number = 1,
  mode: 'safe' | 'mixed' | 'adult' = 'safe',
  perPage: number = 25,
): Promise<AnimeSearchResult> {
  const escaped = JSON.stringify(query);
  const adultFilter = mode === 'adult' ? ',isAdult:true' : mode === 'safe' ? ',isAdult:false' : '';

  const gql = `{
    Page(page:${page},perPage:${perPage}) {
      pageInfo { total currentPage lastPage hasNextPage perPage }
      media(search:${escaped},type:ANIME${adultFilter},sort:SEARCH_MATCH) {
        ${MEDIA_FIELDS}
      }
    }
  }`;

  try {
    const res = await fetchAniListGraphQL({ query: gql });
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const json = await res.json() as {
      errors?: { message: string }[];
      data?: { Page?: { pageInfo?: any; media?: AniListHomeMedia[] } };
    };
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const media = (json.data?.Page?.media ?? []) as AniListHomeMedia[];
    const pageInfo = json.data?.Page?.pageInfo;

    const results = media.map((m) => mapAniListMediaToAnime(m));

    return {
      results,
      totalPages: pageInfo?.lastPage ?? 1,
      currentPage: pageInfo?.currentPage ?? page,
      hasNextPage: pageInfo?.hasNextPage ?? false,
      totalResults: pageInfo?.total ?? results.length,
    };
  } catch (err) {
    console.error('[AniList Search]', err);
    return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, totalResults: 0 };
  }
}

// ─── Browse ──────────────────────────────────────────────────────────────────

interface AniListBrowseFilters {
  type?: string;
  genre?: string;
  status?: string;
  startYear?: number;
  endYear?: number;
  sort?: string;
  mode?: 'safe' | 'mixed' | 'adult';
}

/**
 * Browse/filter anime on AniList with genre, type, status, year, and sort.
 */
export async function browseAniList(
  filters: AniListBrowseFilters,
  page: number = 1,
  perPage: number = 25,
): Promise<AnimeSearchResult> {
  const parts: string[] = ['type:ANIME'];

  // Adult filter
  if (filters.mode === 'adult') {
    parts.push('isAdult:true');
  } else if (filters.mode === 'safe' || !filters.mode) {
    parts.push('isAdult:false');
  }
  // 'mixed' mode = no isAdult filter

  // Format
  if (filters.type && FORMAT_MAP[filters.type]) {
    parts.push(`format:${FORMAT_MAP[filters.type]}`);
  } else {
    // Default: exclude MUSIC and shorts
    parts.push('format_in:[TV,MOVIE,ONA,OVA,SPECIAL]');
  }

  // Status
  if (filters.status && STATUS_MAP[filters.status]) {
    parts.push(`status:${STATUS_MAP[filters.status]}`);
  }

  // Genre(s) — AniList supports genre_in for multiple
  if (filters.genre) {
    const genres = filters.genre.split(',').map(g => g.trim()).filter(Boolean);
    if (genres.length === 1) {
      parts.push(`genre:${JSON.stringify(genres[0])}`);
    } else if (genres.length > 1) {
      const genreList = genres.map(g => JSON.stringify(g)).join(',');
      parts.push(`genre_in:[${genreList}]`);
    }
  }

  // Year range
  if (filters.startYear && filters.endYear) {
    if (filters.startYear === filters.endYear) {
      parts.push(`seasonYear:${filters.startYear}`);
    } else {
      // AniList doesn't have native year range, use startDate_greater/lesser
      // Format: YYYYMMDD (fuzzy date int)
      parts.push(`startDate_greater:${filters.startYear}0000`);
      parts.push(`startDate_lesser:${filters.endYear}1231`);
    }
  } else if (filters.startYear) {
    parts.push(`startDate_greater:${filters.startYear}0000`);
  } else if (filters.endYear) {
    parts.push(`startDate_lesser:${filters.endYear}1231`);
  }

  // Sort
  const sort = filters.sort || 'popularity';
  if (sort === 'shuffle') {
    // AniList has no random sort. We pick a random page of popular results.
    const randomPage = Math.floor(Math.random() * 20) + 1;
    parts.push('sort:POPULARITY_DESC');
    page = randomPage;
  } else {
    parts.push(`sort:${SORT_MAP[sort] || 'POPULARITY_DESC'}`);
  }

  const filterStr = parts.join(',');

  const gql = `{
    Page(page:${page},perPage:${perPage}) {
      pageInfo { total currentPage lastPage hasNextPage perPage }
      media(${filterStr}) {
        ${MEDIA_FIELDS}
      }
    }
  }`;

  try {
    const res = await fetchAniListGraphQL({ query: gql });
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const json = await res.json() as {
      errors?: { message: string }[];
      data?: { Page?: { pageInfo?: any; media?: AniListHomeMedia[] } };
    };
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const media = (json.data?.Page?.media ?? []) as AniListHomeMedia[];
    const pageInfo = json.data?.Page?.pageInfo;

    let results = media.map((m) => mapAniListMediaToAnime(m));

    // Shuffle actual results for "random" sort
    if (sort === 'shuffle') {
      results = results.sort(() => Math.random() - 0.5);
    }

    return {
      results,
      totalPages: pageInfo?.lastPage ?? 1,
      currentPage: pageInfo?.currentPage ?? page,
      hasNextPage: pageInfo?.hasNextPage ?? false,
      totalResults: pageInfo?.total ?? results.length,
    };
  } catch (err) {
    console.error('[AniList Browse]', err);
    return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, totalResults: 0 };
  }
}
