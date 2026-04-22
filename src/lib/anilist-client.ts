// AniList API client for fetching high-quality anime images and metadata

import { fetchAniListGraphQL } from '@/lib/anilist-graphql';
import { Anime } from '@/types/anime';

export interface AniListMedia {
  id: number;
  bannerImage?: string;
  coverImage: {
    extraLarge: string;
  };
  description?: string;
  genres?: string[];
  averageScore?: number;
  season?: string;
  seasonYear?: number;
  studios?: {
    nodes: { name: string }[];
  };
}

export interface AniListVoiceActor {
  id: number;
  name: { full: string };
  image: { medium: string };
  languageV2: string;
  /** Character this VA voices in the searched anime */
  character?: { name: string; image?: string };
}

export interface AniListCharacterEdge {
  node: {
    id: number;
    name: { full: string };
    image: { medium: string };
  };
  voiceActors: AniListVoiceActor[];
}

const vaCache = new Map<string, AniListVoiceActor[]>();

export interface AniListSearchEnrichment {
  titleEnglish?: string;
  description?: string;
  genres?: string[];
  averageScore?: number;
  /** AniList status: RELEASING | FINISHED | NOT_YET_RELEASED | CANCELLED | HIATUS */
  anilistStatus?: string;
  voiceActors?: AniListVoiceActor[];
  imdbId?: string;
}

const enrichCache = new Map<string, AniListSearchEnrichment>();

function cleanDesc(desc: string): string {
  return desc
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function enrichSearchResult(title: string): Promise<AniListSearchEnrichment> {
  if (enrichCache.has(title)) return enrichCache.get(title)!;
  const results = await enrichSearchResultsBatch([title]);
  return results[title] ?? {};
}

/**
 * Batch-enrich multiple titles in a single AniList GraphQL request using field aliases.
 * Avoids the 850ms per-request queue for 8+ sequential calls.
 */
export async function enrichSearchResultsBatch(
  titles: string[]
): Promise<Record<string, AniListSearchEnrichment>> {
  const missing = titles.filter(t => !enrichCache.has(t));
  const cached: Record<string, AniListSearchEnrichment> = {};
  for (const t of titles) {
    if (enrichCache.has(t)) cached[t] = enrichCache.get(t)!;
  }
  if (missing.length === 0) return cached;

  try {
    // Build one query with aliased fields per title
    const fields = missing.map((t, i) => {
      const safe = JSON.stringify(t);
      return `r${i}: Media(search: ${safe}, type: ANIME) {
        title { english }
        description(asHtml: false)
        genres
        averageScore
        status
        externalLinks { url site }
        characters(sort: ROLE, perPage: 6) {
          edges {
            node { name { full } image { medium } }
            voiceActors(language: JAPANESE) { id name { full } image { medium } languageV2 }
          }
        }
      }`;
    }).join('\n');

    const query = `{ ${fields} }`;

    // Bypass the serialized queue — use a direct fetch for batch call
    const resp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query }),
    });

    const json = resp.ok ? await resp.json() : null;
    const data = json?.data ?? {};

    missing.forEach((title, i) => {
      const media = data[`r${i}`];
      if (!media) { enrichCache.set(title, {}); return; }

      const actors: AniListVoiceActor[] = [];
      const seen = new Set<number>();
      for (const edge of media.characters?.edges ?? []) {
        const charNode = edge.node;
        for (const va of edge.voiceActors ?? []) {
          if (!seen.has(va.id) && va.image?.medium) {
            seen.add(va.id);
            actors.push({
              ...va,
              character: charNode
                ? { name: charNode.name?.full ?? '', image: charNode.image?.medium }
                : undefined,
            });
            if (actors.length >= 4) break;
          }
        }
        if (actors.length >= 4) break;
      }

      // Extract IMDB ID from external links
      const imdbLink = (media.externalLinks ?? []).find(
        (l: { site: string; url: string }) => l.site === 'IMDb'
      );
      const imdbId = imdbLink
        ? (imdbLink.url.match(/tt\d+/)?.[0] ?? undefined)
        : undefined;

      const enrich: AniListSearchEnrichment = {
        titleEnglish: media.title?.english || undefined,
        description: media.description ? cleanDesc(media.description) : undefined,
        genres: media.genres ?? [],
        averageScore: media.averageScore,
        anilistStatus: media.status,
        voiceActors: actors,
        imdbId,
      };
      enrichCache.set(title, enrich);
    });
  } catch {
    for (const t of missing) enrichCache.set(t, {});
  }

  return Object.fromEntries(titles.map(t => [t, enrichCache.get(t) ?? {}]));
}

export async function fetchAniListVoiceActors(titleOrId: string | number): Promise<AniListVoiceActor[]> {
  const cacheKey = String(titleOrId);
  if (vaCache.has(cacheKey)) return vaCache.get(cacheKey)!;

  try {
    const isId = typeof titleOrId === 'number' || /^\d+$/.test(String(titleOrId));
    const query = isId
      ? `query ($id: Int) { Media(id: $id, type: ANIME) { characters(sort: ROLE, perPage: 6) { edges { voiceActors(language: JAPANESE) { id name { full } image { medium } languageV2 } } } } }`
      : `query ($search: String) { Media(search: $search, type: ANIME) { characters(sort: ROLE, perPage: 6) { edges { voiceActors(language: JAPANESE) { id name { full } image { medium } languageV2 } } } } }`;
    const variables = isId ? { id: Number(titleOrId) } : { search: String(titleOrId) };

    const resp = await fetchAniListGraphQL({ query, variables });
    if (!resp.ok) return [];
    const data = await resp.json();
    const edges: AniListCharacterEdge[] = data?.data?.Media?.characters?.edges ?? [];
    const actors: AniListVoiceActor[] = [];
    const seen = new Set<number>();
    for (const edge of edges) {
      for (const va of edge.voiceActors ?? []) {
        if (!seen.has(va.id) && va.image?.medium) {
          seen.add(va.id);
          actors.push(va);
          if (actors.length >= 4) break;
        }
      }
      if (actors.length >= 4) break;
    }
    vaCache.set(cacheKey, actors);
    return actors;
  } catch {
    return [];
  }
}

export interface AniListResponse {
  data: {
    Media: AniListMedia | null;
  };
}

export class AniListClient {
  static async searchAnime(search: string): Promise<AniListMedia | null> {
    try {
      const query = `
        query ($search: String) {
          Media (search: $search, type: ANIME) {
            id
            bannerImage
            coverImage {
              extraLarge
            }
            description(asHtml: false)
            genres
            averageScore
            season
            seasonYear
            studios(isMain: true) {
              nodes {
                name
              }
            }
          }
        }
      `;

      const response = await fetchAniListGraphQL({
        query,
        variables: { search },
      });

      if (!response.ok) {
        throw new Error(`AniList API error: ${response.status}`);
      }

      const data: AniListResponse = await response.json();
      return data.data.Media;
    } catch (error) {
      console.error('AniList API fetch error:', error);
      return null;
    }
  }

  /**
   * Strip HTML tags from AniList description
   */
  private static cleanDescription(desc: string): string {
    return desc
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  static async enrichAnimeWithImages(anime: Anime): Promise<Anime> {
    // Try to find the anime on AniList for better images and metadata
    const anilistData = await this.searchAnime(anime.title);
    
    if (anilistData) {
      const cleanDesc = anilistData.description
        ? this.cleanDescription(anilistData.description)
        : '';

      return {
        ...anime,
        bannerImage: anilistData.bannerImage,
        coverImage: anilistData.coverImage.extraLarge,
        // Keep original images as fallback
        banner: anilistData.bannerImage || anime.banner || anime.cover || anime.image,
        cover: anilistData.coverImage.extraLarge || anime.cover || anime.image,
        image: anilistData.coverImage.extraLarge || anime.image,
        // Fill in missing metadata from AniList
        description: (anime.description && anime.description !== 'No description available.' && anime.description.length > 10)
          ? anime.description
          : (cleanDesc || anime.description),
        genres: (anime.genres && anime.genres.length > 0)
          ? anime.genres
          : (anilistData.genres || []),
        rating: anime.rating || (anilistData.averageScore ? anilistData.averageScore / 10 : undefined),
        season: anime.season || anilistData.season?.toLowerCase(),
        year: anime.year || anilistData.seasonYear,
        studios: (anime.studios && anime.studios.length > 0)
          ? anime.studios
          : (anilistData.studios?.nodes?.map(s => s.name) || []),
      };
    }

    return anime;
  }
}
