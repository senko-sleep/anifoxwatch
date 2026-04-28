/**
 * Anime Metadata Racer - Parallel racing between multiple anime metadata sources
 * Races AniList, Jikan (MAL), Kitsu, and Anime-Planet for fastest reliable response
 */

import { logger } from '../utils/logger.js';

interface AnimeMetadata {
  id: number;
  title: { english: string | null; romaji: string; native: string | null };
  bannerImage: string | null;
  coverImage: { extraLarge: string; large: string; color: string | null };
  description: string | null;
  genres: string[];
  averageScore: number | null;
  popularity: number;
  episodes: number | null;
  duration: number | null;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  studios: { nodes: { name: string; isAnimationStudio: boolean }[] };
  nextAiringEpisode: { episode: number; airingAt: number; timeUntilAiring: number } | null;
  trailer: { id: string | null; site: string | null } | null;
  source: string;
}

interface SourceResult {
  data: AnimeMetadata[] | null;
  source: string;
  latency: number;
}

interface SourceConfig {
  name: string;
  priority: number;
  fetch: (page: number, perPage: number, filters?: Record<string, unknown>) => Promise<AnimeMetadata[]>;
  timeout: number;
}

// Source configurations with priority (lower = higher priority)
const SOURCES: SourceConfig[] = [
  {
    name: 'anilist',
    priority: 1,
    timeout: 8000,
    fetch: async (page: number, perPage: number, filters?: Record<string, unknown>) => {
      return fetchAniList(page, perPage, filters);
    }
  },
  {
    name: 'jikan',
    priority: 2,
    timeout: 6000,
    fetch: async (page: number, perPage: number, filters?: Record<string, unknown>) => {
      return fetchJikan(page, perPage, filters);
    }
  },
  {
    name: 'kitsu',
    priority: 3,
    timeout: 6000,
    fetch: async (page: number, perPage: number, filters?: Record<string, unknown>) => {
      return fetchKitsu(page, perPage, filters);
    }
  },
  {
    name: 'animeplanet',
    priority: 4,
    timeout: 5000,
    fetch: async (page: number, perPage: number, filters?: Record<string, unknown>) => {
      return fetchAnimePlanet(page, perPage, filters);
    }
  }
];

/**
 * Fetch from AniList with timeout
 */
async function fetchAniList(page: number, perPage: number, filters?: Record<string, unknown>): Promise<AnimeMetadata[]> {
  const ANILIST_URL = 'https://graphql.anilist.co';
  
  const query = `
    query HeroSpotlight($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus, $startDate_greater: FuzzyDateInt, $format_in: [MediaFormat]) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: $sort, isAdult: false, status: $status, startDate_greater: $startDate_greater, format_in: $format_in) {
          id
          idMal
          title { english romaji native }
          bannerImage
          coverImage { extraLarge large color }
          description
          genres
          averageScore
          popularity
          episodes
          duration
          format
          status
          season
          seasonYear
          studios(isMain: true) { nodes { name isAnimationStudio } }
          nextAiringEpisode { episode airingAt timeUntilAiring }
          trailer { id site }
        }
      }
    }`;

  const variables: Record<string, unknown> = { page, perPage };
  if (filters) {
    Object.assign(variables, filters);
  }

  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'AniFoxWatch/1.0 (+https://anifoxwatch.web.app)',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
  }

  const media = json.data?.Page?.media || [];
  return media.map((m: any) => ({
    ...m,
    source: 'anilist'
  }));
}

/**
 * Fetch from Jikan (MyAnimeList unofficial API) with timeout
 */
async function fetchJikan(page: number, perPage: number, filters?: Record<string, unknown>): Promise<AnimeMetadata[]> {
  const JIKAN_BASE = 'https://api.jikan.moe/v4/top/anime';
  
  const params = new URLSearchParams({
    page: page.toString(),
    limit: perPage.toString(),
    filter: 'airing'
  });

  const res = await fetch(`${JIKAN_BASE}?${params}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Jikan HTTP ${res.status}`);
  }

  const json = await res.json();
  const data = json.data || [];

  return data.map((item: any) => ({
    id: item.mal_id,
    idMal: item.mal_id,
    title: {
      english: item.title_english,
      romaji: item.title,
      native: item.title_japanese
    },
    bannerImage: null, // Jikan doesn't provide banner
    coverImage: {
      extraLarge: item.images?.jpg?.large_image || item.images?.jpg?.image_url,
      large: item.images?.jpg?.image_url,
      color: null
    },
    description: item.synopsis,
    genres: item.genres?.map((g: any) => g.name) || [],
    averageScore: item.score ? item.score * 10 : null,
    popularity: item.members || 0,
    episodes: item.episodes,
    duration: item.duration ? parseInt(item.duration) || null : null,
    format: item.type,
    status: item.status === 'Airing' ? 'RELEASING' : item.status === 'Complete' ? 'FINISHED' : item.status,
    season: null,
    seasonYear: item.year || null,
    studios: { nodes: [{ name: item.studios?.[0]?.name || 'Unknown', isAnimationStudio: true }] },
    nextAiringEpisode: null,
    trailer: null,
    source: 'jikan'
  }));
}

/**
 * Fetch from Kitsu API with timeout
 */
async function fetchKitsu(page: number, perPage: number, filters?: Record<string, unknown>): Promise<AnimeMetadata[]> {
  const KITSU_BASE = 'https://kitsu.io/api/edge/anime';
  
  const params = new URLSearchParams({
    'page[limit]': perPage.toString(),
    'page[offset]': ((page - 1) * perPage).toString(),
    'sort': '-popularity_rank',
    'filter[status]': 'current'
  });

  const res = await fetch(`${KITSU_BASE}?${params}`, {
    headers: { 
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json'
    },
  });

  if (!res.ok) {
    throw new Error(`Kitsu HTTP ${res.status}`);
  }

  const json = await res.json();
  const data = json.data || [];

  return data.map((item: any) => ({
    id: item.id,
    idMal: item.attributes?.malId || null,
    title: {
      english: item.attributes?.titles?.en,
      romaji: item.attributes?.titles?.en_jp,
      native: item.attributes?.titles?.ja_jp
    },
    bannerImage: null,
    coverImage: {
      extraLarge: item.attributes?.coverImage?.large || item.attributes?.coverImage?.original,
      large: item.attributes?.coverImage?.large,
      color: null
    },
    description: item.attributes?.synopsis,
    genres: [],
    averageScore: item.attributes?.averageRating ? parseFloat(item.attributes.averageRating) * 10 : null,
    popularity: item.attributes?.userCount || 0,
    episodes: item.attributes?.episodeCount,
    duration: item.attributes?.episodeLength,
    format: item.attributes?.showType,
    status: item.attributes?.status === 'current' ? 'RELEASING' : item.attributes?.status,
    season: null,
    seasonYear: item.attributes?.startDate ? new Date(item.attributes.startDate).getFullYear() : null,
    studios: { nodes: [] },
    nextAiringEpisode: null,
    trailer: null,
    source: 'kitsu'
  }));
}

/**
 * Fetch from Anime-Planet with timeout
 */
async function fetchAnimePlanet(page: number, perPage: number, filters?: Record<string, unknown>): Promise<AnimeMetadata[]> {
  const ANIME_PLANET_BASE = 'https://www.anime-planet.com/anime/all';
  
  // Anime-Planet doesn't have a proper API, so we'll return empty for now
  // This is a placeholder for future implementation
  return [];
}

/**
 * Race multiple sources in parallel and return the first successful response
 * Sources are tried in priority order, but all start simultaneously
 */
export async function raceAnimeMetadata(
  page: number = 1,
  perPage: number = 20,
  filters?: Record<string, unknown>
): Promise<{ data: AnimeMetadata[]; source: string; latency: number }> {
  const startTime = Date.now();
  
  // Sort sources by priority
  const sortedSources = [...SOURCES].sort((a, b) => a.priority - b.priority);

  // Create race promises with individual timeouts
  const promises = sortedSources.map(async (source): Promise<SourceResult> => {
    try {
      const result = await Promise.race([
        source.fetch(page, perPage, filters),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`${source.name} timeout`)), source.timeout)
        )
      ]);
      
      if (result && result.length > 0) {
        return {
          data: result,
          source: source.name,
          latency: Date.now() - startTime
        };
      }
      
      return { data: null, source: source.name, latency: Date.now() - startTime };
    } catch (error) {
      logger.warn(`[AnimeMetadataRacer] ${source.name} failed`, { error: String(error) }, 'AnimeMetadataRacer');
      return { data: null, source: source.name, latency: Date.now() - startTime };
    }
  });

  // Wait for first successful result or all to fail
  const results = await Promise.all(promises);
  
  // Find first successful result
  const firstSuccess = results.find(r => r.data !== null && r.data.length > 0);
  
  if (firstSuccess && firstSuccess.data) {
    logger.info(
      `[AnimeMetadataRacer] ${firstSuccess.source} won the race with ${firstSuccess.data.length} results in ${firstSuccess.latency}ms`,
      { source: firstSuccess.source, latency: firstSuccess.latency, count: firstSuccess.data.length },
      'AnimeMetadataRacer'
    );
    return {
      data: firstSuccess.data,
      source: firstSuccess.source,
      latency: firstSuccess.latency
    };
  }

  // All sources failed
  logger.error('[AnimeMetadataRacer] All sources failed', new Error('All anime metadata sources failed'), undefined, 'AnimeMetadataRacer');
  throw new Error('All anime metadata sources failed');
}

/**
 * Get hero spotlight anime with racing
 */
export async function getHeroSpotlightWithRace(): Promise<AnimeMetadata[]> {
  const currentYear = new Date().getFullYear();
  const recentYear = currentYear - 1;
  
  // Try to get current season anime
  try {
    const result = await raceAnimeMetadata(1, 50, {
      status: 'RELEASING',
      startDate_greater: recentYear * 10000,
      format_in: ['TV', 'MOVIE', 'ONA']
    });
    
    // Filter to only include anime with banners or good covers
    return result.data.filter(anime => 
      anime.bannerImage || anime.coverImage?.extraLarge
    ).slice(0, 20);
  } catch (error) {
    logger.error('[AnimeMetadataRacer] Hero spotlight race failed', error as Error, undefined, 'AnimeMetadataRacer');
    return [];
  }
}
