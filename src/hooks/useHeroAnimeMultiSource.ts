import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '@/lib/api-config';
import { fetchAniListGraphQL } from '@/lib/anilist-graphql';
import { isPlaceholderAnimeDescription } from '@/lib/utils';

/**
 * Hero anime: AniList GraphQL (catalog + metadata). Optional server hero-spotlight
 * (same AniList-backed list with server-side synopsis helpers); no streaming-catalog fallback.
 * 
 * Cached for 30 minutes in localStorage. Clears stale caches automatically.
 */

export interface HeroAnime {
  id: number;
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
  source: 'anilist';
}

interface CachedHeroData {
  anime: HeroAnime[];
  timestamp: number;
  source: string;
  version: number;
}

const CACHE_KEY = 'anistream_hero_v9';
const CACHE_TTL = 20 * 60 * 1000;
const CACHE_VERSION = 9;

// Clear legacy cache keys on load
try {
  localStorage.removeItem('anistream_hero_cache');
  localStorage.removeItem('anistream_hero_cache_v2');
  localStorage.removeItem('anistream_hero_v3');
  localStorage.removeItem('anistream_hero_v6');
  localStorage.removeItem('anistream_hero_v7');
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

/** Fisher-Yates shuffle — keeps diversity across visits */
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
    if (cached.version !== CACHE_VERSION || Date.now() - cached.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.anime;
  } catch {
    return null;
  }
}

function setCachedData(anime: HeroAnime[], source: string): void {
  try {
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
  Page(page:1,perPage:50){
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

function hasHttpBanner(m: Record<string, unknown>): boolean {
  const b = m.bannerImage;
  return typeof b === 'string' && /^https?:\/\//i.test(b.trim());
}

async function fetchJikanSynopsis(malId: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/full`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { synopsis?: string | null } };
    const s = json.data?.synopsis;
    if (typeof s !== 'string') return null;
    const t = s.replace(/\s*\[Written by[^\]]*\]\s*$/i, '').replace(/\s+/g, ' ').trim();
    return t.length >= 55 ? t.slice(0, 1200) : null;
  } catch {
    return null;
  }
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
  const recentYear = currentYear - 1;
  const formats = '[TV,MOVIE,ONA]';
  const { season, year: seasonYear } = getCurrentSeason();

  const raw: Record<string, unknown>[] = [];

  const queries = [
    // Current season first — most relevant for right now (e.g. Spring 2026)
    buildAniListQuery('TRENDING_DESC', `,season:${season},seasonYear:${seasonYear},format_in:${formats}`),
    buildAniListQuery('POPULARITY_DESC', `,season:${season},seasonYear:${seasonYear},format_in:${formats}`),
    buildAniListQuery('TRENDING_DESC', `,status:RELEASING,format_in:${formats}`),
    buildAniListQuery('TRENDING_DESC', `,startDate_greater:${recentYear}0000,format_in:${formats}`),
    buildAniListQuery('TRENDING_DESC', ``), // global fallback
  ];

  for (const q of queries) {
    try {
      const chunk = await fetchAniListPage(q);
      raw.push(...chunk);
    } catch (e) {
      console.warn('[Hero] AniList page failed:', e);
    }
  }

  // Dedupe by id
  const seen = new Set<number>();
  const deduped = raw.filter((m) => {
    const id = m.id as number;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const candidates = deduped.filter(hasHttpBanner);
  candidates.sort((a, b) => clientRecencyScore(b) - clientRecencyScore(a));

  // Shuffle within tiers so repeat visitors see a fresh rotation
  const top = candidates.slice(0, 10);
  const rest = candidates.slice(10);
  const shuffled = [...shuffleArray(top), ...shuffleArray(rest)];

  const out: HeroAnime[] = [];
  let jikanCalls = 0;

  for (const m of shuffled) {
    if (out.length >= 20) break;

    let desc = cleanDescription((m.description as string) || '');
    const idMal = m.idMal != null ? Number(m.idMal) : null;

    if (isPlaceholderAnimeDescription(desc) && idMal != null && Number.isFinite(idMal) && jikanCalls < 14) {
      jikanCalls += 1;
      await new Promise((r) => setTimeout(r, 380));
      const j = await fetchJikanSynopsis(idMal);
      if (j) desc = j;
    }

    if (isPlaceholderAnimeDescription(desc) || desc.length < 45) {
      continue;
    }

    out.push({
      ...(m as unknown as HeroAnime),
      description: desc,
      source: 'anilist' as const,
    });
  }

  return out;
}

async function fetchFromHeroSpotlightAPI(): Promise<HeroAnime[]> {
  const response = await fetch(apiUrl('/api/anime/hero-spotlight'));
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

// ─── Orchestrator ───────────────────────────────────────────────────────────

async function fetchHeroAnime(): Promise<HeroAnime[]> {
  // 1) Server: AniList widescreen banners + Jikan synopsis when needed (best quality)
  try {
    const data = await fetchFromHeroSpotlightAPI();
    if (data.length > 0) {
      console.log(
        `[Hero] ✅ ${data.length} from /api/anime/hero-spotlight (${data.filter((d) => d.trailer?.id).length} w/ trailers)`
      );
      setCachedData(data, 'hero-spotlight');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] hero-spotlight API failed, trying direct AniList:', err);
  }

  // 2) Browser: AniList + optional Jikan (same rules: real banner URL + real synopsis)
  try {
    const data = await fetchFromAniList();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} anime from AniList direct (${data.filter((d) => d.trailer?.id).length} w/ trailers)`);
      setCachedData(data, 'AniList');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] AniList direct failed:', err);
  }

  throw new Error('All hero sources failed');
}

// ─── React Hook ─────────────────────────────────────────────────────────────

export function useHeroAnime() {
  const [heroAnime, setHeroAnime] = useState<HeroAnime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchedRef = useRef(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchHeroAnime();
      setHeroAnime(data);
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
      // Background refresh if > 15 min old
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.timestamp > 15 * 60 * 1000) {
            fetchHeroAnime().then(setHeroAnime).catch(() => {});
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
  return anime.title.english || anime.title.romaji;
}

export function getStudioName(anime: HeroAnime): string | null {
  const studio = anime.studios.nodes.find(s => s.isAnimationStudio) || anime.studios.nodes[0];
  return studio?.name || null;
}

export function formatHeroRating(score: number | null): string | null {
  if (!score || score <= 0) return null;
  return (score / 10).toFixed(1);
}

export function getFormatLabel(format: string | null): string {
  const labels: Record<string, string> = {
    TV: 'TV Series', TV_SHORT: 'TV Short', MOVIE: 'Movie',
    SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music',
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
