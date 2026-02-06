// AniList API client for fetching high-quality anime images and metadata

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

export interface AniListResponse {
  data: {
    Media: AniListMedia | null;
  };
}

export class AniListClient {
  private static readonly API_URL = 'https://graphql.anilist.co';

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

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { search }
        })
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
