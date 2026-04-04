/**
 * Hero spotlight: AniList metadata + MyAnimeList v2 banner_image/synopsis when MAL_CLIENT_ID is set
 * (X-MAL-CLIENT-ID), then Jikan fallback for synopsis. Cached server-side.
 */

import { logger } from '../utils/logger.js';

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_BASE = 'https://api.jikan.moe/v4/anime';
const MAL_ANIME_BASE = 'https://api.myanimelist.net/v2/anime';

const MAL_FIELDS =
  'id,title,main_picture,banner_image,synopsis,mean,num_list_users,media_type,status,start_season';

const HERO_SPOTLIGHT_QUERY = `
query HeroSpotlight($page: Int, $perPage: Int, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, sort: $sort, isAdult: false) {
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
const SERVER_CACHE_MS = 15 * 60 * 1000;
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

async function anilistPage(
  page: number,
  perPage: number,
  sort: string
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
      variables: { page, perPage, sort: [sort] },
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

/**
 * Pulls popular + trending pages from AniList, merges MAL banner_image + synopsis when
 * MAL_CLIENT_ID is set, requires a final banner URL, enriches synopsis via Jikan if still thin.
 */
export async function fetchHeroSpotlightAnime(): Promise<HeroSpotlightAnime[]> {
  const raw: Record<string, unknown>[] = [];
  const pages: [number, number, string][] = [
    [1, 50, 'POPULARITY_DESC'],
    [2, 50, 'POPULARITY_DESC'],
    [1, 50, 'TRENDING_DESC'],
    [1, 50, 'SCORE_DESC'],
  ];
  for (const [page, perPage, sort] of pages) {
    try {
      const chunk = await anilistPage(page, perPage, sort);
      raw.push(...chunk);
      await new Promise((r) => setTimeout(r, 120));
    } catch (e) {
      logger.warn('[HeroSpotlight] AniList page failed', { page, sort, err: String(e) }, 'HeroSpotlight');
    }
  }
  if (raw.length === 0) {
    throw new Error('AniList returned no media for hero spotlight');
  }

  const sorted = dedupeById(raw);
  sorted.sort((a, b) => {
    const pa = (a.popularity as number) || 0;
    const pb = (b.popularity as number) || 0;
    return pb - pa;
  });

  const useMal = Boolean(malClientId());
  const pool = useMal ? sorted : sorted.filter((m) => anilistBannerUrl(m));
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
      if (mal?.bannerImage) banner = mal.bannerImage;
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
  });
}

export function invalidateHeroSpotlightCache(): void {
  memoryCache = null;
}
