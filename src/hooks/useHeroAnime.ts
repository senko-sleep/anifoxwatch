import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hero anime data fetched directly from AniList GraphQL API.
 * This bypasses the backend entirely for hero banner data,
 * ensuring high-quality widescreen banners, full descriptions,
 * studio info, and scores — with zero rate limit issues.
 * 
 * AniList allows 90 requests/min. We make 1 batch query for 8 anime.
 * Data is cached in localStorage for 30 minutes.
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
  trending: number;
  episodes: number | null;
  duration: number | null;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  startDate: { year: number | null; month: number | null };
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
  tags: { name: string; rank: number }[];
  relations: {
    edges: {
      relationType: string;
      node: {
        id: number;
        title: { romaji: string };
        format: string;
      };
    }[];
  };
}

interface CachedHeroData {
  anime: HeroAnime[];
  timestamp: number;
}

const ANILIST_API = 'https://graphql.anilist.co';
const CACHE_KEY = 'anistream_hero_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const HERO_QUERY = `
query TrendingHero($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
      id
      idMal
      title {
        english
        romaji
        native
      }
      bannerImage
      coverImage {
        extraLarge
        large
        color
      }
      description(asHtml: false)
      genres
      averageScore
      popularity
      trending
      episodes
      duration
      format
      status
      season
      seasonYear
      startDate {
        year
        month
      }
      studios(isMain: true) {
        nodes {
          name
          isAnimationStudio
        }
      }
      nextAiringEpisode {
        episode
        airingAt
        timeUntilAiring
      }
      trailer {
        id
        site
      }
      tags(sort: RANK) {
        name
        rank
      }
      relations {
        edges {
          relationType
          node {
            id
            title {
              romaji
            }
            format
          }
        }
      }
    }
  }
}
`;

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

function getCachedData(): HeroAnime[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedHeroData = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.anime;
  } catch {
    return null;
  }
}

function setCachedData(anime: HeroAnime[]): void {
  try {
    const data: CachedHeroData = { anime, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

async function fetchHeroAnime(): Promise<HeroAnime[]> {
  try {
    const body = JSON.stringify({
      query: HERO_QUERY,
      variables: { page: 1, perPage: 12 }
    });
    
    console.log('[useHeroAnime] Fetching from AniList...');
    
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body
    });

    const json = await response.json();
    
    console.log('[useHeroAnime] Response status:', response.status);
    console.log('[useHeroAnime] Response body:', json);

    // Check for GraphQL errors first
    if (json.errors) {
      console.error('[useHeroAnime] GraphQL errors:', JSON.stringify(json.errors, null, 2));
      throw new Error(`AniList GraphQL error: ${json.errors[0]?.message || 'Unknown error'}`);
    }

    if (!response.ok) {
      console.error('[useHeroAnime] HTTP 400 error. Full response:', JSON.stringify(json, null, 2));
      throw new Error(`AniList API error: ${response.status}`);
    }

    const media: HeroAnime[] = json?.data?.Page?.media || [];
    console.log(`[useHeroAnime] ✅ Fetched ${media.length} trending anime from AniList`);

    // Filter: must have a banner image AND a decent description
    // Also clean descriptions
    return media
      .filter(m => m.bannerImage && m.description && m.description.length > 50)
      .map(m => ({
        ...m,
        description: m.description ? cleanDescription(m.description) : null,
      }))
      .slice(0, 8);
  } catch (error) {
    console.error('[useHeroAnime] Fetch failed:', error);
    throw error;
  }
}

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
      setCachedData(data);
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

    // Try cache first
    const cached = getCachedData();
    if (cached && cached.length > 0) {
      setHeroAnime(cached);
      setIsLoading(false);
      // Background refresh if cache is older than 15 min
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp > 15 * 60 * 1000) {
          fetchHeroAnime().then(data => {
            setCachedData(data);
            setHeroAnime(data);
          }).catch(() => {});
        }
      }
      return;
    }

    // No cache — fetch fresh
    refetch();
  }, [refetch]);

  return { heroAnime, isLoading, error, refetch };
}

/**
 * Get the best display title for a hero anime
 */
export function getHeroTitle(anime: HeroAnime): string {
  return anime.title.english || anime.title.romaji;
}

/**
 * Get the main studio name
 */
export function getStudioName(anime: HeroAnime): string | null {
  const studio = anime.studios.nodes.find(s => s.isAnimationStudio) || anime.studios.nodes[0];
  return studio?.name || null;
}

/**
 * Format AniList score (0-100) to display rating
 */
export function formatHeroRating(score: number | null): string | null {
  if (!score || score <= 0) return null;
  return (score / 10).toFixed(1);
}

/**
 * Get format display label
 */
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

/**
 * Get season display label
 */
export function getSeasonLabel(season: string | null, year: number | null): string {
  if (!season || !year) return year?.toString() || '';
  const seasonLabels: Record<string, string> = {
    WINTER: 'Winter',
    SPRING: 'Spring',
    SUMMER: 'Summer',
    FALL: 'Fall',
  };
  return `${seasonLabels[season] || season} ${year}`;
}
