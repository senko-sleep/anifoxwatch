/**
 * AniList batch cover image enrichment.
 *
 * Fetches high-quality cover images from AniList for a list of anime titles
 * using a single batched GraphQL query (up to 50 titles per request).
 * Results are cached in sessionStorage so repeat renders are instant.
 */

import { Anime } from '@/types/anime';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AniListCoverMedia {
  id: number;
  title: { english: string | null; romaji: string };
  coverImage: { extraLarge: string; large: string };
  bannerImage: string | null;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_KEY = 'anistream_anilist_covers_v1';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/** In-memory cover cache: normalised title → cover URL */
let memCache: Map<string, string> | null = null;

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function loadCacheFromStorage(): Map<string, string> {
  if (memCache) return memCache;
  memCache = new Map();
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: Record<string, string>; ts: number };
      if (Date.now() - parsed.ts < CACHE_TTL) {
        for (const [k, v] of Object.entries(parsed.data)) {
          memCache.set(k, v);
        }
      }
    }
  } catch { /* ignore */ }
  return memCache;
}

function persistCache(): void {
  if (!memCache) return;
  try {
    const data: Record<string, string> = {};
    for (const [k, v] of memCache.entries()) data[k] = v;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

// ─── AniList GraphQL batch search ────────────────────────────────────────────

/**
 * Build a batched GraphQL query that searches for multiple titles in one call.
 * AniList supports aliased fields, so we send `q0: Page(…){media(search:"…")…} …`
 */
function buildBatchQuery(titles: string[]): string {
  const fragments = titles.map((title, i) => {
    const escaped = title.replace(/"/g, '\\"').slice(0, 80);
    return `q${i}: Page(page:1,perPage:1){ media(search:"${escaped}",type:ANIME,isAdult:false){ id title{english romaji} coverImage{extraLarge large} bannerImage } }`;
  });
  return `{ ${fragments.join(' ')} }`;
}

async function fetchBatchCovers(titles: string[]): Promise<Map<string, AniListCoverMedia>> {
  const result = new Map<string, AniListCoverMedia>();
  if (titles.length === 0) return result;

  // AniList complexity limit: batch max 25 at a time
  const BATCH_SIZE = 25;
  for (let offset = 0; offset < titles.length; offset += BATCH_SIZE) {
    const batch = titles.slice(offset, offset + BATCH_SIZE);
    const query = buildBatchQuery(batch);

    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        console.warn(`[AniList covers] HTTP ${response.status}`);
        continue;
      }

      const json = await response.json();
      if (json.errors) {
        console.warn('[AniList covers] Query errors:', json.errors[0]?.message);
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const page = json.data?.[`q${i}`];
        const media: AniListCoverMedia | undefined = page?.media?.[0];
        if (media?.coverImage?.extraLarge) {
          const key = normTitle(batch[i]);
          result.set(key, media);
        }
      }
    } catch (err) {
      console.warn('[AniList covers] Batch fetch failed:', err);
    }
  }

  return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** In-flight dedup by batch key */
const inflight = new Map<string, Promise<Anime[]>>();

/**
 * Enrich an array of anime with AniList HD cover images.
 * 
 * - Titles already cached are resolved immediately.
 * - Uncached titles are batched into a single AniList GraphQL call.
 * - The original array order is preserved; items that fail to match keep
 *   their original images.
 */
export async function enrichWithAniListCovers(anime: Anime[]): Promise<Anime[]> {
  if (!anime || anime.length === 0) return anime;

  const cache = loadCacheFromStorage();

  // Find titles that need fetching
  const needsFetch: string[] = [];
  for (const a of anime) {
    const key = normTitle(a.title);
    if (!cache.has(key)) {
      needsFetch.push(a.title);
    }
  }

  // Dedup unique titles
  const uniqueNeeded = [...new Set(needsFetch)];

  if (uniqueNeeded.length > 0) {
    // Dedup inflight by sorted batch key
    const batchKey = uniqueNeeded.slice(0, 5).map(normTitle).sort().join('|');
    const existing = inflight.get(batchKey);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const results = await fetchBatchCovers(uniqueNeeded);

        // Populate cache
        for (const [key, media] of results.entries()) {
          const coverUrl = media.coverImage.extraLarge || media.coverImage.large;
          if (coverUrl) cache.set(key, coverUrl);
        }
        persistCache();
      } catch (err) {
        console.warn('[AniList covers] enrichment failed:', err);
      } finally {
        inflight.delete(batchKey);
      }

      return applyCovers(anime, cache);
    })();

    inflight.set(batchKey, promise);
    return promise;
  }

  return applyCovers(anime, cache);
}

function applyCovers(anime: Anime[], cache: Map<string, string>): Anime[] {
  let changed = false;

  const enriched = anime.map((a) => {
    const key = normTitle(a.title);
    const cover = cache.get(key);
    if (cover && a.image !== cover) {
      changed = true;
      return { ...a, image: cover, cover: cover };
    }
    return a;
  });

  return changed ? enriched : anime;
}
