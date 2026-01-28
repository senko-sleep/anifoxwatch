// AniList API client for fetching high-quality anime images

import { Anime } from '@/types/anime';

export interface AniListMedia {
  id: number;
  bannerImage?: string;
  coverImage: {
    extraLarge: string;
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

  static async enrichAnimeWithImages(anime: Anime): Promise<Anime> {
    // Try to find the anime on AniList for better images
    const anilistData = await this.searchAnime(anime.title);
    
    if (anilistData) {
      return {
        ...anime,
        bannerImage: anilistData.bannerImage,
        coverImage: anilistData.coverImage.extraLarge,
        // Keep original images as fallback
        banner: anilistData.bannerImage || anime.banner || anime.cover || anime.image,
        cover: anilistData.coverImage.extraLarge || anime.cover || anime.image,
        image: anilistData.coverImage.extraLarge || anime.image
      };
    }

    return anime;
  }
}
