/**
 * Load anime metadata by AniList numeric id (browser → graphql.anilist.co).
 * Used when the edge API cannot return AniList rows (e.g. upstream fetch quirks).
 */

import type { Anime } from '@/types/anime';
import { fetchAniListGraphQL } from '@/lib/anilist-graphql';

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
        coverImage { large medium }
        bannerImage
        isAdult
      }
    }
  `;

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
        coverImage?: { large?: string; medium?: string };
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

  return {
    id: `anilist-${m.id}`,
    title,
    titleJapanese: m.title.native,
    image: m.coverImage?.large || m.coverImage?.medium || '',
    cover: m.coverImage?.large || m.coverImage?.medium,
    banner: m.bannerImage || undefined,
    description: desc,
    type: FORMAT_MAP[m.format] || 'TV',
    status: STATUS_MAP[m.status] || 'Completed',
    rating: m.averageScore ?? undefined,
    episodes: m.episodes ?? 0,
    duration: m.duration ? `${m.duration}m` : undefined,
    genres: m.genres || [],
    studios: m.studios?.nodes?.map((s) => s.name) || [],
    season: m.season?.toLowerCase(),
    year: m.startDate?.year,
    subCount: m.episodes ?? undefined,
    dubCount: 0,
    isMature: m.isAdult,
    source: 'AniList',
  };
}
