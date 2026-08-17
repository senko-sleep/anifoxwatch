/**
 * Slug Translation Service
 * 
 * Translates anime/hentai slugs between different naming conventions
 * using AniList title variants (romaji, english, native) to find the best match
 * across different streaming sources.
 * 
 * This solves the problem where:
 * - "a-kiss-for-the-petals-joined-in-love-with-you" should match
 * - "sono-hanabira-ni-kuchizuke-wo-reo-x-mai-diaries-episode-1-id-01"
 * 
 * Because they are the same anime with different title translations.
 */

import { anilistService } from './anilist-service.js';
import { logger } from '../utils/logger.js';

export interface TitleVariant {
  title: string;
  type: 'english' | 'romaji' | 'native' | 'synonym';
  slug: string;
}

export interface SlugTranslationResult {
  originalSlug: string;
  translatedSlugs: string[];
  titleVariants: TitleVariant[];
  anilistId?: number;
  confidence: number;
}

/**
 * Cache for slug translations to avoid repeated AniList calls
 */
const TRANSLATION_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const translationCache = new Map<string, { result: SlugTranslationResult; expires: number }>();

/**
 * Normalize a string to slug format
 * Handles both Latin and non-Latin characters (Japanese, etc.)
 */
function normalizeToSlug(text: string): string {
  // For non-Latin text (Japanese, etc.), we'll skip slug generation and return empty
  // This is handled by the caller to fall back to other title variants
  const hasNonLatin = /[^\x00-\x7F]/.test(text);
  
  if (hasNonLatin) {
    // Return empty string for non-Latin text - will be filtered out by caller
    return '';
  }
  
  // For Latin text, use standard slug normalization
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Convert a slug back to a readable title
 */
function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (s1 === s2) return 1.0;
  
  // Levenshtein distance approximation
  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 1.0;
  
  // Count matching characters
  let matches = 0;
  for (let i = 0; i < Math.min(len1, len2); i++) {
    if (s1[i] === s2[i]) matches++;
  }
  
  const similarity = matches / maxLen;
  
  // Bonus for word overlap
  const words1 = s1.split(/[^a-z0-9]/).filter(w => w.length > 2);
  const words2 = s2.split(/[^a-z0-9]/).filter(w => w.length > 2);
  
  if (words1.length > 0 && words2.length > 0) {
    const wordMatches = words1.filter(w => words2.includes(w)).length;
    const wordSimilarity = wordMatches / Math.max(words1.length, words2.length);
    return Math.max(similarity, wordSimilarity);
  }
  
  return similarity;
}

/**
 * Generate all possible slug variations from a title
 */
function generateSlugVariants(title: string): string[] {
  const variants = new Set<string>();
  
  // Add the normalized slug
  variants.add(normalizeToSlug(title));
  
  // Add variations with different word separators
  const words = title.split(/\s+/);
  if (words.length > 1) {
    // Remove common words (a, an, the, etc.)
    const filteredWords = words.filter(w => 
      !['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for'].includes(w.toLowerCase())
    );
    if (filteredWords.length > 0) {
      variants.add(normalizeToSlug(filteredWords.join(' ')));
    }
    
    // Try first N words
    for (let i = 2; i <= Math.min(words.length, 4); i++) {
      variants.add(normalizeToSlug(words.slice(0, i).join(' ')));
    }
  }
  
  return Array.from(variants);
}

/**
 * Fetch title variants from AniList for a given search term
 */
async function fetchAniListTitleVariants(searchTerm: string, isAdult: boolean = false): Promise<TitleVariant[]> {
  try {
    const anilistData = await Promise.race([
      anilistService.searchByTitle(searchTerm, isAdult),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
    ]);
    
    if (!anilistData) return [];
    
    const variants: TitleVariant[] = [];
    
    // Add primary titles - prioritize romaji and english for slug generation
    if (anilistData.titleRomaji) {
      const romajiSlug = normalizeToSlug(anilistData.titleRomaji);
      if (romajiSlug) {
        variants.push({
          title: anilistData.titleRomaji,
          type: 'romaji',
          slug: romajiSlug
        });
      }
    }
    
    if (anilistData.titleEnglish) {
      const englishSlug = normalizeToSlug(anilistData.titleEnglish);
      if (englishSlug) {
        variants.push({
          title: anilistData.titleEnglish,
          type: 'english',
          slug: englishSlug
        });
      }
    }
    
    // Include native title but don't generate slug (it's non-Latin)
    if (anilistData.titleJapanese) {
      variants.push({
        title: anilistData.titleJapanese,
        type: 'native',
        slug: '' // Empty slug for native text
      });
    }
    
    // Fallback to generic title field if specific ones aren't available
    if (anilistData.title && variants.length === 0) {
      const titleSlug = normalizeToSlug(anilistData.title);
      if (titleSlug) {
        variants.push({
          title: anilistData.title,
          type: 'romaji',
          slug: titleSlug
        });
      }
    }
    
    // Generate additional slug variants from each title (skip empty slugs)
    const allVariants = [...variants];
    for (const variant of variants) {
      if (!variant.slug) continue; // Skip variants with empty slugs (native text)
      
      const additionalSlugs = generateSlugVariants(variant.title);
      for (const slug of additionalSlugs) {
        if (slug && !allVariants.find(v => v.slug === slug)) {
          allVariants.push({
            title: variant.title,
            type: variant.type,
            slug
          });
        }
      }
    }
    
    // Filter out variants with empty slugs
    return allVariants.filter(v => v.slug.length > 0);
  } catch (error) {
    logger.warn(`[SlugTranslation] Failed to fetch AniList variants for "${searchTerm}"`, undefined);
    return [];
  }
}

/**
 * Translate a slug to all possible matching slugs using AniList title variants
 */
export async function translateSlug(slug: string, isAdult: boolean = false): Promise<SlugTranslationResult> {
  // Check cache first
  const cacheKey = `${slug}:${isAdult}`;
  const cached = translationCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.result;
  }
  
  // Convert slug to search term
  const searchTerm = slugToTitle(slug);
  
  // Fetch title variants from AniList
  const titleVariants = await fetchAniListTitleVariants(searchTerm, isAdult);
  
  // If no AniList results, return basic variants
  if (titleVariants.length === 0) {
    const basicVariants = generateSlugVariants(searchTerm);
    const result: SlugTranslationResult = {
      originalSlug: slug,
      translatedSlugs: basicVariants,
      titleVariants: basicVariants.map(v => ({
        title: slugToTitle(v),
        type: 'synonym',
        slug: v
      })),
      confidence: 0.3
    };
    
    // Cache with shorter TTL for uncertain results
    translationCache.set(cacheKey, { result, expires: Date.now() + (5 * 60 * 1000) });
    return result;
  }
  
  // Extract unique slugs (filter out empty ones)
  const uniqueSlugs = new Set(titleVariants.map(v => v.slug).filter(s => s.length > 0));
  uniqueSlugs.add(slug); // Always include original slug
  
  // Calculate confidence based on how well the original slug matches
  const maxSimilarity = Math.max(...titleVariants.map(v => calculateSimilarity(slug, v.slug)));
  
  const result: SlugTranslationResult = {
    originalSlug: slug,
    translatedSlugs: Array.from(uniqueSlugs),
    titleVariants,
    anilistId: titleVariants[0]?.title ? parseInt(titleVariants[0].title.match(/\d+/)?.[0] || '0') : undefined,
    confidence: maxSimilarity
  };
  
  // Cache the result
  translationCache.set(cacheKey, { result, expires: Date.now() + TRANSLATION_CACHE_TTL });
  
  return result;
}

/**
 * Find the best matching slug from a list of candidates
 */
export function findBestMatchingSlug(targetSlug: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  
  let bestMatch: string | null = null;
  let bestScore = 0;
  
  for (const candidate of candidates) {
    const score = calculateSimilarity(targetSlug, candidate);
    if (score > bestScore && score > 0.5) { // Minimum threshold
      bestScore = score;
      bestMatch = candidate;
    }
  }
  
  return bestMatch;
}

/**
 * Batch translate multiple slugs (for efficiency)
 */
export async function batchTranslateSlugs(slugs: string[], isAdult: boolean = false): Promise<Map<string, SlugTranslationResult>> {
  const results = new Map<string, SlugTranslationResult>();
  
  // Process in parallel with concurrency limit
  const concurrency = 3;
  const chunks: string[][] = [];
  
  for (let i = 0; i < slugs.length; i += concurrency) {
    chunks.push(slugs.slice(i, i + concurrency));
  }
  
  for (const chunk of chunks) {
    const translations = await Promise.all(
      chunk.map(slug => translateSlug(slug, isAdult))
    );
    
    for (let i = 0; i < chunk.length; i++) {
      results.set(chunk[i], translations[i]);
    }
  }
  
  return results;
}

/**
 * Clear the translation cache (useful for testing or forced refresh)
 */
export function clearTranslationCache(): void {
  translationCache.clear();
}
