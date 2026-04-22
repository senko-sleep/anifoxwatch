/**
 * OMDB API client for IMDB ratings.
 * Set VITE_OMDB_API_KEY in your .env file to enable (free at omdbapi.com).
 * Falls back gracefully to null when key is absent.
 */

export interface ImdbRating {
  imdbId: string;
  rating: number;   // e.g. 8.3
  votes: string;    // e.g. "1,234,567"
}

const cache = new Map<string, ImdbRating | null>();

export async function fetchImdbRating(imdbId: string): Promise<ImdbRating | null> {
  if (cache.has(imdbId)) return cache.get(imdbId)!;

  const key = (import.meta as Record<string, unknown> & { env?: Record<string, string> }).env?.VITE_OMDB_API_KEY;
  if (!key) { cache.set(imdbId, null); return null; }

  try {
    const resp = await fetch(
      `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${key}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!resp.ok) { cache.set(imdbId, null); return null; }
    const data = await resp.json();
    if (data.imdbRating && data.imdbRating !== 'N/A') {
      const result: ImdbRating = {
        imdbId,
        rating: parseFloat(data.imdbRating),
        votes: data.imdbVotes ?? '',
      };
      cache.set(imdbId, result);
      return result;
    }
  } catch { /* network/timeout */ }

  cache.set(imdbId, null);
  return null;
}
