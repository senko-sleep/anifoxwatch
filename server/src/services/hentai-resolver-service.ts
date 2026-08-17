/**
 * Hentai Resolver Service
 * 
 * Dynamic service for resolving hentai titles without hardcoding.
 * Uses external APIs (AniList, etc.) to fetch name variants and aliases,
 * then compares search results across sources to find the best match.
 * 
 * UPDATED: Now uses slug translation service for better title matching
 * UPDATED: Added caching and request deduplication for performance
 */

import axios from 'axios';
import { sourceManager } from './source-manager.js';
import { AnimeBase, AnimeSearchResult } from '../types/anime.js';
import { logger } from '../utils/logger.js';
import { translateSlug, findBestMatchingSlug, type SlugTranslationResult } from './slug-translation-service.js';
import { searchCache } from '../lib/memory-cache.js';

export interface NameVariant {
  name: string;
  type: 'english' | 'romaji' | 'native' | 'synonym';
}

export interface HentaiTitleInfo {
  primaryTitle: string;
  nameVariants: NameVariant[];
  anilistId?: number;
  isAdult: boolean;
}

export interface SourceMatchResult {
  source: string;
  anime: AnimeBase;
  matchScore: number;
  confidence: number;
}

// Cache configuration
const RESOLVE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Request deduplication: in-flight requests
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Get or create deduplicated request
 */
async function deduplicatedRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>;
  }
  
  const promise = requestFn().finally(() => {
    inFlightRequests.delete(key);
  });
  
  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Fetch title information from AniList API
 * DISABLED: AniList calls are causing 30+ second timeouts that block the entire API
 * Hentai resolution now works without AniList for faster performance
 */
async function fetchAniListTitleInfo(searchTerm: string): Promise<HentaiTitleInfo | null> {
  return null;
}

/**
 * Calculate match score between search term and anime title
 * IMPROVED: Now considers all title variants (English, Romaji, Japanese)
 * Uses multiple factors: word overlap, length similarity, exact matches, and sequence matching
 * FIXED: Better distinction between partial matches and full matches
 */
function calculateMatchScore(searchTerm: string, anime: AnimeBase): number {
  // Collect all title variants to check against
  const titleVariants = [
    anime.title,
    anime.titleEnglish,
    anime.titleRomaji,
    anime.titleJapanese
  ].filter(Boolean); // Remove null/undefined

  // Calculate score for each variant and take the maximum
  let maxScore = 0;
  
  for (const title of titleVariants) {
    if (!title) continue; // Skip undefined titles
    const score = calculateSingleTitleScore(searchTerm, title);
    if (score > maxScore) {
      maxScore = score;
    }
  }
  
  return maxScore;
}

/**
 * Calculate match score for a single title against search term
 * FIXED: Improved scoring to better distinguish good matches from partial matches
 */
function calculateSingleTitleScore(searchTerm: string, animeTitle: string): number {
  const searchLower = searchTerm.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const titleLower = animeTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '');

  // Exact match - highest score
  if (searchLower === titleLower) {
    return 1.0;
  }

  // Word overlap score
  const searchWords = searchLower.split(' ').filter(w => w.length > 2);
  const titleWords = titleLower.split(' ').filter(w => w.length > 2);

  if (searchWords.length === 0 || titleWords.length === 0) {
    return 0;
  }

  // Calculate word overlap with position consideration
  let matchCount = 0;
  let positionBonus = 0;
  
  for (let i = 0; i < searchWords.length; i++) {
    const searchWord = searchWords[i];
    const titleIndex = titleWords.indexOf(searchWord);
    
    if (titleIndex !== -1) {
      matchCount++;
      // Bonus for words in similar positions
      if (Math.abs(i - titleIndex) <= 1) {
        positionBonus += 0.1;
      }
    }
  }

  const wordScore = matchCount / Math.max(searchWords.length, 1);
  
  // Sequence matching: check if words appear in similar order
  let sequenceScore = 0;
  if (matchCount >= 2) {
    let matchedSequences = 0;
    for (let i = 0; i < searchWords.length - 1; i++) {
      const currentIdx = titleWords.indexOf(searchWords[i]);
      const nextIdx = titleWords.indexOf(searchWords[i + 1]);
      if (currentIdx !== -1 && nextIdx !== -1 && nextIdx > currentIdx) {
        matchedSequences++;
      }
    }
    sequenceScore = matchedSequences / Math.max(searchWords.length - 1, 1);
  }

  // Length similarity (prefer titles of similar length)
  const lengthDiff = Math.abs(searchLower.length - titleLower.length);
  const lengthScore = 1 - (lengthDiff / Math.max(searchLower.length, titleLower.length));

  // Combined score with improved weighting:
  // - 40% word overlap (reduced from 50%)
  // - 30% sequence matching (increased from 20%)
  // - 20% length similarity
  // - 10% position bonus
  let combinedScore = (wordScore * 0.4) + (sequenceScore * 0.3) + (lengthScore * 0.2) + (Math.min(positionBonus, 0.5) * 0.1);
  
  // Penalty for very short titles that match partially (e.g., "Kiss Hug" vs "A Kiss for the Petals")
  if (titleWords.length < 3 && searchWords.length >= 4) {
    combinedScore *= 0.7; // Penalize short titles matching long search terms
  }
  
  // Bonus for longer, more comprehensive matches
  if (matchCount >= 3 && titleWords.length >= 4) {
    combinedScore *= 1.1; // Bonus for comprehensive matches
  }
  
  return Math.min(combinedScore, 1.0); // Cap at 1.0
}

/**
 * Search across hentai sources and find the best match
 * Now with caching and request deduplication
 */
async function searchHentaiSources(searchTerm: string): Promise<SourceMatchResult[]> {
  // Check cache first
  const cacheKey = `hentai-search:${searchTerm}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    logger.debug(`[HentaiResolver] Cache hit for search: ${searchTerm}`, undefined, 'HentaiResolver');
    return cached;
  }

  return deduplicatedRequest(cacheKey, async () => {
    const results: SourceMatchResult[] = [];

    // Define hentai sources to search
    const hentaiSources = ['WatchHentai', 'Aniwaves']; // Hanime placeholder removed

    // Search all sources in parallel for better performance
    const searchPromises = hentaiSources.map(async (sourceName) => {
      try {
        // Wrap search with timeout to prevent blocking
        const searchResults = await Promise.race([
          sourceManager.search(searchTerm, 1, sourceName, { mode: 'adult' }),
          new Promise<AnimeSearchResult>((_, reject) => 
            setTimeout(() => reject(new Error('Search timeout')), 5000)
          )
        ]);

        if (searchResults.results && searchResults.results.length > 0) {
          const sourceResults = searchResults.results.map(anime => {
            const matchScore = calculateMatchScore(searchTerm, anime);
            
            // Only include results with decent match score
            if (matchScore > 0.3) {
              return {
                source: sourceName,
                anime,
                matchScore,
                confidence: matchScore * (anime.source === sourceName ? 1.0 : 0.8)
              } as SourceMatchResult;
            }
            return null;
          }).filter((item): item is SourceMatchResult => item !== null);
          
          return sourceResults;
        }
        return [];
      } catch (error) {
        logger.warn(`Failed to search ${sourceName} for hentai`, undefined, 'HentaiResolver');
        return [];
      }
    });

    const allResults = await Promise.all(searchPromises);
    results.push(...allResults.flat());

    // Cache the results
    searchCache.set(cacheKey, results, SEARCH_CACHE_TTL);
    
    return results;
  });
}

/**
 * Compare search results from multiple sources and determine the best match
 * Added comprehensive timeout protection to prevent API blocking
 */
export async function findBestHentaiMatch(searchTerm: string): Promise<SourceMatchResult | null> {
  try {
    // Step 1: Skip AniList for faster resolution - it's causing timeouts
    // Step 2: Search hentai sources with primary term only for speed
    const searchTerms = [searchTerm];

    // Step 3: Search across all hentai sources with individual timeouts
    const allMatches: SourceMatchResult[] = [];
    
    for (const term of searchTerms) {
      try {
        const matches = await searchHentaiSources(term);
        allMatches.push(...matches);
      } catch (error) {
        logger.warn(`Search failed for term "${term}"`, undefined, 'HentaiResolver');
      }
    }

    if (allMatches.length === 0) {
      return null;
    }

    // Step 4: Find the best match
    // Prioritize WatchHentai for adult content, then by match score
    const sortedMatches = allMatches.sort((a, b) => {
      // Prefer WatchHentai source
      if (a.source === 'WatchHentai' && b.source !== 'WatchHentai') {
        return -1;
      }
      if (b.source === 'WatchHentai' && a.source !== 'WatchHentai') {
        return 1;
      }
      
      // Then by match score
      return b.matchScore - a.matchScore;
    });

    const bestMatch = sortedMatches[0];
    
    // Only return if we have a decent match
    if (bestMatch.matchScore > 0.3) { // Lowered threshold for better hentai matching
      return bestMatch;
    }

    return null;
  } catch (error) {
    logger.error('Error finding best hentai match', undefined, { operation: 'findBestHentaiMatch' }, 'HentaiResolver');
    return null;
  }
}

/**
 * Resolve a hentai slug to the best matching anime from hentai sources
 * Now uses slug translation service to find all possible title variants
 * UPDATED: Added caching for instant repeat lookups
 */
export async function resolveHentaiSlug(slug: string): Promise<{ id: string; title: string; source: string } | null> {
  // Check cache first for instant response
  const cacheKey = `hentai-resolve:${slug}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    logger.debug(`[HentaiResolver] Cache hit for slug: ${slug}`, undefined, 'HentaiResolver');
    return cached;
  }

  return deduplicatedRequest(cacheKey, async () => {
    try {
      // Step 1: Translate the slug to get all possible title variants
      const translation = await Promise.race([
        translateSlug(slug, true), // isAdult = true for hentai
        new Promise<SlugTranslationResult>((_, reject) => 
          setTimeout(() => reject(new Error('Slug translation timeout')), 5000)
        )
      ]);
      
      // Step 2: Try each translated slug to find the best match
      const searchTerms = translation.translatedSlugs.map(s => s.replace(/-/g, ' '));
      
      // Add the original slug as a fallback
      searchTerms.push(slug.replace(/-/g, ' '));
      
      // Remove duplicates while preserving order
      const uniqueSearchTerms = Array.from(new Set(searchTerms));
      
      logger.info(`[HentaiResolver] Translated slug "${slug}" to ${uniqueSearchTerms.length} search terms`, 
        { terms: uniqueSearchTerms.slice(0, 3) }, 'HentaiResolver');
      
      // Step 3: Search for each term until we find a good match
      for (const searchTerm of uniqueSearchTerms) {
        try {
          const bestMatch = await Promise.race([
            findBestHentaiMatch(searchTerm),
            new Promise<SourceMatchResult | null>((_, reject) => 
              setTimeout(() => reject(new Error('Hentai search timeout')), 3000)
            )
          ]);
          
          if (bestMatch && bestMatch.matchScore > 0.4) {
            logger.info(`[HentaiResolver] Found match for "${searchTerm}": ${bestMatch.anime.title} (${bestMatch.source})`, 
              { score: bestMatch.matchScore }, 'HentaiResolver');
            
            const result = {
              id: bestMatch.anime.id,
              title: bestMatch.anime.title,
              source: bestMatch.source
            };
            
            // Cache the successful result
            searchCache.set(cacheKey, result, RESOLVE_CACHE_TTL);
            
            return result;
          }
        } catch (error) {
          if ((error as Error).message === 'Hentai search timeout') {
            logger.debug(`[HentaiResolver] Search timeout for "${searchTerm}", trying next term`, undefined, 'HentaiResolver');
          } else {
            logger.warn(`[HentaiResolver] Search failed for "${searchTerm}"`, undefined, 'HentaiResolver');
          }
          // Continue to next search term
        }
      }
      
      logger.warn(`[HentaiResolver] No match found for slug "${slug}" after trying ${uniqueSearchTerms.length} variants`, 
        undefined, 'HentaiResolver');
      
      return null;
    } catch (error) {
      if ((error as Error).message === 'Slug translation timeout') {
        logger.warn('Slug translation timed out, using basic fallback', undefined, 'HentaiResolver');
        // Fallback to basic search
        const searchTerm = slug.replace(/-/g, ' ');
        const bestMatch = await findBestHentaiMatch(searchTerm);
        if (bestMatch) {
          const result = {
            id: bestMatch.anime.id,
            title: bestMatch.anime.title,
            source: bestMatch.source
          };
          // Cache even fallback results
          searchCache.set(cacheKey, result, RESOLVE_CACHE_TTL);
          return result;
        }
      } else {
        logger.error('Error resolving hentai slug', error as Error, { operation: 'resolveHentaiSlug' }, 'HentaiResolver');
      }
      return null;
    }
  });
}

/**
 * Check if a search term is likely hentai content
 * Fast local string matching only - no API calls to prevent blocking
 */
export function isLikelyHentai(searchTerm: string): boolean {
  const lowerTerm = searchTerm.toLowerCase();
  
  // Very specific known hentai titles (most accurate)
  const specificHentaiTitles = [
    'boku no pico',
    'boku-no-pico',
    'a kiss for the petals',
    'a-kiss-for-the-petals',
    'sono hanabira',
    'sono-hanabira',
    'kiss hug',
    'kiss-hug'
  ];
  
  // Check for exact or partial match with known hentai titles
  if (specificHentaiTitles.some(title => lowerTerm.includes(title))) {
    return true;
  }
  
  // General hentai indicators (explicit keywords)
  const hentaiIndicators = [
    'hentai',
    'ecchi',
    '18+',
    'nsfw'
  ];
  
  return hentaiIndicators.some(indicator => lowerTerm.includes(indicator));
}