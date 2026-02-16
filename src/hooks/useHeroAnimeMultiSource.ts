import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiConfig } from '@/lib/api-config';

/**
 * Multi-source hero anime fetcher with fallbacks:
 * 1. AniList GraphQL (primary - HD widescreen banners, rich metadata, YouTube trailers)
 * 2. Local trending API (fallback)
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
  source: 'anilist' | 'local';
}

interface CachedHeroData {
  anime: HeroAnime[];
  timestamp: number;
  source: string;
  version: number;
}

const CACHE_KEY = 'anistream_hero_v3';
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_VERSION = 3;

// Clear all old cache keys on load
try {
  localStorage.removeItem('anistream_hero_cache');
  localStorage.removeItem('anistream_hero_cache_v2');
} catch { /* ignore */ }

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
  return desc
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
}

// ─── AniList GraphQL ────────────────────────────────────────────────────────

const ANILIST_QUERY = `{
  Page(page:1,perPage:25){
    media(type:ANIME,sort:TRENDING_DESC,isAdult:false){
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

async function fetchFromAniList(): Promise<HeroAnime[]> {
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query: ANILIST_QUERY })
  });

  const json = await response.json();

  if (json.errors) {
    console.error('[Hero] AniList errors:', json.errors);
    throw new Error(json.errors[0]?.message || 'AniList query failed');
  }

  const media: Record<string, unknown>[] = json?.data?.Page?.media || [];

  return media
    .filter((m: Record<string, unknown>) => {
      const desc = m.description as string | null;
      return m.bannerImage && desc && desc.length > 50;
    })
    .map((m: Record<string, unknown>) => ({
      ...(m as unknown as HeroAnime),
      description: cleanDescription(m.description as string),
      source: 'anilist' as const,
    }))
    .slice(0, 20);
}

// ─── Local API fallback ─────────────────────────────────────────────────────

async function fetchFromLocalAPI(): Promise<HeroAnime[]> {
  const baseUrl = getApiConfig().baseUrl;
  const response = await fetch(`${baseUrl}/api/anime/trending?limit=25`);
  if (!response.ok) throw new Error(`Local API ${response.status}`);
  const data = await response.json();
  const list: Record<string, unknown>[] = data.results || data || [];

  return list
    .filter((a: Record<string, unknown>) => a.banner || a.cover || a.image)
    .map((a: Record<string, unknown>) => ({
      id: parseInt(a.id as string) || Math.floor(Math.random() * 1e6),
      idMal: null,
      title: { english: a.title as string, romaji: a.title as string, native: (a.titleJapanese as string) || null },
      bannerImage: (a.banner || a.cover || a.image) as string,
      coverImage: { extraLarge: (a.cover || a.image) as string, large: (a.image) as string, color: null },
      description: (a.description as string) || 'Watch this trending anime now!',
      genres: (a.genres as string[]) || [],
      averageScore: a.rating ? (a.rating as number) * 10 : null,
      popularity: 0,
      episodes: (a.episodes as number) || null,
      duration: a.duration ? parseInt(a.duration as string) : null,
      format: (a.type as string) || 'TV',
      status: (a.status as string) || 'Ongoing',
      season: (a.season as string) || null,
      seasonYear: (a.year as number) || null,
      studios: { nodes: ((a.studios as string[]) || []).map((s: string) => ({ name: s, isAnimationStudio: true })) },
      nextAiringEpisode: null,
      trailer: null,
      source: 'local' as const,
    }))
    .slice(0, 20);
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

async function fetchHeroAnime(): Promise<HeroAnime[]> {
  // Try AniList
  try {
    const data = await fetchFromAniList();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} anime from AniList (${data.filter(d => d.trailer?.id).length} with trailers)`);
      setCachedData(data, 'AniList');
      return data;
    }
  } catch (err) {
    console.warn('[Hero] AniList failed, trying fallback:', err);
  }

  // Fallback
  try {
    const data = await fetchFromLocalAPI();
    if (data.length > 0) {
      console.log(`[Hero] ✅ ${data.length} anime from Local API (fallback)`);
      setCachedData(data, 'Local');
      return data;
    }
  } catch (err) {
    console.error('[Hero] Local API failed:', err);
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
