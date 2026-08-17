import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '@/lib/api-config';
import { fetchAniListGraphQL } from '@/lib/anilist-graphql';
import { isPlaceholderAnimeDescription } from '@/lib/utils';
import type { Anime } from '@/types/anime';

/**
 * Hero anime: Multi-source fallback system supporting AniList, BFF trending,
 * Jikan (MAL), Kitsu, and TMDB. Works seamlessly even when primary sources are down.
 * 
 * Cached in localStorage with stale-while-revalidate protection.
 */

export interface HeroAnime {
  id: number | string;
  idMal: number | null;
  title: {
    english: string | null;
    romaji: string;
    native: string | null;
  };
  bannerImage: string | null;
  coverImage: {
    extraLarge: string;
    large: string;
    color: string | null;
  };
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
  nextAiringEpisode: {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
  } | null;
  trailer: {
    id: string | null;
    site: string | null;
  } | null;
  source: 'anilist' | 'bff' | 'jikan' | 'kitsu' | 'animeplanet' | 'github' | 'tmdb' | 'fallback';
}

interface CachedHeroData {
  anime: HeroAnime[];
  timestamp: number;
  source: string;
  version: number;
}

const CACHE_KEY = 'anistream_hero_v12';
const CACHE_TTL = 20 * 60 * 1000;
const CACHE_VERSION = 12;

// User-Agent for external APIs (Jikan v4 requires this)
const USER_AGENT = 'AniStreamHub/1.0 (+https://github.com/anistream-hub)';

export const STATIC_FALLBACK_HERO_ANIME: HeroAnime[] = [
  {
    id: 151807,
    idMal: 52299,
    title: {
      english: 'Solo Leveling',
      romaji: 'Ore dake Level Up na Ken',
      native: '俺だけレベルアップな件',
    },
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-3528b1e4fa8e9f8daea8d655ad1bf2c8.jpg',
    coverImage: {
      extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-3528b1e4fa8e9f8daea8d655ad1bf2c8.jpg',
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx151807-3528b1e4fa8e9f8daea8d655ad1bf2c8.jpg',
      color: '#3582d8',
    },
    description: 'In a world where hunters must battle deadly monsters to protect humanity, Sung Jinwoo, notoriously known as the weakest hunter of all mankind, finds himself in a struggle for survival.',
    genres: ['Action', 'Adventure', 'Fantasy'],
    averageScore: 84,
    popularity: 165000,
    episodes: 12,
    duration: 24,
    format: 'TV',
    status: 'RELEASING',
    season: 'WINTER',
    seasonYear: 2024,
    studios: { nodes: [{ name: 'A-1 Pictures', isAnimationStudio: true }] },
    nextAiringEpisode: null,
    trailer: { id: 'mS_68L_yY_A', site: 'youtube' },
    source: 'fallback',
  },
  {
    id: 154587,
    idMal: 52991,
    title: {
      english: "Frieren: Beyond Journey's End",
      romaji: 'Sousou no Frieren',
      native: '葬送のフリーレン',
    },
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-ivXNJ23SM1xB.jpg',
    coverImage: {
      extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gviZjMmQEptO.jpg',
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx154587-gviZjMmQEptO.jpg',
      color: '#43a5d8',
    },
    description: 'The demon king has been defeated, and the victorious hero party returns home before disbanding. The four—mage Frieren, hero Himmel, priest Heiter, and warrior Eisen—reminisce over their decade-long journey.',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    averageScore: 91,
    popularity: 140000,
    episodes: 28,
    duration: 24,
    format: 'TV',
    status: 'FINISHED',
    season: 'FALL',
    seasonYear: 2023,
    studios: { nodes: [{ name: 'Madhouse', isAnimationStudio: true }] },
    nextAiringEpisode: null,
    trailer: { id: 'b0R1T1z-e_c', site: 'youtube' },
    source: 'fallback',
  },
  {
    id: 113415,
    idMal: 40748,
    title: {
      english: 'JUJUTSU KAISEN',
      romaji: 'Jujutsu Kaisen',
      native: '呪術廻戦',
    },
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQBSkxWAAk83.jpg',
    coverImage: {
      extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pAcpfD.jpg',
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx113415-bbBWj4pAcpfD.jpg',
      color: '#e44141',
    },
    description: 'A boy swallowed a cursed talisman - the finger of a demon - and became the curse himself. He enters a shaman school to be able to locate the demon other body parts and thus exorcise himself.',
    genres: ['Action', 'Fantasy', 'Supernatural'],
    averageScore: 86,
    popularity: 290000,
    episodes: 24,
    duration: 24,
    format: 'TV',
    status: 'FINISHED',
    season: 'FALL',
    seasonYear: 2020,
    studios: { nodes: [{ name: 'MAPPA', isAnimationStudio: true }] },
    nextAiringEpisode: null,
    trailer: { id: 'V_mU3W_2s8Y', site: 'youtube' },
    source: 'fallback',
  },
  {
    id: 101922,
    idMal: 38000,
    title: {
      english: 'Demon Slayer: Kimetsu no Yaiba',
      romaji: 'Kimetsu no Yaiba',
      native: '鬼滅の刃',
    },
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-YfZhKBUDDS6L.jpg',
    coverImage: {
      extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-PEn1CTbeUgqm.jpg',
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx101922-PEn1CTbeUgqm.jpg',
      color: '#f16543',
    },
    description: 'It is the Taisho Period in Japan. Tanjiro, a kindhearted boy who sells charcoal for a living, finds his family slaughtered by a demon. To make matters worse, his younger sister Nezuko has transformed into a demon.',
    genres: ['Action', 'Fantasy', 'Supernatural'],
    averageScore: 85,
    popularity: 310000,
    episodes: 26,
    duration: 24,
    format: 'TV',
    status: 'FINISHED',
    season: 'SPRING',
    seasonYear: 2019,
    studios: { nodes: [{ name: 'ufotable', isAnimationStudio: true }] },
    nextAiringEpisode: null,
    trailer: { id: '6vMuWuWlW4I', site: 'youtube' },
    source: 'fallback',
  },
  {
    id: 127230,
    idMal: 44511,
    title: {
      english: 'Chainsaw Man',
      romaji: 'Chainsaw Man',
      native: 'チェンソーマン',
    },
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/127230-01e405f63d0c9f13cf6b92a2a0d778fb.jpg',
    coverImage: {
      extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx127230-01e405f63d0c9f13cf6b92a2a0d778fb.jpg',
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx127230-01e405f63d0c9f13cf6b92a2a0d778fb.jpg',
      color: '#e47025',
    },
    description: 'Denji is a teenage boy living with a Chainsaw Devil named Pochita. Due to the debt his father left behind, he has been living a rock-bottom life while repaying his debt by harvesting devil corpses with Pochita.',
    genres: ['Action', 'Comedy', 'Drama', 'Supernatural'],
    averageScore: 84,
    popularity: 240000,
    episodes: 12,
    duration: 24,
    format: 'TV',
    status: 'FINISHED',
    season: 'FALL',
    seasonYear: 2022,
    studios: { nodes: [{ name: 'MAPPA', isAnimationStudio: true }] },
    nextAiringEpisode: null,
    trailer: { id: 'q15CRdE5Bv0', site: 'youtube' },
    source: 'fallback',
  },
  {
    id: 16498,
    idMal: 16498,
    title: {
      english: 'Attack on Titan',
      romaji: 'Shingeki no Kyojin',
      native: '進撃の巨人',
    },
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFfEkWRfs2.jpg',
    coverImage: {
      extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-C6FPmWm59CyP.jpg',
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx16498-C6FPmWm59CyP.jpg',
      color: '#463b2f',
    },
    description: 'Centuries ago, mankind was slaughtered to near extinction by monstrous humanoid creatures called Titans, forcing humans to hide in fear behind enormous concentric walls.',
    genres: ['Action', 'Drama', 'Fantasy', 'Mystery'],
    averageScore: 85,
    popularity: 380000,
    episodes: 25,
    duration: 24,
    format: 'TV',
    status: 'FINISHED',
    season: 'SPRING',
    seasonYear: 2013,
    studios: { nodes: [{ name: 'WIT Studio', isAnimationStudio: true }] },
    nextAiringEpisode: null,
    trailer: { id: 'LHtdKWJgev4', site: 'youtube' },
    source: 'fallback',
  },
];

export function getStaticFallbackHeroAnime(): HeroAnime[] {
  return [...STATIC_FALLBACK_HERO_ANIME];
}

/**
 * Converts a standard Anime array (e.g. from Trending/Seasonal hooks) into HeroAnime objects
 */
export function convertAnimeListToHeroAnime(animeList: Anime[]): HeroAnime[] {
  if (!Array.isArray(animeList) || animeList.length === 0) return [];
  return animeList
    .filter((a) => Boolean(a && (a.banner || a.image || a.cover)))
    .map((a) => {
      const numId = typeof a.id === 'string' && a.id.startsWith('anilist-')
        ? parseInt(a.id.replace('anilist-', ''), 10) || a.id
        : typeof a.id === 'string' && /^\d+$/.test(a.id)
        ? parseInt(a.id, 10)
        : a.id;

      return {
        id: numId,
        idMal: null,
        title: {
          english: a.titleEnglish || a.title || null,
          romaji: a.titleRomaji || a.title || '',
          native: a.titleJapanese || null,
        },
        bannerImage: a.banner || null,
        coverImage: {
          extraLarge: a.cover || a.image || '',
          large: a.image || a.cover || '',
          color: null,
        },
        description: a.description || 'No description available.',
        genres: a.genres || [],
        averageScore: a.rating ? Math.round(a.rating * 10) : null,
        popularity: 0,
        episodes: a.episodes || 0,
        duration: null,
        format: a.type || 'TV',
        status: a.status || 'Ongoing',
        season: a.season || null,
        seasonYear: a.year || null,
        studios: {
          nodes: (a.studios || []).map((name) => ({ name, isAnimationStudio: true })),
        },
        nextAiringEpisode: null,
        trailer: null,
        source: 'fallback' as const,
      };
    });
}

// Fetch with timeout to prevent hanging
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 8000
): Promise<Response> {
  if (typeof window === 'undefined' && url.startsWith('/')) {
    throw new Error(`Relative URL skipped in non-browser context: ${url}`);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// Clear legacy cache keys on load
try {
  localStorage.removeItem('anistream_hero_cache');
  localStorage.removeItem('anistream_hero_cache_v2');
  localStorage.removeItem('anistream_hero_v3');
  localStorage.removeItem('anistream_hero_v6');
  localStorage.removeItem('anistream_hero_v7');
  localStorage.removeItem('anistream_hero_v8');
  localStorage.removeItem('anistream_hero_v9');
  localStorage.removeItem('anistream_hero_v10');
  localStorage.removeItem('anistream_hero_v11');
} catch { /* ignore */ }

function getCurrentSeason(): { season: string; year: number } {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  if (m <= 1) return { season: 'WINTER', year: y };
  if (m <= 4) return { season: 'SPRING', year: y };
  if (m <= 7) return { season: 'SUMMER', year: y };
  if (m <= 10) return { season: 'FALL', year: y };
  return { season: 'WINTER', year: y + 1 };
}

/** Fisher-Yates shuffle */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getCachedData(): HeroAnime[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedHeroData = JSON.parse(raw);
    if (cached.version !== CACHE_VERSION || !Array.isArray(cached.anime) || cached.anime.length === 0) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    // Stale after TTL, but still return cached data while background refresh occurs
    return cached.anime;
  } catch {
    return null;
  }
}

function setCachedData(anime: HeroAnime[], source: string): void {
  try {
    if (!Array.isArray(anime) || anime.length === 0) return;
    const data: CachedHeroData = { anime, timestamp: Date.now(), source, version: CACHE_VERSION };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function cleanDescription(desc: string): string {
  const t = desc
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (isPlaceholderAnimeDescription(t)) return '';
  return t;
}

// ─── AniList GraphQL ────────────────────────────────────────────────────────

function buildAniListQuery(sort: string, filters: string): string {
  return `{
  Page(page:1,perPage:35){
    media(type:ANIME,sort:${sort},isAdult:false${filters}){
      id
      idMal
      title{english romaji native}
      bannerImage
      coverImage{extraLarge large color}
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
      studios(isMain:true){nodes{name isAnimationStudio}}
      nextAiringEpisode{episode airingAt timeUntilAiring}
      trailer{id site}
    }
  }
}`;
}

function clientRecencyScore(m: Record<string, unknown>): number {
  const currentYear = new Date().getFullYear();
  const year = (m.seasonYear as number) || 0;
  const status = (m.status as string) || '';
  let score = 0;
  if (status === 'RELEASING') score += 100_000;
  if (year >= currentYear) score += 50_000;
  else if (year >= currentYear - 1) score += 20_000;
  else if (year >= currentYear - 2) score += 5_000;
  score += Math.min((m.popularity as number) || 0, 100_000) * 0.1;
  return score;
}

async function fetchAniListPage(query: string): Promise<Record<string, unknown>[]> {
  const response = await fetchAniListGraphQL({ query });
  const json = await response.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList query failed');
  return json?.data?.Page?.media || [];
}

async function fetchFromAniList(): Promise<HeroAnime[]> {
  const currentYear = new Date().getFullYear();
  const formats = '[TV,MOVIE,ONA]';
  const { season, year: seasonYear } = getCurrentSeason();

  const raw: Record<string, unknown>[] = [];

  const queries = [
    // Current season trending
    buildAniListQuery('TRENDING_DESC', `,season:${season},seasonYear:${seasonYear},format_in:${formats}`),
    // Popular releasing shows
    buildAniListQuery('POPULARITY_DESC', `,status:RELEASING,format_in:${formats}`),
    // Top recent trending
    buildAniListQuery('TRENDING_DESC', `,startDate_greater:${currentYear - 3}0000,format_in:${formats}`),
  ];

  for (const q of queries) {
    try {
      const chunk = await fetchAniListPage(q);
      if (Array.isArray(chunk)) raw.push(...chunk);
    } catch (e) {
      console.warn('[Hero] AniList page query failed:', e);
    }
  }

  // Dedupe by id
  const seen = new Set<number>();
  const deduped = raw.filter((m) => {
    const id = m.id as number;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Filter: must have either bannerImage OR valid large coverImage
  const candidates = deduped.filter((m) => {
    const b = m.bannerImage as string | null;
    const cover = m.coverImage as { extraLarge?: string; large?: string } | null;
    const hasImage = Boolean(b || cover?.extraLarge || cover?.large);
    if (!hasImage) return false;

    const year = (m.seasonYear as number) || 0;
    const status = (m.status as string) || '';
    if (status === 'RELEASING') return true;
    return year >= currentYear - 4;
  });

  candidates.sort((a, b) => clientRecencyScore(b) - clientRecencyScore(a));

  const top = candidates.slice(0, 10);
  const rest = candidates.slice(10);
  const shuffled = [...shuffleArray(top), ...shuffleArray(rest)];

  const out: HeroAnime[] = [];
  for (const m of shuffled) {
    if (out.length >= 20) break;
    let desc = cleanDescription((m.description as string) || '');
    if (desc.length < 20) desc = 'No description available.';

    out.push({
      ...(m as unknown as HeroAnime),
      description: desc,
      source: 'anilist' as const,
    });
  }

  return out;
}

async function fetchFromHeroSpotlightAPI(): Promise<HeroAnime[]> {
  const response = await fetchWithTimeout(apiUrl('/api/anime/hero-spotlight'), {}, 8000);
  if (!response.ok) {
    throw new Error(`hero-spotlight HTTP ${response.status}`);
  }
  const json = (await response.json()) as { results?: HeroAnime[] };
  const results = json.results;
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('hero-spotlight empty');
  }
  return results.map((a) => ({
    ...a,
    description: cleanDescription(a.description || ''),
  }));
}

// ─── FALLBACK: BFF Trending (streaming-source backed) ─────────────────────────

async function fetchFromBffTrending(): Promise<HeroAnime[]> {
  try {
    const response = await fetchWithTimeout(apiUrl('/api/anime/trending?page=1&limit=20'), {}, 8000);
    if (!response.ok) return [];
    const json = (await response.json()) as { results?: Anime[] };
    const results = json.results || [];
    return convertAnimeListToHeroAnime(results);
  } catch (e) {
    console.warn('[Hero] BFF trending fallback failed:', e);
    return [];
  }
}

// ─── FALLBACK: Jikan (MyAnimeList unofficial API) ─────────────────────────────

async function fetchFromJikan(): Promise<HeroAnime[]> {
  try {
    const response = await fetchWithTimeout(
      'https://api.jikan.moe/v4/top/anime?page=1&limit=20&filter=airing',
      { headers: { 'User-Agent': USER_AGENT } },
      8000
    );
    if (!response.ok) return [];
    const json = (await response.json()) as {
      data?: Array<{
        mal_id: number;
        title: string;
        title_english?: string;
        title_japanese?: string;
        images?: { jpg?: { image_url?: string; large_image?: string } };
        synopsis?: string;
        genres?: Array<{ name: string }>;
        score?: number;
        members?: number;
        episodes?: number;
        status?: string;
      }>;
    };
    const results = json.data || [];
    return results.map((item) => ({
      id: item.mal_id,
      idMal: item.mal_id,
      title: { english: item.title_english || null, romaji: item.title, native: item.title_japanese || null },
      bannerImage: null,
      coverImage: {
        extraLarge: item.images?.jpg?.large_image || item.images?.jpg?.image_url || '',
        large: item.images?.jpg?.image_url || '',
        color: null,
      },
      description: cleanDescription(item.synopsis || ''),
      genres: item.genres?.map((g) => g.name) || [],
      averageScore: item.score ? Math.round(item.score * 10) : null,
      popularity: item.members || 0,
      episodes: item.episodes || 0,
      duration: null,
      format: 'TV',
      status: item.status === 'Airing' ? 'RELEASING' : item.status === 'Complete' ? 'FINISHED' : item.status || 'Ongoing',
      season: null,
      seasonYear: null,
      studios: { nodes: [] },
      nextAiringEpisode: null,
      trailer: null,
      source: 'jikan' as const,
    }));
  } catch (e) {
    console.warn('[Hero] Jikan fallback failed:', e);
    return [];
  }
}

// ─── FALLBACK: Kitsu API ───────────────────────────────────────────────────────

async function fetchFromKitsu(): Promise<HeroAnime[]> {
  try {
    const response = await fetchWithTimeout(
      'https://kitsu.io/api/edge/anime?page[limit]=20&page[offset]=0&sort=-popularityRank&filter[status]=current',
      {
        headers: {
          Accept: 'application/vnd.api+json',
          'User-Agent': USER_AGENT,
        },
      },
      8000
    );
    if (!response.ok) return [];
    const json = (await response.json()) as {
      data?: Array<{
        id: string;
        attributes?: {
          titles?: { en?: string; en_jp?: string; ja_jp?: string };
          coverImage?: { large?: string; original?: string };
          posterImage?: { large?: string; original?: string };
          synopsis?: string;
          averageRating?: string;
          userCount?: number;
          episodeCount?: number;
          startDate?: string;
          status?: string;
        };
      }>;
    };
    const results = json.data || [];
    return results.map((item) => ({
      id: parseInt(item.id, 10) || item.id,
      idMal: null,
      title: {
        english: item.attributes?.titles?.en || null,
        romaji: item.attributes?.titles?.en_jp || '',
        native: item.attributes?.titles?.ja_jp || null,
      },
      bannerImage: item.attributes?.coverImage?.original || item.attributes?.coverImage?.large || null,
      coverImage: {
        extraLarge: item.attributes?.posterImage?.original || item.attributes?.posterImage?.large || '',
        large: item.attributes?.posterImage?.large || '',
        color: null,
      },
      description: cleanDescription(item.attributes?.synopsis || ''),
      genres: [],
      averageScore: item.attributes?.averageRating ? parseFloat(item.attributes.averageRating) * 10 : null,
      popularity: item.attributes?.userCount || 0,
      episodes: item.attributes?.episodeCount || 0,
      duration: null,
      format: 'TV',
      status: item.attributes?.status === 'current' ? 'RELEASING' : 'Unknown',
      season: null,
      seasonYear: item.attributes?.startDate ? new Date(item.attributes.startDate).getFullYear() : null,
      studios: { nodes: [] },
      nextAiringEpisode: null,
      trailer: null,
      source: 'kitsu' as const,
    }));
  } catch (e) {
    console.warn('[Hero] Kitsu fallback failed:', e);
    return [];
  }
}

// ─── TMDB API FALLBACK ─────────────────────────────────────────────────────────

async function fetchFromTMDB(): Promise<HeroAnime[]> {
  try {
    const apiKey = import.meta.env.VITE_TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
    const response = await fetchWithTimeout(
      `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_genres=16&sort_by=popularity.desc&page=1`,
      { headers: { 'User-Agent': USER_AGENT } },
      8000
    );
    if (!response.ok) return [];

    const json = (await response.json()) as {
      results?: Array<{
        id: number;
        name: string;
        overview: string;
        poster_path: string;
        backdrop_path: string;
        vote_average: number;
        first_air_date: string;
        genre_ids: number[];
      }>;
    };

    const results = json.results || [];
    return results.slice(0, 20).map((item) => ({
      id: item.id,
      idMal: null,
      title: {
        english: item.name,
        romaji: item.name,
        native: null,
      },
      bannerImage: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
      coverImage: {
        extraLarge: item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : '',
        large: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
        color: null,
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
      source: 'tmdb' as const,
    }));
  } catch (e) {
    console.warn('[Hero] TMDB fallback failed:', e);
    return [];
  }
}

// ─── Master Orchestrator ───────────────────────────────────────────────────

export async function fetchHeroAnime(): Promise<HeroAnime[]> {
  // 1) Direct AniList GraphQL — highest quality metadata & banners
  try {
    const data = await fetchFromAniList();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} anime from AniList direct`);
      setCachedData(data, 'AniList');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] AniList direct failed, trying fallbacks:', err);
  }

  // 2) BFF trending (streaming-source backed)
  try {
    const data = await fetchFromBffTrending();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} anime from BFF trending`);
      setCachedData(data, 'BFF-trending');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] BFF trending failed, trying next fallback:', err);
  }

  // 3) Server hero-spotlight API
  try {
    const data = await fetchFromHeroSpotlightAPI();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} from /api/anime/hero-spotlight`);
      setCachedData(data, 'hero-spotlight');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] hero-spotlight API failed:', err);
  }

  // 4) Jikan (MyAnimeList)
  try {
    const data = await fetchFromJikan();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} anime from Jikan (MAL)`);
      setCachedData(data, 'Jikan');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] Jikan failed:', err);
  }

  // 5) Kitsu API
  try {
    const data = await fetchFromKitsu();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} anime from Kitsu`);
      setCachedData(data, 'Kitsu');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] Kitsu failed:', err);
  }

  // 6) TMDB API
  try {
    const data = await fetchFromTMDB();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} anime from TMDB`);
      setCachedData(data, 'TMDB');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] TMDB failed:', err);
  }

  // 7) Return cached data if available
  const cached = getCachedData();
  if (cached && cached.length > 0) {
    console.warn('[Hero] All remote sources failed, returning cached data');
    return cached;
  }

  // 8) Guaranteed static fallback (prevents UI from ever being empty or disappearing)
  console.log('[Hero] Using built-in curated spotlight fallback');
  return getStaticFallbackHeroAnime();
}

// ─── React Hook ─────────────────────────────────────────────────────────────

export function useHeroAnime() {
  const [heroAnime, setHeroAnime] = useState<HeroAnime[]>(() => {
    const cached = getCachedData();
    return cached && cached.length > 0 ? cached : getStaticFallbackHeroAnime();
  });
  const [isLoading, setIsLoading] = useState(() => {
    const cached = getCachedData();
    return !(cached && cached.length > 0);
  });
  const [error, setError] = useState<Error | null>(null);
  const fetchedRef = useRef(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchHeroAnime();
      if (data && data.length > 0) {
        setHeroAnime(data);
      }
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = getCachedData();
    if (cached && cached.length > 0) {
      setHeroAnime(cached);
      setIsLoading(false);

      // Background refresh check
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.timestamp > 15 * 60 * 1000) {
            fetchHeroAnime()
              .then((fresh) => {
                // NEVER overwrite with empty array
                if (fresh && fresh.length > 0) {
                  setHeroAnime(fresh);
                }
              })
              .catch(() => {});
          }
        }
      } catch { /* ignore */ }
      return;
    }

    refetch();
  }, [refetch]);

  return { heroAnime, isLoading, error, refetch };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getHeroTitle(anime: HeroAnime): string {
  return anime.title?.english || anime.title?.romaji || 'Unknown Anime';
}

export function getStudioName(anime: HeroAnime): string | null {
  const studio = anime.studios?.nodes?.find((s) => s.isAnimationStudio) || anime.studios?.nodes?.[0];
  return studio?.name || null;
}

export function formatHeroRating(score: number | null): string | null {
  if (!score || score <= 0) return null;
  return (score / 10).toFixed(1);
}

export function getFormatLabel(format: string | null): string {
  const labels: Record<string, string> = {
    TV: 'TV Series',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    SPECIAL: 'Special',
    OVA: 'OVA',
    ONA: 'ONA',
    MUSIC: 'Music',
  };
  return labels[format || ''] || format || 'TV';
}

export function getSeasonLabel(season: string | null, year: number | null): string {
  if (!season || !year) return year?.toString() || '';
  const s: Record<string, string> = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  return `${s[season] || season} ${year}`;
}

export function getTrailerUrl(anime: HeroAnime): string | null {
  if (!anime.trailer?.id) return null;
  if (anime.trailer.site === 'youtube') return `https://www.youtube.com/embed/${anime.trailer.id}`;
  return null;
}
