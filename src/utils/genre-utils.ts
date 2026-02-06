/**
 * Genre Consistency Utility
 * Ensures anime cards display consistent genre data
 * Fetches missing genre information from API or displays placeholders
 */

import { Anime } from '@/types/anime';
import { apiClient } from '@/lib/api-client';

// Default genre placeholders for missing data
const DEFAULT_GENRES = ['Anime'];

// Common genre mappings for normalization
const GENRE_NORMALIZATIONS: Record<string, string> = {
    'Shounen': 'Action',
    'Shoujo': 'Romance',
    'Seinen': 'Drama',
    'Josei': 'Romance',
    'Mecha': 'Sci-Fi',
    'Mahou Shoujo': 'Fantasy',
    'Hentai': 'Adult',
    'Ecchi': 'Ecchi',
    'Yaoi': 'Romance',
    'Yuri': 'Romance',
    'Isekai': 'Adventure',
    'Slice of Life': 'Comedy',
    'School': 'Comedy',
    'Supernatural': 'Supernatural',
    'Psychological': 'Psychological',
    'Thriller': 'Horror',
    'Martial Arts': 'Action',
    'Vampire': 'Horror',
    'Zombies': 'Horror',
    'Samurai': 'Action',
    'Historical': 'Drama',
    'Military': 'Action',
    'Police': 'Action',
    'Space': 'Sci-Fi',
    'Music': 'Drama',
    'Sports': 'Comedy',
    'Cars': 'Action',
    'Dementia': 'Horror',
    'Game': 'Adventure',
    'Magic': 'Fantasy',
    'Kids': 'Family',
    'Fantasy': 'Fantasy',
    'Comedy': 'Comedy',
    'Romance': 'Romance',
    'Sci-Fi': 'Sci-Fi',
    'Action': 'Action',
    'Adventure': 'Adventure',
    'Drama': 'Drama',
    'Horror': 'Horror',
    'Mystery': 'Mystery',
    'Suspense': 'Thriller',
    'Demons': 'Fantasy',
    'Harem': 'Romance',
    'Reverse Harem': 'Romance',
    'Shoujo Ai': 'Romance',
    'Shounen Ai': 'Romance',
    'Girls Love': 'Romance',
    'Boys Love': 'Romance',
    'CGDCT': 'Slice of Life',
    'Gag Humor': 'Comedy',
    'Parody': 'Comedy',
    'Satire': 'Comedy',
    'Slapstick': 'Comedy',
    'Romantic Subtext': 'Romance',
    'Workplace': 'Drama',
    'Achronological Order': 'Drama',
    'Anthology': 'Drama',
    'CGI': 'Animation',
    'Full Color': 'Animation',
    'Limbless': 'Action',
    'Live Action': 'Live Action',
    'No Dialogue': 'Drama',
    'Non-Linear': 'Drama',
    'Puppetry': 'Animation',
    'Rotoscoping': 'Animation',
    'Stop Motion': 'Animation',
};

// Genre categories for display
export interface GenreCategory {
    name: string;
    genres: string[];
}

export const GENRE_CATEGORIES: GenreCategory[] = [
    { name: 'Action', genres: ['Action', 'Adventure', 'Martial Arts', 'Military', 'Police', 'Samurai', 'Cars', 'Supernatural'] },
    { name: 'Comedy', genres: ['Comedy', 'Slice of Life', 'Parody', 'Gag Humor', 'Satire', 'Slapstick', 'Sports'] },
    { name: 'Drama', genres: ['Drama', 'Psychological', 'Romance', 'Thriller', 'Mystery', 'Horror', 'Suspense'] },
    { name: 'Fantasy', genres: ['Fantasy', 'Magic', 'Demons', 'Vampire', 'Zombies', 'Isekai', 'Mahou Shoujo'] },
    { name: 'Sci-Fi', genres: ['Sci-Fi', 'Space', 'Mecha', 'Game', 'Cyberpunk'] },
];

// Cache for fetched genre data
const genreCache = new Map<string, string[]>();
const GENRE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Normalize and deduplicate genres
 */
export function normalizeGenres(genres: string[] | undefined | null): string[] {
    if (!genres || !Array.isArray(genres) || genres.length === 0) {
        return [];
    }

    const normalized = genres
        .filter(g => g != null && typeof g === 'string')
        .map((g: string) => g.trim())
        .filter(g => g.length > 0)
        .map(g => {
            // Check normalization map
            const normalizedName = GENRE_NORMALIZATIONS[g] || g;
            // Capitalize first letter
            return normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1).toLowerCase();
        });

    // Remove duplicates while preserving order
    const unique = [...new Set(normalized)];

    return unique;
}

/**
 * Get display genres for an anime card
 * Returns normalized genres or placeholders if missing
 */
export function getDisplayGenres(anime: Anime, options?: {
    maxGenres?: number;
    includeDefaults?: boolean;
}): string[] {
    const { maxGenres = 3, includeDefaults = true } = options || {};

    // Normalize existing genres
    const normalized = normalizeGenres(anime.genres);

    // If we have genres, return them
    if (normalized.length > 0) {
        return normalized.slice(0, maxGenres);
    }

    // If no genres and defaults allowed, return placeholders
    if (includeDefaults) {
        return DEFAULT_GENRES.slice(0, maxGenres);
    }

    return [];
}

/**
 * Check if anime has valid genre data
 */
export function hasValidGenreData(anime: Anime): boolean {
    const genres = normalizeGenres(anime.genres);
    return genres.length > 0;
}

/**
 * Fetch missing genre information from API
 */
export async function fetchMissingGenres(animeId: string): Promise<string[]> {
    // Check cache first
    const cached = genreCache.get(animeId);
    if (cached && cached.length > 0) {
        return cached;
    }

    try {
        const anime = await apiClient.getAnime(animeId);
        if (anime && anime.genres && anime.genres.length > 0) {
            const normalized = normalizeGenres(anime.genres);
            genreCache.set(animeId, normalized);
            return normalized;
        }
    } catch (error) {
        console.error(`Failed to fetch genres for ${animeId}:`, error);
    }

    return [];
}

/**
 * Get genre badge color based on genre name
 */
export function getGenreColor(genre: string): string {
    const normalizedGenre = normalizeGenres([genre])[0]?.toLowerCase() || '';

    const colorMap: Record<string, string> = {
        'action': 'bg-red-500/10 text-red-400 border-red-500/20',
        'adventure': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        'comedy': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        'drama': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        'fantasy': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        'horror': 'bg-red-700/10 text-red-400 border-red-700/20',
        'romance': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
        'sci-fi': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        'mystery': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        'psychological': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
        'thriller': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
        'slice of life': 'bg-green-500/10 text-green-400 border-green-500/20',
        'sports': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
        'music': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        'mecha': 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
        'isekai': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        'harem': 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
        'ecchi': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        'adult': 'bg-red-900/10 text-red-400 border-red-900/20',
    };

    return colorMap[normalizedGenre] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
}

/**
 * Genre statistics for monitoring
 */
export interface GenreStats {
    totalAnime: number;
    withGenres: number;
    withoutGenres: number;
    completionRate: number;
    topGenres: { genre: string; count: number }[];
}

export function calculateGenreStats(animes: Anime[]): GenreStats {
    const withGenres = animes.filter(a => hasValidGenreData(a));
    const withoutGenres = animes.filter(a => !hasValidGenreData(a));

    // Count genre occurrences
    const genreCounts = new Map<string, number>();
    animes.forEach(anime => {
        const genres = normalizeGenres(anime.genres);
        genres.forEach(g => {
            genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
        });
    });

    const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre, count]) => ({ genre, count }));

    return {
        totalAnime: animes.length,
        withGenres: withGenres.length,
        withoutGenres: withoutGenres.length,
        completionRate: animes.length > 0 ? (withGenres.length / animes.length) * 100 : 100,
        topGenres
    };
}

/**
 * Clear genre cache
 */
export function clearGenreCache(): void {
    genreCache.clear();
}

/**
 * Get genre search suggestions for autocomplete
 */
export function getGenreSuggestions(input: string): string[] {
    const allGenres = GENRE_CATEGORIES.flatMap(c => c.genres);
    const normalizedInput = input.toLowerCase();
    
    return allGenres
        .filter(g => g.toLowerCase().includes(normalizedInput))
        .slice(0, 5);
}

export default {
    normalizeGenres,
    getDisplayGenres,
    hasValidGenreData,
    fetchMissingGenres,
    getGenreColor,
    calculateGenreStats,
    clearGenreCache,
    getGenreSuggestions,
    GENRE_CATEGORIES,
    DEFAULT_GENRES
};
