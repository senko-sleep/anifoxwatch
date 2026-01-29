/**
 * Fix for the streaming ID issue in genre searches
 * This adds the missing getAnimeByGenreAniList method to SourceManager
 */

import { AnimeBase, AnimeSearchResult } from '../types/anime.js';
import { anilistService } from './anilist-service.js';
import { logger } from '../utils/logger.js';

/**
 * Add this method to the SourceManager class to fix genre navigation
 */
export async function getAnimeByGenreAniList(this: any, genre: string, page: number = 1): Promise<AnimeSearchResult> {
    try {
        const result = await anilistService.searchByGenre(genre, page, 50);
        logger.info(`[SourceManager] AniList genre search for "${genre}" returned ${result.results.length} results`);
        
        // Simple approach: For each AniList result, try to find a streaming match
        const enrichedResults = await Promise.all(
            result.results.map(async (anime: AnimeBase) => {
                try {
                    // Try to find streaming match by searching for the title
                    const searchResult = await this.search(anime.title, 1);
                    const bestMatch = searchResult.results?.[0];
                    
                    if (bestMatch) {
                        // Return streaming anime with AniList genres
                        return {
                            ...bestMatch,
                            genres: anime.genres,
                            rating: anime.rating || bestMatch.rating,
                            streamingId: bestMatch.id,
                            source: 'HiAnimeDirect'
                        };
                    }
                    
                    // No streaming match found
                    return {
                        ...anime,
                        streamingId: undefined,
                        source: 'AniList'
                    };
                } catch (error) {
                    // If search fails, return AniList data
                    return {
                        ...anime,
                        streamingId: undefined,
                        source: 'AniList'
                    };
                }
            })
        );
        
        return {
            ...result,
            results: enrichedResults
        };
    } catch (error) {
        logger.error(`AniList genre search failed for "${genre}"`, error as Error, undefined, 'SourceManager');
        return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'AniList' };
    }
}
