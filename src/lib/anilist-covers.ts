/**
 * AniList batch cover image enrichment.
 *
 * Fetches high-quality cover images from AniList for a list of anime titles
 * using a single batched GraphQL query (up to 50 titles per request).
 * Results are cached in sessionStorage so repeat renders are instant.
 */

import { Anime } from '@/types/anime';
import { fetchAniListGraphQL } from '@/lib/anilist-graphql';

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

// ─── AniList media id → cover (stable s4.anilist.co URLs) ─────────────────────

const ID_COVER_CACHE_KEY = 'anistream_anilist_id_covers_v1';
const ID_COVER_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

let idMemCache: Map<number, string> | null = null;

function loadIdCoverCache(): Map<number, string> {
  if (idMemCache) return idMemCache;
  idMemCache = new Map();
  try {
    const raw = sessionStorage.getItem(ID_COVER_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: Record<string, string>; ts: number };
      if (Date.now() - parsed.ts < ID_COVER_CACHE_TTL) {
        for (const [k, v] of Object.entries(parsed.data)) {
          const id = parseInt(k, 10);
          if (Number.isFinite(id) && typeof v === 'string' && v) idMemCache.set(id, v);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return idMemCache;
}

function persistIdCoverCache(): void {
  if (!idMemCache) return;
  try {
    const data: Record<string, string> = {};
    for (const [k, v] of idMemCache.entries()) data[String(k)] = v;
    sessionStorage.setItem(ID_COVER_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** Instant (session) lookup for Continue Watching — title cache from browse/home. */
export function lookupCachedAnilistPosterByTitle(title: string): string | undefined {
  if (!title?.trim()) return undefined;
  return loadCacheFromStorage().get(normTitle(title));
}

/** Instant lookup after at least one id batch has populated the cache. */
export function lookupCachedAnilistPosterByMediaId(mediaId: number): string | undefined {
  if (!Number.isFinite(mediaId)) return undefined;
  return loadIdCoverCache().get(mediaId);
}

/**
 * Batch-fetch cover URLs by AniList media id (reliable CDN; fixes dead scraper URLs for anilist-* history).
 */
export async function fetchAniListCoversByMediaIds(mediaIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const unique = [...new Set(mediaIds.filter((n) => Number.isFinite(n)))];
  if (unique.length === 0) return out;

  const cache = loadIdCoverCache();
  for (const id of unique) {
    const u = cache.get(id);
    if (u) out.set(id, u);
  }

  const missing = unique.filter((id) => !cache.has(id));
  if (missing.length === 0) return out;

  const CHUNK = 50;
  for (let offset = 0; offset < missing.length; offset += CHUNK) {
    const chunk = missing.slice(offset, offset + CHUNK);
    const idsCsv = chunk.join(', ');
    const query = `{ Page(page:1,perPage:50){ media(id_in:[${idsCsv}],type:ANIME){ id coverImage{extraLarge large} } } }`;

    let chunkOk = false;
    for (let attempt = 0; attempt < 3 && !chunkOk; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
      try {
        const response = await fetchAniListGraphQL({ query });
        if (!response.ok) continue;
        const json = (await response.json()) as {
          errors?: { message: string }[];
          data?: { Page?: { media?: { id: number; coverImage?: { extraLarge?: string; large?: string } }[] } };
        };
        if (json.errors?.length) continue;

        const media = json.data?.Page?.media ?? [];
        for (const m of media) {
          const url = m.coverImage?.extraLarge || m.coverImage?.large;
          if (m.id != null && url) {
            cache.set(m.id, url);
            out.set(m.id, url);
          }
        }
        persistIdCoverCache();
        chunkOk = true;
      } catch {
        /* retry */
      }
    }
  }

  return out;
}

/** Resolve poster URLs from titles; updates the same title cache as enrichWithAniListCovers. */
export async function resolveAnilistPosterUrlsForTitles(titles: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(titles.map((t) => t?.trim()).filter((t): t is string => !!t))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const titleCache = loadCacheFromStorage();

  const mergeBatch = (batch: Map<string, AniListCoverMedia>) => {
    for (const t of unique) {
      const media = batch.get(normTitle(t));
      const url = media?.coverImage?.extraLarge || media?.coverImage?.large;
      if (url) {
        out.set(t, url);
        titleCache.set(normTitle(t), url);
      }
    }
  };

  mergeBatch(await fetchBatchCovers(unique, false));

  const missed = unique.filter((t) => !out.has(t));
  if (missed.length > 0) {
    await new Promise((r) => setTimeout(r, 950));
    mergeBatch(await fetchBatchCovers(missed, false));
  }

  persistCache();
  return out;
}

// ─── AniList GraphQL batch search ────────────────────────────────────────────

/**
 * Build a batched GraphQL query that searches for multiple titles in one call.
 * AniList supports aliased fields, so we send `q0: Page(…){media(search:"…")…} …`
 */
function buildBatchQuery(titles: string[], includeAdult: boolean = false): string {
  const fragments = titles.map((title, i) => {
    const escaped = title.replace(/"/g, '\\"').slice(0, 80);
    // When includeAdult is true, omit isAdult filter so AniList returns both SFW and NSFW results.
    // When false, explicitly set isAdult:false to exclude adult content.
    const adultFilter = includeAdult ? '' : ',isAdult:false';
    return `q${i}: Page(page:1,perPage:1){ media(search:"${escaped}",type:ANIME${adultFilter}){ id title{english romaji} coverImage{extraLarge large} bannerImage } }`;
  });
  return `{ ${fragments.join(' ')} }`;
}

async function fetchBatchCovers(titles: string[], includeAdult: boolean = false): Promise<Map<string, AniListCoverMedia>> {
  const result = new Map<string, AniListCoverMedia>();
  if (titles.length === 0) return result;

  // Smaller batches = lower per-request complexity (helps avoid 429s with public limits).
  const BATCH_SIZE = 12;

  // For adult content, skip non-adult filter query and use adult filter instead
  // This avoids 25 wasted API calls that would miss hentai anyway
  if (includeAdult) {
    // Build queries with explicit isAdult:true filter
    for (let offset = 0; offset < titles.length; offset += BATCH_SIZE) {
      const batch = titles.slice(offset, offset + BATCH_SIZE);
      const fragments = batch.map((title, i) => {
        const escaped = title.replace(/"/g, '\\"').slice(0, 80);
        return `q${i}: Page(page:1,perPage:1){ media(search:"${escaped}",type:ANIME,isAdult:true){ id title{english romaji} coverImage{extraLarge large} bannerImage } }`;
      });
      const query = `{ ${fragments.join(' ')} }`;

      try {
        const response = await fetchAniListGraphQL({ query });

        if (!response.ok) continue;

        const json = await response.json();
        if (json.errors) continue;

        for (let i = 0; i < batch.length; i++) {
          const page = json.data?.[`q${i}`];
          const media: AniListCoverMedia | undefined = page?.media?.[0];
          const cover = media?.coverImage?.extraLarge || media?.coverImage?.large;
          if (media && cover) {
            result.set(normTitle(batch[i]), media);
          }
        }
      } catch { /* ignore fetch errors */ }
    }
    return result;
  }

  // For non-adult content, use default (non-adult) filter
  for (let offset = 0; offset < titles.length; offset += BATCH_SIZE) {
    const batch = titles.slice(offset, offset + BATCH_SIZE);
    const query = buildBatchQuery(batch, false);

    try {
      const response = await fetchAniListGraphQL({ query });

      if (!response.ok) {
        if (import.meta.env.DEV) {
          console.debug('[AniList covers] HTTP', response.status);
        }
        continue;
      }

      const json = await response.json();
      if (json.errors) {
        if (import.meta.env.DEV) {
          console.debug('[AniList covers] GraphQL:', json.errors[0]?.message);
        }
        continue;
      }

      for (let i = 0; i < batch.length; i++) {
        const page = json.data?.[`q${i}`];
        const media: AniListCoverMedia | undefined = page?.media?.[0];
        const cover = media?.coverImage?.extraLarge || media?.coverImage?.large;
        if (media && cover) {
          result.set(normTitle(batch[i]), media);
        }
      }
    } catch {
      /* network / abort — covers stay as-is */
    }
  }

  // Retry missed titles with explicit isAdult:true
  const missed = titles.filter(t => !result.has(normTitle(t)));
  if (missed.length > 0) {
    for (let offset = 0; offset < missed.length; offset += BATCH_SIZE) {
      const batch = missed.slice(offset, offset + BATCH_SIZE);
      const fragments = batch.map((title, i) => {
        const escaped = title.replace(/"/g, '\\"').slice(0, 80);
        return `q${i}: Page(page:1,perPage:1){ media(search:"${escaped}",type:ANIME,isAdult:true){ id title{english romaji} coverImage{extraLarge large} bannerImage } }`;
      });
      const query = `{ ${fragments.join(' ')} }`;

      try {
        const response = await fetchAniListGraphQL({ query });
        if (!response.ok) continue;
        const json = await response.json();
        if (json.errors) continue;

        for (let i = 0; i < batch.length; i++) {
          const page = json.data?.[`q${i}`];
          const media: AniListCoverMedia | undefined = page?.media?.[0];
          const cover = media?.coverImage?.extraLarge || media?.coverImage?.large;
          if (media && cover) {
            result.set(normTitle(batch[i]), media);
          }
        }
      } catch { /* ignore retry failures */ }
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
export async function enrichWithAniListCovers(anime: Anime[], includeAdult: boolean = false): Promise<Anime[]> {
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
    const joined = uniqueNeeded.map(normTitle).sort().join('\u241e');
    let h = 2166136261;
    for (let i = 0; i < joined.length; i++) {
      h ^= joined.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const batchKey = `${uniqueNeeded.length}:${(h >>> 0).toString(16)}`;
    const existing = inflight.get(batchKey);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const results = await fetchBatchCovers(uniqueNeeded, includeAdult);

        // Populate cache
        for (const [key, media] of results.entries()) {
          const coverUrl = media.coverImage.extraLarge || media.coverImage.large;
          if (coverUrl) cache.set(key, coverUrl);
        }
        persistCache();
      } catch {
        /* enrichment is best-effort */
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
