/**
 * Home page anime rows — Multi-source fallback including AniList, Jikan, Kitsu.
 * Works even when AniList is down.
 */

import { fetchAniListGraphQL } from '@/lib/anilist-graphql';
import { generateAnimeSlug } from '@/lib/utils';
import type { SeasonalResponse } from '@/lib/api-client';
import type { Anime, AnimeSearchResult } from '@/types/anime';

const MEDIA_FIELDS = `
  id
  title { romaji english }
  coverImage { extraLarge large color }
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
  coverImage: { extraLarge: string; large: string; color?: string | null };
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
  isAdult?: boolean;
}

export function mapAniListMediaToAnime(m: AniListHomeMedia, yearFallback?: number): Anime {
  const year = yearFallback ?? m.seasonYear ?? undefined;
  const title = m.title.english || m.title.romaji || 'Unknown';
  // Use anilist-XXXXX as the canonical ID so Watch.tsx can resolve it directly
  // without fuzzy slug matching. The URL will still look clean (see generateWatchUrl).
  const anilistId = `anilist-${m.id}`;
  return {
    id: anilistId,
    title,
    titleEnglish: m.title.english || undefined,
    titleRomaji: m.title.romaji || undefined,
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
    accentColor: m.coverImage?.color || undefined,
    isMature: m.isAdult ?? false,
    source: 'anilist',
  };
}

async function fetchMediaPage(query: string): Promise<{
  media: AniListHomeMedia[];
  pageInfo: { hasNextPage: boolean; currentPage: number; total: number };
}> {
  const res = await fetchAniListGraphQL({ query });
  if (!res.ok) {
    const msg = `[AniList] HTTP ${res.status}`;
    console.warn(msg);
    throw new Error(msg);
  }
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: { Page?: { media?: AniListHomeMedia[]; pageInfo?: { hasNextPage: boolean; currentPage: number; total: number } } };
  };
  if (json.errors?.length) {
    const msg = `[AniList] Query error: ${json.errors[0]?.message}`;
    console.warn(msg);
    throw new Error(msg);
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
      status: item.status === 'Airing' ? 'Ongoing' : item.status === 'Complete' ? 'Completed' : 'Upcoming',
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
      status: item.attributes?.status === 'current' ? 'Ongoing' : 'Upcoming',
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

export async function fetchSeasonalFromJikan(year: number, season: string): Promise<SeasonalResponse> {
  try {
    const s = season.toLowerCase();
    const res = await fetch(`https://api.jikan.moe/v4/seasons/${year}/${s}?limit=25`);
    if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
    const json = await res.json();
    const results: Anime[] = (json.data || []).map((item: any) => ({
      id: `mal-${item.mal_id}`,
      title: item.title_english || item.title,
      titleJapanese: item.title,
      image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
      cover: item.images?.jpg?.image_url || '',
      banner: undefined,
      description: (item.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'TV' as const,
      status: item.status === 'Airing' ? 'Ongoing' : item.status === 'Complete' ? 'Completed' : 'Upcoming',
      rating: item.score,
      episodes: item.episodes || 0,
      genres: item.genres?.map((g: any) => g.name) || [],
      studios: item.studios?.map((s: any) => s.name) || [],
      year,
      season: s,
      isMature: false,
      source: 'jikan',
    }));
    return {
      results,
      pageInfo: { hasNextPage: json.pagination?.has_next_page ?? false, currentPage: 1, totalPages: 1, totalItems: results.length },
      seasonInfo: { year, season: s },
      source: 'jikan',
    };
  } catch {
    return {
      results: [],
      pageInfo: { hasNextPage: false, currentPage: 1, totalPages: 0, totalItems: 0 },
      seasonInfo: { year, season: season.toLowerCase() },
      source: 'jikan',
    };
  }
}

export async function fetchUpcomingFromJikan(perPage: number = 24): Promise<AnimeSearchResult> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/seasons/upcoming?limit=${perPage}`);
    if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
    const json = await res.json();
    const results: Anime[] = (json.data || []).map((item: any) => ({
      id: `mal-${item.mal_id}`,
      title: item.title_english || item.title,
      titleJapanese: item.title,
      image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
      cover: item.images?.jpg?.image_url || '',
      banner: undefined,
      description: (item.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'TV' as const,
      status: 'Upcoming' as const,
      rating: item.score,
      episodes: item.episodes || 0,
      genres: item.genres?.map((g: any) => g.name) || [],
      studios: [],
      year: undefined,
      season: undefined,
      isMature: false,
      source: 'jikan',
    }));
    return {
      results,
      totalPages: 1,
      currentPage: 1,
      hasNextPage: json.pagination?.has_next_page ?? false,
      totalResults: results.length,
    };
  } catch {
    return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
  }
}

export async function fetchUpcomingFromKitsu(perPage: number = 24): Promise<AnimeSearchResult> {
  try {
    const res = await fetch(`https://kitsu.io/api/edge/anime?page[limit]=${perPage}&filter[status]=upcoming&sort=-userCount`, {
      headers: { Accept: 'application/vnd.api+json' },
    });
    if (!res.ok) throw new Error(`Kitsu HTTP ${res.status}`);
    const json = await res.json();
    const results: Anime[] = (json.data || []).map((item: any) => ({
      id: `kitsu-${item.id}`,
      title: item.attributes?.titles?.en || item.attributes?.titles?.en_jp || '',
      titleJapanese: item.attributes?.titles?.en_jp,
      image: item.attributes?.posterImage?.large || item.attributes?.coverImage?.large || '',
      cover: item.attributes?.posterImage?.large || '',
      banner: undefined,
      description: (item.attributes?.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'TV' as const,
      status: 'Upcoming' as const,
      rating: item.attributes?.averageRating ? parseFloat(item.attributes.averageRating) / 10 : undefined,
      episodes: item.attributes?.episodeCount || 0,
      genres: [],
      studios: [],
      year: undefined,
      season: undefined,
      isMature: false,
      source: 'kitsu',
    }));
    return { results, totalPages: 1, currentPage: 1, hasNextPage: false, totalResults: results.length };
  } catch {
    return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
  }
}

export async function fetchPopularMoviesFromJikan(perPage: number = 20): Promise<AnimeSearchResult> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/top/anime?type=movie&limit=${perPage}`);
    if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
    const json = await res.json();
    const results: Anime[] = (json.data || []).map((item: any) => ({
      id: `mal-${item.mal_id}`,
      title: item.title_english || item.title,
      titleJapanese: item.title,
      image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
      cover: item.images?.jpg?.image_url || '',
      banner: undefined,
      description: (item.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'Movie' as const,
      status: 'Completed' as const,
      rating: item.score,
      episodes: 1,
      genres: item.genres?.map((g: any) => g.name) || [],
      studios: [],
      year: item.year,
      season: undefined,
      isMature: false,
      source: 'jikan',
    }));
    return {
      results,
      totalPages: 1,
      currentPage: 1,
      hasNextPage: json.pagination?.has_next_page ?? false,
      totalResults: results.length,
    };
  } catch {
    return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
  }
}

export async function fetchPopularMoviesFromKitsu(perPage: number = 20): Promise<AnimeSearchResult> {
  try {
    const res = await fetch(`https://kitsu.io/api/edge/anime?page[limit]=${perPage}&filter[subtype]=movie&sort=-userCount`, {
      headers: { Accept: 'application/vnd.api+json' },
    });
    if (!res.ok) throw new Error(`Kitsu HTTP ${res.status}`);
    const json = await res.json();
    const results: Anime[] = (json.data || []).map((item: any) => ({
      id: `kitsu-${item.id}`,
      title: item.attributes?.titles?.en || item.attributes?.titles?.en_jp || '',
      titleJapanese: item.attributes?.titles?.en_jp,
      image: item.attributes?.posterImage?.large || item.attributes?.coverImage?.large || '',
      cover: item.attributes?.posterImage?.large || '',
      banner: undefined,
      description: (item.attributes?.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'Movie' as const,
      status: 'Completed' as const,
      rating: item.attributes?.averageRating ? parseFloat(item.attributes.averageRating) / 10 : undefined,
      episodes: 1,
      genres: [],
      studios: [],
      year: undefined,
      season: undefined,
      isMature: false,
      source: 'kitsu',
    }));
    return { results, totalPages: 1, currentPage: 1, hasNextPage: false, totalResults: results.length };
  } catch {
    return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
  }
}

export async function fetchActionTrendingFromJikan(perPage: number = 20): Promise<AnimeSearchResult> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?genres=1&order_by=popularity&sort=desc&limit=${perPage}`);
    if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
    const json = await res.json();
    const results: Anime[] = (json.data || []).map((item: any) => ({
      id: `mal-${item.mal_id}`,
      title: item.title_english || item.title,
      titleJapanese: item.title,
      image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
      cover: item.images?.jpg?.image_url || '',
      banner: undefined,
      description: (item.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'TV' as const,
      status: item.status === 'Airing' ? 'Ongoing' : 'Completed',
      rating: item.score,
      episodes: item.episodes || 0,
      genres: item.genres?.map((g: any) => g.name) || ['Action'],
      studios: [],
      year: item.year,
      season: undefined,
      isMature: false,
      source: 'jikan',
    }));
    return {
      results,
      totalPages: 1,
      currentPage: 1,
      hasNextPage: json.pagination?.has_next_page ?? false,
      totalResults: results.length,
    };
  } catch {
    return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
  }
}

export async function fetchActionTrendingFromKitsu(perPage: number = 20): Promise<AnimeSearchResult> {
  try {
    const res = await fetch(`https://kitsu.io/api/edge/anime?page[limit]=${perPage}&filter[categories]=action&sort=-userCount`, {
      headers: { Accept: 'application/vnd.api+json' },
    });
    if (!res.ok) throw new Error(`Kitsu HTTP ${res.status}`);
    const json = await res.json();
    const results: Anime[] = (json.data || []).map((item: any) => ({
      id: `kitsu-${item.id}`,
      title: item.attributes?.titles?.en || item.attributes?.titles?.en_jp || '',
      titleJapanese: item.attributes?.titles?.en_jp,
      image: item.attributes?.posterImage?.large || item.attributes?.coverImage?.large || '',
      cover: item.attributes?.posterImage?.large || '',
      banner: undefined,
      description: (item.attributes?.synopsis || '').replace(/<[^>]+>/g, '').trim(),
      type: 'TV' as const,
      status: item.attributes?.status === 'current' ? 'Ongoing' : 'Completed',
      rating: item.attributes?.averageRating ? parseFloat(item.attributes.averageRating) / 10 : undefined,
      episodes: item.attributes?.episodeCount || 0,
      genres: ['Action'],
      studios: [],
      year: undefined,
      season: undefined,
      isMature: false,
      source: 'kitsu',
    }));
    return { results, totalPages: 1, currentPage: 1, hasNextPage: false, totalResults: results.length };
  } catch {
    return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, totalResults: 0 };
  }
}

// ─── Related titles ──────────────────────────────────────────────────────────

/** Relation types that mean "same story" — shown before community picks. */
const STORY_RELATIONS = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY']);

interface RelatedMedia extends AniListHomeMedia {
  type?: string;
}

/**
 * Titles actually related to one anime, straight from AniList:
 * its franchise (sequels, prequels, spin-offs) first, then what AniList users
 * recommend for it, best-rated first. Resolves by AniList id when we have it,
 * otherwise by best title match.
 */
export async function fetchRelatedFromAniList(
  animeId: string | undefined,
  title: string | undefined,
  includeAdult = false
): Promise<Anime[]> {
  const anilistId = animeId?.match(/^anilist-(\d+)$/)?.[1];
  if (!anilistId && !title) return [];

  const node = `${MEDIA_FIELDS} type isAdult`;
  const query = `query ($id: Int, $search: String) {
    Media(id: $id, search: $search, type: ANIME) {
      id
      relations { edges { relationType(version: 2) node { ${node} } } }
      recommendations(sort: RATING_DESC, perPage: 25) {
        nodes { rating mediaRecommendation { ${node} } }
      }
    }
  }`;

  const res = await fetchAniListGraphQL({
    query,
    variables: anilistId ? { id: Number(anilistId) } : { search: title },
  });
  if (!res.ok) throw new Error(`[AniList] HTTP ${res.status}`);

  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: {
      Media?: {
        id: number;
        relations?: { edges: { relationType: string; node: RelatedMedia }[] };
        recommendations?: { nodes: { rating: number | null; mediaRecommendation: RelatedMedia | null }[] };
      } | null;
    };
  };
  const media = json.data?.Media;
  if (!media) return [];

  const seen = new Set<number>([media.id]);
  const out: Anime[] = [];
  const add = (m: RelatedMedia | null | undefined) => {
    if (!m || seen.has(m.id) || m.type !== 'ANIME') return;
    if (m.isAdult && !includeAdult) return;
    seen.add(m.id);
    out.push(mapAniListMediaToAnime(m));
  };

  (media.relations?.edges ?? [])
    .filter((e) => STORY_RELATIONS.has(e.relationType))
    .forEach((e) => add(e.node));

  (media.recommendations?.nodes ?? [])
    .filter((n) => (n.rating ?? 0) > 0)
    .forEach((n) => add(n.mediaRecommendation));

  return out;
}

// ─── Seasons ─────────────────────────────────────────────────────────────────
// AniList models every season of a show as its own entry, linked by
// PREQUEL / SEQUEL edges. Walking that chain gives the season list.

export interface SeasonEntry {
  id: number;
  title: string;
  year: number | null;
  episodes: number | null;
}

interface SeasonNode {
  id: number;
  type?: string;
  format: string | null;
  title: { english: string | null; romaji: string };
  seasonYear: number | null;
  episodes: number | null;
}

const SEASON_NODE = 'id type format title { romaji english } seasonYear episodes';
const SEASON_MAX_HOPS = 12;

const toSeason = (n: SeasonNode): SeasonEntry => ({
  id: n.id,
  title: n.title.english || n.title.romaji,
  year: n.seasonYear,
  episodes: n.episodes,
});

async function fetchSeasonLinks(id: number): Promise<{ self: SeasonNode; prequel?: SeasonNode; sequel?: SeasonNode } | null> {
  const query = `query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${SEASON_NODE}
      relations { edges { relationType(version: 2) node { ${SEASON_NODE} } } }
    }
  }`;
  const res = await fetchAniListGraphQL({ query, variables: { id } });
  if (!res.ok) throw new Error(`[AniList] HTTP ${res.status}`);
  const json = (await res.json()) as {
    data?: { Media?: (SeasonNode & { relations?: { edges: { relationType: string; node: SeasonNode }[] } }) | null };
  };
  const media = json.data?.Media;
  if (!media) return null;

  // Follow every prequel/sequel, not only the TV ones: a franchise often runs
  // season → film → season, and stopping at the film hides everything after it.
  // Which entries are *listed* as seasons is decided separately, by isSeason.
  const edges = media.relations?.edges ?? [];
  const linked = (type: string) => edges.find((e) => e.relationType === type && e.node.type === 'ANIME')?.node;
  return { self: media, prequel: linked('PREQUEL'), sequel: linked('SEQUEL') };
}

/** Only full TV entries are seasons; films and specials are stops along the way. */
const isSeason = (n: SeasonNode) => n.type === 'ANIME' && (n.format === 'TV' || n.format === 'TV_SHORT');

/** Every TV season of a franchise, in watch order. One entry (or none) means "no season picker". */
export async function fetchSeasonChain(animeId: string | undefined): Promise<SeasonEntry[]> {
  const startId = Number(animeId?.match(/^anilist-(\d+)$/)?.[1]);
  if (!startId) return [];

  const start = await fetchSeasonLinks(startId);
  if (!start) return [];

  const seen = new Set<number>([startId]);
  const before: SeasonEntry[] = [];
  const after: SeasonEntry[] = [];

  let cursor = start.prequel;
  for (let hop = 0; cursor && !seen.has(cursor.id) && hop < SEASON_MAX_HOPS; hop++) {
    seen.add(cursor.id);
    if (isSeason(cursor)) before.unshift(toSeason(cursor));
    cursor = (await fetchSeasonLinks(cursor.id))?.prequel;
  }

  cursor = start.sequel;
  for (let hop = 0; cursor && !seen.has(cursor.id) && hop < SEASON_MAX_HOPS; hop++) {
    seen.add(cursor.id);
    if (isSeason(cursor)) after.push(toSeason(cursor));
    cursor = (await fetchSeasonLinks(cursor.id))?.sequel;
  }

  return [...before, toSeason(start.self), ...after];
}


// ─── Artwork ─────────────────────────────────────────────────────────────────

export interface AniListArtwork {
  /** AniList's wide banner. */
  banner?: string;
  /** A frame from the trailer — the fallback when there's no banner. */
  trailerThumb?: string;
}

/**
 * Wide artwork for one title. The API's anime endpoint only carries the small cover, so
 * anything wide (a movie's frame on its title page, a player poster) is fetched here.
 */
export async function fetchAniListArtwork(animeId: string | undefined): Promise<AniListArtwork> {
  const id = Number(animeId?.match(/^anilist-(\d+)$/)?.[1]);
  if (!id) return {};

  const res = await fetchAniListGraphQL({
    query: `query ($id: Int) { Media(id: $id, type: ANIME) { bannerImage trailer { site thumbnail } } }`,
    variables: { id },
  });
  if (!res.ok) return {};

  const json = (await res.json()) as {
    data?: { Media?: { bannerImage: string | null; trailer: { site: string | null; thumbnail: string | null } | null } | null };
  };
  const media = json.data?.Media;
  return {
    banner: media?.bannerImage || undefined,
    trailerThumb: media?.trailer?.thumbnail || undefined,
  };
}
