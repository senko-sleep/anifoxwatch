/**
 * Hero spotlight: Multi-source racing metadata with fallbacks
 * Prioritizes reliable sources (Jikan, Kitsu, TMDB, GitHub) over AniList
 * Enriches with MAL banner_image/synopsis when MAL_CLIENT_ID is set
 */

import { logger } from '../utils/logger.js';
import { raceAnimeMetadata } from './anime-metadata-racer.js';

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_BASE = 'https://api.jikan.moe/v4/anime';
const MAL_ANIME_BASE = 'https://api.myanimelist.net/v2/anime';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const GITHUB_DATASET = 'https://raw.githubusercontent.com/manami-project/anime-offline-database/master/anime-offline-database-minified.json';

const MAL_FIELDS =
  'id,title,main_picture,banner_image,synopsis,mean,num_list_users,media_type,status,start_season';

const HERO_SPOTLIGHT_QUERY = `
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

const MIN_SYNOPSIS_CHARS = 55;
const MAX_HERO = 20;
const MAX_JIKAN_CALLS = 18;
const MAX_MAL_CALLS = 36;
const MAX_HERO_SCAN = 100;
const SERVER_CACHE_MS = 30 * 60 * 1000; // 30 min — refresh spotlight every 30 min for fresh content
const JIKAN_GAP_MS = 380;
const MAL_GAP_MS = 340;

let memoryCache: { at: number; payload: HeroSpotlightAnime[] } | null = null;

export interface HeroSpotlightAnime {
  id: number;
  idMal: number | null;
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
  source: 'anilist';
}

function cleanAnilistDescription(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isWeakSynopsis(text: string): boolean {
  if (!text || text.length < MIN_SYNOPSIS_CHARS) return true;
  const low = text.toLowerCase();
  if (low.includes('no description')) return true;
  if (low.includes('description is not available')) return true;
  return false;
}

interface AniListPageFilters {
  status?: string;
  startDate_greater?: number;
  format_in?: string[];
}

async function anilistPage(
  page: number,
  perPage: number,
  sort: string,
  filters: AniListPageFilters = {}
): Promise<Record<string, unknown>[]> {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'AniStreamHub/1.0 (+https://github.com/anistream-hub)',
    },
    body: JSON.stringify({
      query: HERO_SPOTLIGHT_QUERY,
      variables: { page, perPage, sort: [sort], ...filters },
    }),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = (await res.json()) as { errors?: { message: string }[]; data?: { Page?: { media: Record<string, unknown>[] } } };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
  }
  return json.data?.Page?.media || [];
}

function anilistBannerUrl(m: Record<string, unknown>): string {
  const b = m.bannerImage;
  return typeof b === 'string' && /^https?:\/\//i.test(b.trim()) ? b.trim() : '';
}

function httpUrlOrEmpty(s: unknown): string {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim()) ? s.trim() : '';
}

function dedupeById(media: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<number>();
  const out: Record<string, unknown>[] = [];
  for (const m of media) {
    const id = m.id as number;
    if (typeof id !== 'number' || seen.has(id)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

function malClientId(): string | null {
  const id = process.env.MAL_CLIENT_ID?.trim() || process.env.MYANIMELIST_CLIENT_ID?.trim();
  return id || null;
}

function cleanMalSynopsis(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\[\/?i\]/gi, '')
    .replace(/\[\/?b\]/gi, '')
    .replace(/\s*\[Written by[^\]]*\]/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface MalAnimeDetails {
  bannerImage: string | null;
  synopsis: string | null;
}

async function fetchMalAnimeDetails(malId: number): Promise<MalAnimeDetails | null> {
  const cid = malClientId();
  if (!cid) return null;
  const url = `${MAL_ANIME_BASE}/${malId}?fields=${encodeURIComponent(MAL_FIELDS)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-MAL-CLIENT-ID': cid,
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      logger.warn('[HeroSpotlight] MAL HTTP error', { malId, status: res.status }, 'HeroSpotlight');
      return null;
    }
    const j = (await res.json()) as {
      banner_image?: string | null;
      synopsis?: string | null;
    };
    const bannerImage = httpUrlOrEmpty(j.banner_image);
    const synopsisRaw = typeof j.synopsis === 'string' ? j.synopsis : '';
    const synopsis = synopsisRaw ? cleanMalSynopsis(synopsisRaw) : null;
    return {
      bannerImage: bannerImage || null,
      synopsis: synopsis && !isWeakSynopsis(synopsis) ? synopsis.slice(0, 1200) : null,
    };
  } catch (e) {
    logger.warn('[HeroSpotlight] MAL fetch failed', { malId, err: String(e) }, 'HeroSpotlight');
    return null;
  }
}

async function fetchJikanSynopsis(malId: number): Promise<string | null> {
  const url = `${JIKAN_BASE}/${malId}/full`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { synopsis?: string | null } };
      const s = json.data?.synopsis;
      if (typeof s !== 'string') return null;
      const t = s.replace(/\s*\[Written by[^\]]*\]\s*$/i, '').replace(/\s+/g, ' ').trim();
      if (t.length >= MIN_SYNOPSIS_CHARS) return t.slice(0, 1200);
    } catch (e) {
      logger.warn('[HeroSpotlight] Jikan fetch failed', { malId, attempt, err: String(e) }, 'HeroSpotlight');
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

// ─── TMDB FALLBACK ─────────────────────────────────────────────────────────

async function fetchFromTMDB(): Promise<Record<string, unknown>[]> {
  try {
    const apiKey = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d'; // Default fallback key
    const url = `${TMDB_BASE}/discover/tv?api_key=${apiKey}&with_genres=16&sort_by=popularity.desc&page=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    
    const json = await res.json() as { results?: Array<{
      id: number;
      name: string;
      overview: string;
      poster_path: string;
      backdrop_path: string;
      vote_average: number;
      first_air_date: string;
    }> };
    
    const results = json.results || [];
    return results.slice(0, 50).map((item) => ({
      id: item.id,
      title: { english: item.name, romaji: item.name, native: null },
      bannerImage: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
      coverImage: { 
        extraLarge: item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : '',
        large: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
        color: null 
      },
      description: item.overview || 'No description available.',
      genres: [],
      averageScore: item.vote_average ? Math.round(item.vote_average * 10) : null,
      popularity: 0,
      episodes: 0,
      duration: null,
      format: 'TV',
      status: 'Unknown',
      season: null,
      seasonYear: item.first_air_date ? new Date(item.first_air_date).getFullYear() : null,
      studios: { nodes: [] },
      nextAiringEpisode: null,
      trailer: null,
    }));
  } catch (e) {
    logger.warn('[HeroSpotlight] TMDB fallback failed', { err: String(e) }, 'HeroSpotlight');
    return [];
  }
}

// ─── GITHUB DATASET FALLBACK ───────────────────────────────────────────────

async function fetchFromGitHubDataset(): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(GITHUB_DATASET);
    if (!res.ok) throw new Error(`GitHub dataset HTTP ${res.status}`);
    
    const json = await res.json() as { data?: Array<{
      sources: string[];
      title: { english: string; romaji: string; native: string };
      picture: string;
      synopsis: string;
      tags: string[];
      score: number;
      episodes: number;
      type: string;
      status: string;
      season: { season: string; year: number };
    }> };
    
    const data = json.data || [];
    const currentYear = new Date().getFullYear();
    
    // Filter for recent anime and convert to our format
    return data
      .filter((item) => {
        const year = item?.season?.year || 0;
        return year >= currentYear - 2;
      })
      .slice(0, 50)
      .map((item) => ({
        id: item?.sources?.[0]?.split('/').pop() || Math.random(),
        title: {
          english: item?.title?.english || null,
          romaji: item?.title?.romaji || item?.title?.english || '',
          native: item?.title?.native || null,
        },
        bannerImage: item?.picture || null,
        coverImage: {
          extraLarge: item?.picture || '',
          large: item?.picture || '',
          color: null,
        },
        description: item?.synopsis || 'No description available.',
        genres: item?.tags || [],
        averageScore: item?.score ? Math.round(item.score * 10) : null,
        popularity: 0,
        episodes: item?.episodes || 0,
        duration: null,
        format: item?.type || 'TV',
        status: item?.status === 'finished' ? 'FINISHED' : item?.status === 'airing' ? 'RELEASING' : 'Unknown',
        season: item?.season?.season || null,
        seasonYear: item?.season?.year || null,
        studios: { nodes: [] },
        nextAiringEpisode: null,
        trailer: null,
      }));
  } catch (e) {
    logger.warn('[HeroSpotlight] GitHub dataset fallback failed', { err: String(e) }, 'HeroSpotlight');
    return [];
  }
}

function mapToHero(
  m: Record<string, unknown>,
  description: string,
  bannerImage: string | null
): HeroSpotlightAnime {
  const base = m as unknown as HeroSpotlightAnime;
  return {
    ...base,
    bannerImage,
    description,
    source: 'anilist',
  };
}

/** Score used to sort final results: currently airing recent anime rank highest. */
function recencyScore(m: Record<string, unknown>): number {
  const currentYear = new Date().getFullYear();
  const year = (m.seasonYear as number) || 0;
  const status = (m.status as string) || '';
  let score = 0;
  if (status === 'RELEASING') score += 100_000;
  if (year >= currentYear) score += 50_000;
  else if (year >= currentYear - 1) score += 20_000;
  else if (year >= currentYear - 2) score += 5_000;
  // Blend in a small popularity bonus so the newest one-shot ONA doesn't beat a hit series
  score += Math.min((m.popularity as number) || 0, 100_000) * 0.1;
  return score;
}

/**
 * Pulls current-season + recent anime from racing sources, prioritizes reliable sources
 * (TMDB, GitHub dataset) over AniList, merges MAL banner_image + synopsis when
 * MAL_CLIENT_ID is set, requires a final banner URL, enriches synopsis via Jikan if still thin.
 */
export async function fetchHeroSpotlightAnime(): Promise<HeroSpotlightAnime[]> {
  const currentYear = new Date().getFullYear();
  const recentYear = currentYear - 1;

  // Try reliable sources first
  let raw: Record<string, unknown>[] = [];

  // 1) Try TMDB first (most reliable)
  try {
    const tmdbData = await fetchFromTMDB();
    if (tmdbData.length > 0) {
      raw = tmdbData;
      logger.info(`[HeroSpotlight] Got ${raw.length} anime from TMDB`, {}, 'HeroSpotlight');
    }
  } catch (e) {
    logger.warn('[HeroSpotlight] TMDB failed, trying next source', { err: String(e) }, 'HeroSpotlight');
  }

  // 2) Try GitHub dataset if TMDB failed
  if (raw.length === 0) {
    try {
      const githubData = await fetchFromGitHubDataset();
      if (githubData.length > 0) {
        raw = githubData;
        logger.info(`[HeroSpotlight] Got ${raw.length} anime from GitHub dataset`, {}, 'HeroSpotlight');
      }
    } catch (e) {
      logger.warn('[HeroSpotlight] GitHub dataset failed, trying next source', { err: String(e) }, 'HeroSpotlight');
    }
  }

  // 3) Use the racer if reliable sources failed
  if (raw.length === 0) {
    try {
      const result = await raceAnimeMetadata(1, 100, {
        status: 'RELEASING',
        startDate_greater: recentYear * 10000,
        format_in: ['TV', 'MOVIE', 'ONA']
      });
      
      // Convert to the expected format
      raw = result.data as unknown as Record<string, unknown>[];
      logger.info(`[HeroSpotlight] Racer returned ${raw.length} anime from ${result.source}`, { source: result.source }, 'HeroSpotlight');
    } catch (e) {
      logger.error('[HeroSpotlight] All sources failed, falling back to AniList sequential', e as Error, undefined, 'HeroSpotlight');
      
      // Fallback to sequential AniList if racer fails
      const formats = ['TV', 'MOVIE', 'ONA'];
      const queries: Array<[number, number, string, AniListPageFilters]> = [
        [1, 50, 'TRENDING_DESC', { status: 'RELEASING', format_in: formats }],
        [1, 50, 'TRENDING_DESC', { startDate_greater: recentYear * 10000, format_in: formats }],
        [1, 50, 'TRENDING_DESC', {}], // global fallback
      ];

      for (const [page, perPage, sort, filters] of queries) {
        try {
          const chunk = await anilistPage(page, perPage, sort, filters);
          raw.push(...chunk);
          await new Promise((r) => setTimeout(r, 120));
        } catch (e) {
          logger.warn('[HeroSpotlight] AniList page failed', { page, sort, filters, err: String(e) }, 'HeroSpotlight');
        }
      }
    }
  }

  if (raw.length === 0) {
    throw new Error('No anime data available from any source');
  }

  const sorted = dedupeById(raw);
  // Sort: currently airing recent anime first, then recent, then older — popularity as tiebreaker
  sorted.sort((a, b) => recencyScore(b) - recencyScore(a));

  const useMal = Boolean(malClientId());
  // Only include anime from 2025+ OR currently releasing — no legacy shows in spotlight
  const pool = sorted.filter((m) => {
    // Accept banner from AniList format or generic bannerImage field
    const banner = anilistBannerUrl(m) || (typeof m.bannerImage === 'string' && m.bannerImage);
    if (!banner) return false;
    const year = (m.seasonYear as number) || 0;
    const status = (m.status as string) || '';
    // Always spotlight currently airing regardless of year
    if (status === 'RELEASING') return true;
    // For finished shows, only 2025 or newer
    return year >= currentYear - 1;
  });
  const out: HeroSpotlightAnime[] = [];
  let jikanCalls = 0;
  let malCalls = 0;
  let scanned = 0;

  for (const m of pool) {
    if (out.length >= MAX_HERO) break;
    if (useMal && scanned >= MAX_HERO_SCAN) break;
    scanned += 1;

    let desc = typeof m.description === 'string' ? cleanAnilistDescription(m.description) : '';
    const idMal = m.idMal != null ? Number(m.idMal) : null;
    const malIdOk = idMal != null && Number.isFinite(idMal);

    let banner = anilistBannerUrl(m);

    if (useMal && malIdOk && malCalls < MAX_MAL_CALLS) {
      malCalls += 1;
      await new Promise((r) => setTimeout(r, MAL_GAP_MS));
      const mal = await fetchMalAnimeDetails(idMal);
      if (mal?.synopsis && (isWeakSynopsis(desc) || mal.synopsis.length > desc.length + 30)) {
        desc = mal.synopsis;
      }
    }

    if (!httpUrlOrEmpty(banner)) continue;

    if (isWeakSynopsis(desc) && malIdOk && jikanCalls < MAX_JIKAN_CALLS) {
      jikanCalls += 1;
      await new Promise((r) => setTimeout(r, JIKAN_GAP_MS));
      const j = await fetchJikanSynopsis(idMal!);
      if (j) desc = j;
    }

    if (isWeakSynopsis(desc)) continue;

    out.push(mapToHero(m, desc, banner.trim()));
  }

  logger.info(
    `[HeroSpotlight] Built ${out.length} hero entries (MAL: ${useMal ? 'on' : 'off'}, malCalls=${malCalls}, scanned=${scanned})`,
    {},
    'HeroSpotlight'
  );

  return out;
}

export function getHeroSpotlightCached(): Promise<HeroSpotlightAnime[]> {
  if (memoryCache && Date.now() - memoryCache.at < SERVER_CACHE_MS) {
    return Promise.resolve(memoryCache.payload);
  }
  return fetchHeroSpotlightAnime().then((payload) => {
    memoryCache = { at: Date.now(), payload };
    return payload;
  }).catch((err) => {
    // AniList down — serve stale cache indefinitely rather than 500
    if (memoryCache) {
      logger.warn('[HeroSpotlight] AniList failed, serving stale cache', { err: String(err) }, 'HeroSpotlight');
      return memoryCache.payload;
    }
    logger.warn('[HeroSpotlight] AniList failed, no cache available', { err: String(err) }, 'HeroSpotlight');
    return [];
  });
}

export function invalidateHeroSpotlightCache(): void {
  memoryCache = null;
}
