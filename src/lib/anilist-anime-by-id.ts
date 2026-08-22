/**
 * Multi-source Anime Metadata Fetcher.
 * Resolves anime details using AniList -> Jikan (MyAnimeList) -> Kitsu -> Synthetic Fallback.
 * Ensures the clicked anime details always load reliably even when AniList returns 403 or is offline.
 */

import type { Anime } from '@/types/anime';
import { fetchAniListGraphQL } from '@/lib/anilist-graphql';
import { generateAnimeSlug } from '@/lib/utils';

const FORMAT_MAP: Record<string, Anime['type']> = {
  TV: 'TV',
  MOVIE: 'Movie',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Special',
};

const STATUS_MAP: Record<string, Anime['status']> = {
  FINISHED: 'Completed',
  RELEASING: 'Ongoing',
  NOT_YET_RELEASED: 'Upcoming',
  CANCELLED: 'Completed',
};

// In-memory cache for fast metadata lookup
const animeDetailCache = new Map<string, Anime>();

/**
 * Extract a clean human-readable search title from any anime ID or slug.
 * Examples:
 * - "boku-no-pico-1639" -> "boku no pico"
 * - "chainsaw-man-127230" -> "chainsaw man"
 * - "animekai-spy-x-family-jrnv" -> "spy x family"
 * - "watchhentai-series-boku-no-pico" -> "boku no pico"
 */
export function extractTitleFromSlug(slug: string): string {
  if (!slug) return '';
  return slug
    .replace(/^anilist-/, '')
    .replace(/^(watchhentai-|hanime-|akih-|aniwaves-|yomi-|animekai-|allanime-|zoro-|gogoanime-|mal-|kitsu-)/i, '')
    .replace(/^series[/-]/i, '')
    .replace(/-\d{1,9}$/, '') // remove trailing numeric ID
    .replace(/-[a-z0-9]{3,6}$/i, '') // remove trailing hash like -jrnv
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract AniList numeric ID from string if present.
 */
export function extractNumericId(idOrSlug: string): number | null {
  if (!idOrSlug) return null;
  const directMatch = /^anilist-(\d+)$/i.exec(idOrSlug.trim());
  if (directMatch) return parseInt(directMatch[1], 10);
  if (/^\d+$/.test(idOrSlug.trim())) return parseInt(idOrSlug.trim(), 10);
  const trailingMatch = idOrSlug.match(/-(\d{1,9})$/);
  if (trailingMatch) return parseInt(trailingMatch[1], 10);
  return null;
}

/**
 * Primary: Load anime metadata by AniList numeric ID.
 */
export async function fetchAniListAnimeByNumericId(numericId: number): Promise<Anime | null> {
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
        type
        format
        status
        description
        startDate { year month day }
        endDate { year month day }
        season
        seasonYear
        episodes
        duration
        averageScore
        genres
        studios { nodes { id name } }
        coverImage { extraLarge large medium }
        bannerImage
        isAdult
      }
    }
  `;

  try {
    const res = await fetchAniListGraphQL({ query, variables: { id: numericId } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      errors?: unknown[];
      data?: {
        Media: {
          id: number;
          title: { romaji?: string; english?: string; native?: string };
          format: string;
          status: string;
          description?: string | null;
          startDate?: { year?: number };
          season?: string;
          seasonYear?: number;
          episodes?: number | null;
          duration?: number | null;
          averageScore?: number | null;
          genres?: string[];
          studios?: { nodes?: Array<{ name: string }> };
          coverImage?: { extraLarge?: string; large?: string; medium?: string };
          bannerImage?: string | null;
          isAdult?: boolean;
        } | null;
      };
    };

    if (json.errors?.length) return null;
    const m = json.data?.Media;
    if (!m) return null;

    const title = m.title.english || m.title.romaji || m.title.native || 'Unknown';
    const desc = m.description?.replace(/<[^>]*>/g, '').trim() || 'No description available.';
    const slug = generateAnimeSlug(title, String(m.id));

    return {
      id: `anilist-${m.id}`,
      streamingId: slug,
      title,
      titleJapanese: m.title.native || m.title.romaji,
      image: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || '',
      cover: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium,
      banner: m.bannerImage || undefined,
      description: desc,
      type: FORMAT_MAP[m.format] || 'TV',
      status: STATUS_MAP[m.status] || 'Completed',
      rating: m.averageScore ? m.averageScore / 10 : undefined,
      episodes: m.episodes ?? 0,
      duration: m.duration ? `${m.duration}m` : undefined,
      genres: m.genres || [],
      studios: m.studios?.nodes?.map((s) => s.name) || [],
      season: m.season?.toLowerCase(),
      year: m.startDate?.year || m.seasonYear,
      subCount: m.episodes ?? undefined,
      dubCount: 0,
      isMature: m.isAdult,
      source: 'AniList',
    };
  } catch {
    return null;
  }
}

/**
 * Secondary Fallback: Load anime metadata from Jikan (MyAnimeList).
 */
export async function fetchJikanAnimeDetails(queryOrMalId: string | number): Promise<Anime | null> {
  try {
    const isId = typeof queryOrMalId === 'number' || /^\d+$/.test(String(queryOrMalId));
    const url = isId
      ? `https://api.jikan.moe/v4/anime/${queryOrMalId}/full`
      : `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(String(queryOrMalId))}&limit=1`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const item = isId ? json.data : json.data?.[0];
    if (!item) return null;

    const title = item.title_english || item.title || 'Unknown';
    const desc = (item.synopsis || '').replace(/<[^>]+>/g, '').trim() || 'No description available.';
    const coverUrl = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || item.images?.webp?.large_image_url || '';

    const isMature = Boolean(
      item.rating?.includes('Rx') ||
      item.rating?.includes('R+') ||
      item.rating?.includes('Hentai') ||
      item.genres?.some((g: { name: string }) => g.name === 'Hentai')
    );

    return {
      id: `mal-${item.mal_id}`,
      title,
      titleJapanese: item.title_japanese || item.title,
      image: coverUrl,
      cover: coverUrl,
      banner: item.images?.jpg?.large_image_url || undefined,
      description: desc,
      type: item.type === 'Movie' ? 'Movie' : item.type === 'OVA' ? 'OVA' : item.type === 'ONA' ? 'ONA' : item.type === 'Special' ? 'Special' : 'TV',
      status: item.status === 'Airing' ? 'Ongoing' : item.status === 'Complete' ? 'Completed' : 'Upcoming',
      rating: item.score,
      episodes: item.episodes || 0,
      duration: item.duration || undefined,
      genres: item.genres?.map((g: { name: string }) => g.name) || [],
      studios: item.studios?.map((s: { name: string }) => s.name) || [],
      year: item.year || item.aired?.prop?.from?.year,
      season: item.season?.toLowerCase(),
      subCount: item.episodes || 1,
      dubCount: 0,
      isMature,
      source: 'jikan',
    };
  } catch {
    return null;
  }
}

/**
 * Tertiary Fallback: Load anime metadata from Kitsu.
 */
export async function fetchKitsuAnimeDetails(queryOrKitsuId: string): Promise<Anime | null> {
  try {
    const isId = /^\d+$/.test(queryOrKitsuId);
    const url = isId
      ? `https://kitsu.io/api/edge/anime/${queryOrKitsuId}`
      : `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(queryOrKitsuId)}&page[limit]=1`;

    const res = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } });
    if (!res.ok) return null;
    const json = await res.json();
    const item = isId ? json.data : json.data?.[0];
    if (!item?.attributes) return null;

    const attr = item.attributes;
    const title = attr.titles?.en || attr.titles?.en_jp || attr.canonicalTitle || 'Unknown';
    const desc = (attr.synopsis || '').replace(/<[^>]+>/g, '').trim() || 'No description available.';
    const coverUrl = attr.posterImage?.large || attr.posterImage?.original || attr.coverImage?.large || '';
    const bannerUrl = attr.coverImage?.original || attr.coverImage?.large || undefined;

    return {
      id: `kitsu-${item.id}`,
      title,
      titleJapanese: attr.titles?.ja_jp || attr.titles?.en_jp,
      image: coverUrl,
      cover: coverUrl,
      banner: bannerUrl,
      description: desc,
      type: attr.subtype === 'movie' ? 'Movie' : attr.subtype === 'OVA' ? 'OVA' : attr.subtype === 'ONA' ? 'ONA' : attr.subtype === 'special' ? 'Special' : 'TV',
      status: attr.status === 'current' ? 'Ongoing' : attr.status === 'finished' ? 'Completed' : 'Upcoming',
      rating: attr.averageRating ? parseFloat(attr.averageRating) / 10 : undefined,
      episodes: attr.episodeCount || 0,
      duration: attr.episodeLength ? `${attr.episodeLength}m` : undefined,
      genres: [],
      studios: [],
      year: attr.startDate ? new Date(attr.startDate).getFullYear() : undefined,
      season: undefined,
      subCount: attr.episodeCount || 1,
      dubCount: 0,
      isMature: attr.ageRating === 'R18',
      source: 'kitsu',
    };
  } catch {
    return null;
  }
}

/**
 * Universal Anime Metadata Resolution:
 * Tries AniList -> Jikan -> Kitsu -> Synthetic Fallback.
 * Guarantees a valid Anime object is returned so UI / Watch page never breaks.
 */
export async function fetchAnimeWithFallback(idOrSlug: string, source?: string): Promise<Anime | null> {
  if (!idOrSlug || !idOrSlug.trim()) return null;
  const rawId = idOrSlug.trim();

  // Check cache first
  const cacheKey = `${rawId}:${source || ''}`;
  if (animeDetailCache.has(cacheKey)) {
    return animeDetailCache.get(cacheKey)!;
  }

  const numericId = extractNumericId(rawId);
  const searchTitle = extractTitleFromSlug(rawId);
  const malMatch = rawId.match(/^mal-(\d+)$/i);
  const kitsuMatch = rawId.match(/^kitsu-(\d+)$/i);

  // 1. If MAL ID, query Jikan directly
  if (malMatch) {
    const malData = await fetchJikanAnimeDetails(parseInt(malMatch[1], 10));
    if (malData) {
      malData.id = rawId;
      animeDetailCache.set(cacheKey, malData);
      return malData;
    }
  }

  // 2. If Kitsu ID, query Kitsu directly
  if (kitsuMatch) {
    const kitsuData = await fetchKitsuAnimeDetails(kitsuMatch[1]);
    if (kitsuData) {
      kitsuData.id = rawId;
      animeDetailCache.set(cacheKey, kitsuData);
      return kitsuData;
    }
  }

  // 3. Try AniList GraphQL by numeric ID
  if (numericId) {
    const anilistData = await fetchAniListAnimeByNumericId(numericId);
    if (anilistData) {
      animeDetailCache.set(cacheKey, anilistData);
      return anilistData;
    }
  }

  // 4. Try Jikan by title
  if (searchTitle && searchTitle.length >= 2) {
    const jikanData = await fetchJikanAnimeDetails(searchTitle);
    if (jikanData) {
      // Preserve requested ID format for consistent routing
      jikanData.id = rawId;
      animeDetailCache.set(cacheKey, jikanData);
      return jikanData;
    }
  }

  // 5. Try Kitsu by title
  if (searchTitle && searchTitle.length >= 2) {
    const kitsuData = await fetchKitsuAnimeDetails(searchTitle);
    if (kitsuData) {
      kitsuData.id = rawId;
      animeDetailCache.set(cacheKey, kitsuData);
      return kitsuData;
    }
  }

  // 6. Last-resort synthetic fallback object
  // Ensures Watch page, video player, and header titles never crash on empty data
  const capitalizedTitle = searchTitle
    ? searchTitle.replace(/\b\w/g, (c) => c.toUpperCase())
    : rawId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const fallbackAnime: Anime = {
    id: rawId,
    title: capitalizedTitle || 'Unknown Anime',
    image: '',
    cover: '',
    description: `Stream ${capitalizedTitle || 'Anime'} online in HD with subtitles and dubs.`,
    type: 'TV',
    status: 'Completed',
    episodes: 1,
    genres: [],
    studios: [],
    subCount: 1,
    dubCount: 0,
    source: 'fallback',
  };

  animeDetailCache.set(cacheKey, fallbackAnime);
  return fallbackAnime;
}
