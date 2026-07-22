/**
 * AniStream Hub – Cloudflare Workers Entry Point (Production)
 *
 * Designed for edge deployment with:
 *  - Hono framework with strongly-typed `Env` bindings
 *  - KV-backed response caching (falls back to in-memory for local dev)
 *  - Resilient fetch client with timeout + exponential backoff retry
 *  - AniList GraphQL as primary source, Jikan REST as automatic fallback
 *  - Structured request logging with unique request IDs
 *  - Cache-control headers and X-Cache hit/miss signals
 *  - Admin endpoint for cache purge (guarded by INTERNAL_API_KEY secret)
 *
 * Entrypoint is declared in wrangler.toml:
 *   main = "src/worker-simple.ts"
 *
 * Secrets (set via `wrangler secret put <NAME> --env production`):
 *   ANILIST_CLIENT_SECRET  – Optional OAuth token for authenticated AniList queries
 *   INTERNAL_API_KEY       – Guards /api/admin/cache/purge
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env.d.ts';
import { KVCache } from './lib/kv-cache.js';
import { fetchJson, getJson, resilientFetch } from './lib/fetch-client.js';

// ---------------------------------------------------------------------------
// App Setup
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Middleware: CORS
// ---------------------------------------------------------------------------
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Requested-With', 'X-API-Key'],
    maxAge: 86400,
  })
);

// ---------------------------------------------------------------------------
// Middleware: Request Logger + Request ID
// ---------------------------------------------------------------------------
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.header('X-Request-Id', requestId);

  const loggingEnabled = c.env.ENABLE_REQUEST_LOGGING !== 'false';
  const start = Date.now();

  if (loggingEnabled) {
    console.log(`[${requestId}] → ${c.req.method} ${c.req.path}`);
  }

  await next();

  if (loggingEnabled) {
    const ms = Date.now() - start;
    console.log(`[${requestId}] ← ${c.res.status} ${c.req.path} (${ms}ms)`);
  }
});

// ---------------------------------------------------------------------------
// Helper: Build KVCache from request context
// ---------------------------------------------------------------------------
function buildCache(env: Env): KVCache {
  return new KVCache(env.CACHE_STORE, env.ENABLE_KV_CACHING === 'true');
}

// ---------------------------------------------------------------------------
// Helper: Parse numeric env var with fallback
// ---------------------------------------------------------------------------
function envNum(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// AniList + Jikan Data Helpers
// ---------------------------------------------------------------------------

interface AniListAnime {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage: { medium?: string; large?: string; extraLarge?: string };
  bannerImage?: string;
  description?: string;
  genres?: string[];
  meanScore?: number;
  episodes?: number;
  status?: string;
  format?: string;
  season?: string;
  seasonYear?: number;
  nextAiringEpisode?: { airingAt: number; episode: number } | null;
}

interface JikanAnime {
  mal_id: number;
  title: string;
  images: { jpg: { image_url: string; large_image_url: string } };
  synopsis: string;
  genres: Array<{ name: string }>;
  score: number;
  episodes: number;
  status: string;
  type: string;
}

function transformAniList(anime: AniListAnime) {
  return {
    id: String(anime.id),
    title: anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown',
    titleRomaji: anime.title?.romaji,
    titleEnglish: anime.title?.english,
    image: anime.coverImage?.large || anime.coverImage?.medium || '',
    cover: anime.coverImage?.extraLarge || anime.coverImage?.large || '',
    banner: anime.bannerImage || null,
    description: anime.description || null,
    genres: anime.genres || [],
    rating: anime.meanScore || null,
    episodes: anime.episodes || null,
    status: anime.status || null,
    type: anime.format || null,
    season: anime.season || null,
    year: anime.seasonYear || null,
    nextAiringEpisode: anime.nextAiringEpisode || null,
    source: 'anilist' as const,
  };
}

function transformJikan(item: JikanAnime) {
  return {
    id: String(item.mal_id),
    title: item.title || 'Unknown',
    titleRomaji: item.title,
    titleEnglish: item.title,
    image: item.images?.jpg?.image_url || '',
    cover: item.images?.jpg?.large_image_url || '',
    banner: null,
    description: item.synopsis || null,
    genres: item.genres?.map((g) => g.name) || [],
    rating: item.score ? Math.round(item.score * 10) : null, // normalise to 0-100
    episodes: item.episodes || null,
    status: item.status || null,
    type: item.type || null,
    season: null,
    year: null,
    nextAiringEpisode: null,
    source: 'jikan' as const,
  };
}

/** Execute an AniList GraphQL query with Jikan REST fallback. */
async function queryAniList<T>(
  env: Env,
  gqlQuery: string,
  variables: Record<string, unknown>,
  jikanFallbackUrl: string
): Promise<{ data: T; source: 'anilist' | 'jikan' }> {
  const timeout = envNum(env.API_CALL_TIMEOUT_MS, 8000);
  const retries = envNum(env.FETCH_RETRY_COUNT, 3);
  const retryBase = envNum(env.FETCH_RETRY_DELAY_MS, 300);

  const anilistHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (env.ANILIST_CLIENT_SECRET) {
    anilistHeaders['Authorization'] = `Bearer ${env.ANILIST_CLIENT_SECRET}`;
  }

  try {
    const json = await fetchJson<{ data: T; errors?: Array<{ message: string }> }>(
      env.ANILIST_API_URL,
      { query: gqlQuery, variables },
      { headers: anilistHeaders, timeoutMs: timeout, retries, retryBaseMs: retryBase, context: 'AniList GraphQL' }
    );

    if (json.errors?.length) {
      throw new Error(`AniList error: ${json.errors[0].message}`);
    }

    return { data: json.data, source: 'anilist' };
  } catch (anilistErr) {
    console.warn('[AniList] Primary source failed, trying Jikan fallback:', anilistErr);

    const jikanJson = await getJson<T>(jikanFallbackUrl, {
      timeoutMs: timeout,
      retries: 2,
      retryBaseMs: retryBase,
      context: 'Jikan fallback',
    });

    return { data: jikanJson, source: 'jikan' };
  }
}

// ---------------------------------------------------------------------------
// Routes: Meta
// ---------------------------------------------------------------------------

app.get('/health', (c) =>
  c.json({
    status: 'healthy',
    environment: c.env.NODE_ENV || 'unknown',
    version: c.env.API_VERSION || '1.0.0',
    workerName: c.env.WORKER_NAME || 'anifoxwatch-api',
    cacheBackend: new KVCache(c.env.CACHE_STORE, c.env.ENABLE_KV_CACHING === 'true').isKVBacked
      ? 'cloudflare-kv'
      : 'in-memory',
    timestamp: new Date().toISOString(),
  })
);

app.get('/api/health', (c) => c.json({ status: 'healthy', timestamp: new Date().toISOString() }));

app.get('/api', (c) =>
  c.json({
    name: 'AniStream Hub API',
    version: c.env.API_VERSION || '1.0.0',
    environment: c.env.NODE_ENV || 'cloudflare-workers',
    endpoints: {
      health: 'GET /health',
      search: 'GET /api/anime/search?q=<query>&page=<n>',
      trending: 'GET /api/anime/trending?page=<n>&limit=<n>',
      latest: 'GET /api/anime/latest?page=<n>&limit=<n>',
      topRated: 'GET /api/anime/top-rated?page=<n>&limit=<n>',
      seasonal: 'GET /api/anime/seasonal?year=<n>&season=<WINTER|SPRING|SUMMER|FALL>&page=<n>',
      browse: 'GET /api/anime/browse?type=<type>&status=<status>&genre=<genre>&sort=<sort>&page=<n>',
      heroSpotlight: 'GET /api/anime/hero-spotlight',
      details: 'GET /api/anime/:id',
      genres: 'GET /api/anime/genres',
      streamProxy: 'GET /api/stream/proxy?url=<m3u8_url>',
      anilistProxy: 'POST /api/anilist/graphql',
      cacheStatus: 'GET /api/admin/cache/status',
      cachePurge: 'DELETE /api/admin/cache/purge?key=<key>  (requires X-API-Key header)',
    },
  })
);

// ---------------------------------------------------------------------------
// Routes: AniList GraphQL pass-through proxy
// ---------------------------------------------------------------------------

app.post('/api/anilist/graphql', async (c) => {
  try {
    const body = await c.req.json();
    const timeout = envNum(c.env.API_CALL_TIMEOUT_MS, 8000);

    const response = await resilientFetch(c.env.ANILIST_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: timeout,
      retries: 2,
      context: 'AniList proxy',
    });

    const data = await response.json();
    return c.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: 'AniList proxy error: ' + msg }, 502);
  }
});

// ---------------------------------------------------------------------------
// Routes: Anime – Search
// ---------------------------------------------------------------------------

app.get('/api/anime/search', async (c) => {
  const q = c.req.query('q');
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20));

  if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400);

  const cache = buildCache(c.env);
  const cacheKey = `search:v2:${encodeURIComponent(q.toLowerCase())}:p${page}:l${limit}`;
  const ttl = envNum(c.env.CACHE_TTL_SEARCH, 300);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query ($search: String, $page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage currentPage lastPage total }
            media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
              id title { romaji english native }
              coverImage { medium large extraLarge }
              description genres meanScore episodes status format season seasonYear
            }
          }
        }
      `;
      const jikanUrl = `${c.env.JIKAN_API_URL}/anime?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`;
      const { data, source } = await queryAniList<any>(c.env, gql, { search: q, page, perPage: limit }, jikanUrl);

      if (source === 'anilist') {
        return {
          results: (data.Page.media as AniListAnime[]).map(transformAniList),
          pageInfo: {
            hasNextPage: data.Page.pageInfo.hasNextPage,
            currentPage: data.Page.pageInfo.currentPage,
            totalPages: data.Page.pageInfo.lastPage || 1,
            totalItems: data.Page.pageInfo.total || 0,
          },
          source: 'anilist',
        };
      }
      return {
        results: ((data as any).data as JikanAnime[]).map(transformJikan),
        pageInfo: {
          hasNextPage: (data as any).pagination?.has_next_page ?? false,
          currentPage: page,
          totalPages: (data as any).pagination?.last_visible_page ?? 1,
        },
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Anime – Trending
// ---------------------------------------------------------------------------

app.get('/api/anime/trending', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20));

  const cache = buildCache(c.env);
  const cacheKey = `trending:v2:p${page}:l${limit}`;
  const ttl = envNum(c.env.CACHE_TTL_TRENDING, 120);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage currentPage }
            media(type: ANIME, sort: TRENDING_DESC) {
              id title { romaji english native }
              coverImage { medium large extraLarge } bannerImage
              description genres meanScore episodes status format season seasonYear
              nextAiringEpisode { airingAt episode }
            }
          }
        }
      `;
      const jikanUrl = `${c.env.JIKAN_API_URL}/top/anime?page=${page}&limit=${limit}&filter=airing`;
      const { data, source } = await queryAniList<any>(c.env, gql, { page, perPage: limit }, jikanUrl);

      if (source === 'anilist') {
        return {
          results: (data.Page.media as AniListAnime[]).map(transformAniList),
          pageInfo: data.Page.pageInfo,
          source: 'anilist',
        };
      }
      return {
        results: ((data as any).data as JikanAnime[]).map(transformJikan),
        pageInfo: { hasNextPage: (data as any).pagination?.has_next_page ?? false, currentPage: page },
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Anime – Latest (by popularity)
// ---------------------------------------------------------------------------

app.get('/api/anime/latest', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20));

  const cache = buildCache(c.env);
  const cacheKey = `latest:v2:p${page}:l${limit}`;
  const ttl = envNum(c.env.CACHE_TTL_TRENDING, 120);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage currentPage }
            media(type: ANIME, sort: POPULARITY_DESC) {
              id title { romaji english native }
              coverImage { medium large extraLarge } bannerImage
              description genres meanScore episodes status format season seasonYear
            }
          }
        }
      `;
      const jikanUrl = `${c.env.JIKAN_API_URL}/top/anime?page=${page}&limit=${limit}&filter=bypopularity`;
      const { data, source } = await queryAniList<any>(c.env, gql, { page, perPage: limit }, jikanUrl);

      if (source === 'anilist') {
        return {
          results: (data.Page.media as AniListAnime[]).map(transformAniList),
          pageInfo: data.Page.pageInfo,
          source: 'anilist',
        };
      }
      return {
        results: ((data as any).data as JikanAnime[]).map(transformJikan),
        pageInfo: { hasNextPage: (data as any).pagination?.has_next_page ?? false, currentPage: page },
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Anime – Top Rated
// ---------------------------------------------------------------------------

app.get('/api/anime/top-rated', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20));

  const cache = buildCache(c.env);
  const cacheKey = `top-rated:v2:p${page}:l${limit}`;
  const ttl = envNum(c.env.CACHE_TTL_TRENDING, 120);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage currentPage }
            media(type: ANIME, sort: SCORE_DESC, averageScore_greater: 60) {
              id title { romaji english native }
              coverImage { medium large extraLarge }
              description genres meanScore episodes status format season seasonYear
            }
          }
        }
      `;
      const jikanUrl = `${c.env.JIKAN_API_URL}/top/anime?page=${page}&limit=${limit}&filter=bypopularity`;
      const { data, source } = await queryAniList<any>(c.env, gql, { page, perPage: limit }, jikanUrl);

      if (source === 'anilist') {
        return {
          results: (data.Page.media as AniListAnime[]).map(transformAniList),
          pageInfo: data.Page.pageInfo,
          source: 'anilist',
        };
      }
      return {
        results: ((data as any).data as JikanAnime[]).map(transformJikan),
        pageInfo: { hasNextPage: (data as any).pagination?.has_next_page ?? false, currentPage: page },
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Anime – Seasonal
// ---------------------------------------------------------------------------

app.get('/api/anime/seasonal', async (c) => {
  const year = Number(c.req.query('year')) || new Date().getFullYear();
  const season = c.req.query('season')?.toUpperCase();
  const page = Math.max(1, Number(c.req.query('page')) || 1);

  const cache = buildCache(c.env);
  const cacheKey = `seasonal:v2:${year}:${season || 'all'}:p${page}`;
  const ttl = envNum(c.env.CACHE_TTL_SEASONAL, 600);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage currentPage lastPage total }
            media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC) {
              id title { romaji english native }
              coverImage { medium large extraLarge }
              description genres meanScore episodes status format season seasonYear
            }
          }
        }
      `;
      const vars: Record<string, unknown> = { year, page, perPage: 25 };
      if (season) vars.season = season;

      const jikanUrl = `${c.env.JIKAN_API_URL}/seasons/${year}/${season?.toLowerCase() || 'now'}?page=${page}`;
      const { data, source } = await queryAniList<any>(c.env, gql, vars, jikanUrl);

      if (source === 'anilist') {
        return {
          results: (data.Page.media as AniListAnime[]).map(transformAniList),
          pageInfo: {
            hasNextPage: data.Page.pageInfo.hasNextPage,
            currentPage: data.Page.pageInfo.currentPage,
            totalPages: data.Page.pageInfo.lastPage || 1,
            totalItems: data.Page.pageInfo.total || 0,
          },
          seasonInfo: { year, season: season || 'current' },
          source: 'anilist',
        };
      }
      return {
        results: ((data as any).data as JikanAnime[]).map(transformJikan),
        pageInfo: { hasNextPage: (data as any).pagination?.has_next_page ?? false, currentPage: page },
        seasonInfo: { year, season: season || 'current' },
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Anime – Airing Schedule
// ---------------------------------------------------------------------------

app.get('/api/anime/schedule', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const start = c.req.query('start_date');
  const end = c.req.query('end_date');

  const cache = buildCache(c.env);
  const cacheKey = `schedule:v2:p${page}:${start || 'current'}:${end || 'current'}`;
  const ttl = envNum(c.env.CACHE_TTL_SEASONAL, 600);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const now = Math.floor(Date.now() / 1000);
      const oneWeek = 7 * 24 * 60 * 60;
      const startTime = start ? Math.floor(new Date(start).getTime() / 1000) : now - 3 * 24 * 60 * 60;
      const endTime = end ? Math.floor(new Date(end).getTime() / 1000) : startTime + oneWeek;

      const gql = `
        query ($page: Int, $perPage: Int, $start: Int, $end: Int) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage currentPage lastPage total }
            airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME_DESC) {
              id airingAt episode
              media {
                id title { romaji english native }
                coverImage { medium large extraLarge }
                description genres meanScore episodes status format season seasonYear
              }
            }
          }
        }
      `;
      const jikanUrl = `${c.env.JIKAN_API_URL}/schedules?page=${page}`;
      const { data, source } = await queryAniList<any>(c.env, gql, { page, perPage: 25, start: startTime, end: endTime }, jikanUrl);

      if (source === 'anilist') {
        const schedule = (data.Page.airingSchedules || []).map((item: any) => ({
          id: String(item.id),
          airingAt: item.airingAt,
          episode: item.episode,
          media: transformAniList(item.media),
        }));
        return {
          schedule,
          pageInfo: {
            hasNextPage: data.Page.pageInfo.hasNextPage,
            currentPage: data.Page.pageInfo.currentPage,
            totalPages: data.Page.pageInfo.lastPage || 1,
            totalItems: data.Page.pageInfo.total || 0,
          },
          source: 'anilist',
        };
      }
      return {
        schedule: ((data as any).data || []).map((item: any) => ({
          id: String(item.mal_id),
          airingAt: Math.floor(Date.now() / 1000),
          episode: 1,
          media: transformJikan(item),
        })),
        pageInfo: { hasNextPage: false, currentPage: page },
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Anime – Leaderboard
// ---------------------------------------------------------------------------

app.get('/api/anime/leaderboard', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const type = c.req.query('type') || 'trending';

  const cache = buildCache(c.env);
  const cacheKey = `leaderboard:v2:p${page}:${type}`;
  const ttl = envNum(c.env.CACHE_TTL_TRENDING, 120);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const isTop = type === 'top-rated';
      const sort = isTop ? 'SCORE_DESC' : 'TRENDING_DESC';
      const gql = `
        query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage currentPage lastPage total }
            media(type: ANIME, sort: $sort) {
              id title { romaji english native }
              coverImage { medium large extraLarge }
              description genres meanScore episodes status format season seasonYear
            }
          }
        }
      `;
      const jikanUrl = `${c.env.JIKAN_API_URL}/top/anime?page=${page}&filter=${isTop ? 'favorite' : 'airing'}`;
      const { data, source } = await queryAniList<any>(c.env, gql, { page, perPage: 10, sort: [sort] }, jikanUrl);

      if (source === 'anilist') {
        return {
          results: (data.Page.media as AniListAnime[]).map(transformAniList),
          pageInfo: {
            hasNextPage: data.Page.pageInfo.hasNextPage,
            currentPage: data.Page.pageInfo.currentPage,
            totalPages: data.Page.pageInfo.lastPage || 1,
            totalItems: data.Page.pageInfo.total || 0,
          },
          source: 'anilist',
        };
      }
      return {
        results: ((data as any).data as JikanAnime[]).map(transformJikan),
        pageInfo: { hasNextPage: false, currentPage: page },
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Helpers: Episodes List Fetching Logic
// ---------------------------------------------------------------------------

async function fetchEpisodesHelper(idParam: string, env: Env, cache: KVCache) {
  const cacheKey = `episodes:v2:${idParam}`;
  const ttl = envNum(env.CACHE_TTL_ANIME_DETAIL, 3600);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      // 1. Try HiAnime REST Vercel proxy first if configured
      if (env.HIANIME_REST_URL) {
        try {
          const base = env.HIANIME_REST_URL.replace(/\/$/, '');
          const epResponse = await resilientFetch(`${base}/api/v2/hianime/anime/${encodeURIComponent(idParam)}/episodes`, {
            headers: { Accept: 'application/json' },
            timeoutMs: 8000,
            retries: 1,
          });
          if (epResponse.ok) {
            const body = await epResponse.json() as any;
            if (body.data?.episodes?.length) {
              const mapped = body.data.episodes.map((ep: any) => ({
                id: String(ep.episodeId || ep.id || ''),
                number: ep.number,
                title: ep.title || `Episode ${ep.number}`,
                isFiller: ep.isFiller || false,
                hasSub: true,
                hasDub: true,
              }));
              return { episodes: mapped, source: 'hianime-rest' };
            }
          }
        } catch (e) {
          console.warn('[Episodes] HiAnime REST failed:', e);
        }
      }

      // 2. Fallback to Jikan v4 episodes endpoint
      const numericId = parseInt(idParam, 10);
      if (numericId && !isNaN(numericId)) {
        try {
          const jikanUrl = `${env.JIKAN_API_URL}/anime/${numericId}/episodes`;
          const response = await resilientFetch(jikanUrl, {
            headers: { Accept: 'application/json' },
            timeoutMs: 8000,
            retries: 2,
          });
          if (response.ok) {
            const body = await response.json() as any;
            const mapped = (body.data || []).map((ep: any) => ({
              id: `${numericId}?ep=${ep.mal_id}`,
              number: ep.mal_id,
              title: ep.title || `Episode ${ep.mal_id}`,
              isFiller: ep.filler || false,
              hasSub: true,
              hasDub: false,
            }));
            return { episodes: mapped, source: 'jikan' };
          }
        } catch (e) {
          console.warn('[Episodes] Jikan fallback failed:', e);
        }
      }

      return { episodes: [], source: 'none' };
    },
    ttl
  );

  return { result, cacheHit, ttl };
}

// ---------------------------------------------------------------------------
// Routes: Anime – Resolve AniList ID to playable Streaming ID
// ---------------------------------------------------------------------------

app.get('/api/anime/resolve', async (c) => {
  const idQuery = c.req.query('id') || '';
  const m = /^anilist-(\d+)$/i.exec(idQuery.trim());
  if (!m) {
    return c.json({ error: 'Query parameter "id" must be an AniList ID (anilist-12345)' }, 400);
  }
  
  const numericId = parseInt(m[1], 10);
  if (!numericId || isNaN(numericId)) {
    return c.json({ error: 'Invalid AniList ID' }, 400);
  }

  const cache = buildCache(c.env);
  const cacheKey = `resolve:v2:${numericId}`;
  
  const { data: result } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            title { romaji english native }
          }
        }
      `;
      try {
        const anilistHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };
        if (c.env.ANILIST_CLIENT_SECRET) {
          anilistHeaders['Authorization'] = `Bearer ${c.env.ANILIST_CLIENT_SECRET}`;
        }
        const aniRes = await fetchJson<{ data: any; errors?: any }>(
          c.env.ANILIST_API_URL,
          { query: gql, variables: { id: numericId } },
          { headers: anilistHeaders, timeoutMs: 6000, retries: 2 }
        );
        
        const media = aniRes.data?.Media;
        if (!media) return { id: idQuery, streamingId: null };

        const titles = [
          media.title?.english,
          media.title?.romaji,
          media.title?.native
        ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

        if (titles.length === 0) return { id: idQuery, streamingId: null };

        if (c.env.HIANIME_REST_URL) {
          const base = c.env.HIANIME_REST_URL.replace(/\/$/, '');
          const searchTitle = titles[0];
          const qs = new URLSearchParams({ q: searchTitle, page: '1' });
          const searchResponse = await resilientFetch(`${base}/api/v2/hianime/search?${qs.toString()}`, {
            headers: { Accept: 'application/json' },
            timeoutMs: 8000,
            retries: 2,
          });

          if (searchResponse.ok) {
            const searchBody = await searchResponse.json() as any;
            const animes = searchBody.data?.animes || searchBody.data?.results || [];
            
            if (animes.length > 0) {
              let matchedAnime = animes[0];
              const normalizedSearchTitle = searchTitle.toLowerCase().trim();
              for (const anime of animes) {
                if (anime.title?.toLowerCase().trim() === normalizedSearchTitle) {
                  matchedAnime = anime;
                  break;
                }
              }
              return { id: idQuery, streamingId: String(matchedAnime.id) };
            }
          }
        }
      } catch (err) {
        console.error('[Resolve] Failed to resolve:', err);
      }
      
      return { id: idQuery, streamingId: null };
    },
    86400 // Cache resolved mappings for 24 hours
  );

  if (!result.streamingId) {
    return c.json({ error: 'No streaming match found', id: idQuery }, 404);
  }
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Anime – Episodes List (Query-based & Dynamic Route)
// ---------------------------------------------------------------------------

app.get('/api/anime/episodes', async (c) => {
  const idQuery = c.req.query('id') || '';
  if (!idQuery) {
    return c.json({ error: 'Query parameter "id" is required' }, 400);
  }
  
  const cache = buildCache(c.env);
  const { result, cacheHit, ttl } = await fetchEpisodesHelper(idQuery, c.env, cache);
  
  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

app.get('/api/anime/:id/episodes', async (c) => {
  const idParam = c.req.param('id');
  const cache = buildCache(c.env);
  const { result, cacheHit, ttl } = await fetchEpisodesHelper(idParam, c.env, cache);
  
  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Streaming – Episode Servers
// ---------------------------------------------------------------------------

app.get('/api/stream/servers/:episodeId', async (c) => {
  const episodeId = decodeURIComponent(c.req.param('episodeId'));
  
  if (c.env.HIANIME_REST_URL) {
    try {
      const base = c.env.HIANIME_REST_URL.replace(/\/$/, '');
      const url = `${base}/api/v2/hianime/episode/servers?animeEpisodeId=${encodeURIComponent(episodeId)}`;
      const response = await resilientFetch(url, {
        headers: { Accept: 'application/json' },
        timeoutMs: 10000,
        retries: 2,
      });
      if (response.ok) {
        const body = await response.json() as any;
        const sub = (body.data?.sub || []).map((s: any) => ({ name: s.serverName || 'hd-1', type: 'sub' }));
        const dub = (body.data?.dub || []).map((s: any) => ({ name: s.serverName || 'hd-1', type: 'dub' }));
        return c.json({ servers: [...sub, ...dub], source: 'hianime-rest' });
      }
    } catch (e: any) {
      console.error('[Servers] Proxy failed:', e.message);
    }
  }

  return c.json({
    servers: [
      { name: 'hd-1', type: 'sub' },
      { name: 'hd-2', type: 'sub' },
      { name: 'hd-1', type: 'dub' },
    ],
    source: 'fallback-default',
  });
});

// ---------------------------------------------------------------------------
// Routes: Streaming – Watch links
// ---------------------------------------------------------------------------

app.get('/api/stream/watch/:episodeId', async (c) => {
  const episodeId = decodeURIComponent(c.req.param('episodeId'));
  const server = c.req.query('server') || 'hd-1';
  const category = c.req.query('category') || 'sub';
  const useProxy = c.req.query('proxy') !== 'false';
  
  if (c.env.HIANIME_REST_URL) {
    try {
      const base = c.env.HIANIME_REST_URL.replace(/\/$/, '');
      const qs = new URLSearchParams({
        animeEpisodeId: episodeId,
        server,
        category,
      });
      const url = `${base}/api/v2/hianime/episode/sources?${qs.toString()}`;
      const response = await resilientFetch(url, {
        headers: { Accept: 'application/json' },
        timeoutMs: 12000,
        retries: 2,
      });
      if (response.ok) {
        const body = await response.json() as any;
        if (body.data?.sources?.length) {
          const workerOrigin = new URL(c.req.url).origin;
          const proxyBase = `${workerOrigin}/api/stream/proxy`;
          
          let sources = body.data.sources.map((s: any) => ({
            url: s.url,
            quality: s.quality || 'auto',
            isM3U8: s.isM3U8 || s.url.includes('.m3u8'),
          }));

          if (useProxy) {
            sources = sources.map((s: any) => ({
              ...s,
              url: `${proxyBase}?url=${encodeURIComponent(s.url)}`,
              originalUrl: s.url,
            }));
          }

          const subtitles = (body.data.subtitles || []).map((t: any) => ({
            url: useProxy ? `${proxyBase}?url=${encodeURIComponent(t.url)}` : t.url,
            lang: t.lang || 'English',
          }));

          return c.json({
            sources,
            subtitles,
            server,
            source: 'hianime-rest',
          });
        }
      }
    } catch (e: any) {
      console.error('[Watch] Proxy failed:', e.message);
    }
  }

  return c.json({ error: 'Streaming sources not available', sources: [], subtitles: [] }, 502);
});

// ---------------------------------------------------------------------------
// Routes: Anime – Browse / Filter
// ---------------------------------------------------------------------------

app.get('/api/anime/browse', async (c) => {
  const q = c.req.query();
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(50, Number(q.limit) || 20);
  const type = q.type?.toUpperCase();
  const status = q.status?.toUpperCase();
  const genre = q.genre;
  const sort = q.sort || 'POPULARITY_DESC';

  const cache = buildCache(c.env);
  const cacheKey = `browse:v2:${type || 'all'}:${status || 'all'}:${genre || 'all'}:${sort}:p${page}`;
  const ttl = envNum(c.env.CACHE_TTL_TRENDING, 120);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query ($page: Int, $perPage: Int, $type: MediaType, $status: MediaStatus, $genre: String, $sort: [MediaSort]) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage currentPage }
            media(type: $type, status: $status, genre: $genre, sort: $sort) {
              id title { romaji english native }
              coverImage { medium large extraLarge }
              description genres meanScore episodes status format season seasonYear
            }
          }
        }
      `;
      const vars: Record<string, unknown> = { page, perPage: limit, sort: [sort] };
      if (type) vars.type = type;
      if (status) vars.status = status;
      if (genre) vars.genre = genre;

      let jikanUrl = `${c.env.JIKAN_API_URL}/anime?page=${page}&limit=${limit}`;
      if (type) jikanUrl += `&type=${type.toLowerCase()}`;
      if (status) jikanUrl += `&status=${status.toLowerCase()}`;
      if (genre) jikanUrl += `&genres=${genre}`;

      const { data, source } = await queryAniList<any>(c.env, gql, vars, jikanUrl);

      if (source === 'anilist') {
        return {
          results: (data.Page.media as AniListAnime[]).map(transformAniList),
          pageInfo: data.Page.pageInfo,
          source: 'anilist',
        };
      }
      return {
        results: ((data as any).data as JikanAnime[]).map(transformJikan),
        pageInfo: { hasNextPage: (data as any).pagination?.has_next_page ?? false, currentPage: page },
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// Alias
app.get('/api/anime/filter', (c) => {
  // Rewrite query params to unified /browse handler
  return app.fetch(
    new Request(c.req.url.replace('/api/anime/filter', '/api/anime/browse'), c.req.raw),
    c.env,
    {} as any
  );
});

// ---------------------------------------------------------------------------
// Routes: Anime – Hero Spotlight
// ---------------------------------------------------------------------------

app.get('/api/anime/hero-spotlight', async (c) => {
  const cache = buildCache(c.env);
  const cacheKey = 'hero-spotlight:v2';
  const ttl = envNum(c.env.CACHE_TTL_TRENDING, 120);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query {
          Page(page: 1, perPage: 10) {
            media(type: ANIME, sort: POPULARITY_DESC, averageScore_greater: 75, status: RELEASING) {
              id title { romaji english native }
              coverImage { large extraLarge }
              bannerImage description genres meanScore episodes status format season seasonYear
              nextAiringEpisode { airingAt episode }
            }
          }
        }
      `;
      const jikanUrl = `${c.env.JIKAN_API_URL}/top/anime?page=1&limit=10&filter=airing`;
      const { data, source } = await queryAniList<any>(c.env, gql, {}, jikanUrl);

      if (source === 'anilist') {
        return { results: (data.Page.media as AniListAnime[]).map(transformAniList), source: 'anilist' };
      }
      return {
        results: ((data as any).data as JikanAnime[]).map(transformJikan),
        source: 'jikan',
      };
    },
    ttl
  );

  c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
  c.header('Cache-Control', `public, max-age=${ttl}`);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Routes: Static metadata (genres, types, statuses, seasons, years)
// IMPORTANT: These named routes MUST be registered BEFORE the /api/anime/:id
// wildcard, otherwise Hono matches "genres" etc. as the :id parameter.
// ---------------------------------------------------------------------------

app.get('/api/anime/genres', (c) =>
  c.json({
    genres: [
      'Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance',
      'Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Mecha','Music',
      'Psychological','Historical','Parody','Isekai','School','Demons','Magic',
      'Vampire','Space','Martial Arts','Gore','Survival','Cyberpunk','Super Power',
      'Mythology','Harem','Ecchi','Yaoi','Yuri','Shounen','Shoujo','Seinen','Josei',
    ].sort(),
  })
);

app.get('/api/anime/types', (c) =>
  c.json({
    types: [
      { value: 'TV', label: 'TV Series' },
      { value: 'MOVIE', label: 'Movie' },
      { value: 'OVA', label: 'OVA' },
      { value: 'ONA', label: 'ONA' },
      { value: 'SPECIAL', label: 'Special' },
    ],
  })
);

app.get('/api/anime/statuses', (c) =>
  c.json({
    statuses: [
      { value: 'RELEASING', label: 'Ongoing' },
      { value: 'FINISHED', label: 'Completed' },
      { value: 'NOT_YET_RELEASED', label: 'Upcoming' },
    ],
  })
);

app.get('/api/anime/seasons', (c) =>
  c.json({
    seasons: [
      { value: 'WINTER', label: 'Winter', months: 'Jan–Mar' },
      { value: 'SPRING', label: 'Spring', months: 'Apr–Jun' },
      { value: 'SUMMER', label: 'Summer', months: 'Jul–Sep' },
      { value: 'FALL', label: 'Fall', months: 'Oct–Dec' },
    ],
  })
);

app.get('/api/anime/years', (c) => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= 1970; y--) {
    years.push({ value: y, label: String(y) });
  }
  return c.json({ years });
});

// ---------------------------------------------------------------------------
// Helpers: Anime Detail Fetching Logic
// ---------------------------------------------------------------------------

async function fetchAnimeDetailHelper(idParam: string, env: Env, cache: KVCache) {
  let cleanId = idParam;
  if (cleanId.startsWith('anilist-')) {
    cleanId = cleanId.replace('anilist-', '');
  }
  const numericId = parseInt(cleanId, 10);
  if (!numericId || isNaN(numericId)) {
    throw new Error('Invalid anime ID — must be a numeric AniList ID or anilist-<id>');
  }

  const cacheKey = `anime-detail:v2:${numericId}`;
  const ttl = envNum(env.CACHE_TTL_ANIME_DETAIL, 3600);

  const { data: result, cacheHit } = await cache.getOrSet(
    cacheKey,
    async () => {
      const gql = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id title { romaji english native }
            coverImage { medium large extraLarge }
            bannerImage description genres meanScore episodes status format season seasonYear
            studios { nodes { name isAnimationStudio } }
            nextAiringEpisode { airingAt episode }
            characters(sort: ROLE, perPage: 6) {
              nodes { name { full } image { medium } }
            }
          }
        }
      `;
      const jikanUrl = `${env.JIKAN_API_URL}/anime/${numericId}/full`;
      const { data, source } = await queryAniList<any>(env, gql, { id: numericId }, jikanUrl);

      if (source === 'anilist') {
        const m = data.Media as AniListAnime & { studios?: any; characters?: any };
        return {
          ...transformAniList(m),
          studios: m.studios?.nodes?.filter((s: any) => s.isAnimationStudio).map((s: any) => s.name) || [],
          characters: m.characters?.nodes?.map((ch: any) => ({
            name: ch.name?.full,
            image: ch.image?.medium,
          })) || [],
        };
      }
      // Jikan full detail
      const raw = (data as any).data;
      return {
        ...transformJikan(raw),
        studios: raw.studios?.map((s: any) => s.name) || [],
        characters: [],
      };
    },
    ttl
  );

  return { result, cacheHit, ttl };
}

// ---------------------------------------------------------------------------
// Routes: Anime – Detail by ID (Query-based & Dynamic Route)
// MUST come AFTER all named /api/anime/* routes above
// ---------------------------------------------------------------------------

app.get('/api/anime', async (c) => {
  const idQuery = c.req.query('id') || '';
  if (!idQuery) {
    return c.json({ error: 'Query parameter "id" is required' }, 400);
  }

  const cache = buildCache(c.env);
  try {
    const { result, cacheHit, ttl } = await fetchAnimeDetailHelper(idQuery, c.env, cache);
    c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
    c.header('Cache-Control', `public, max-age=${ttl}`);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get('/api/anime/:id', async (c) => {
  const idParam = c.req.param('id');
  const cache = buildCache(c.env);
  try {
    const { result, cacheHit, ttl } = await fetchAnimeDetailHelper(idParam, c.env, cache);
    c.header('X-Cache', cacheHit ? 'HIT' : 'MISS');
    c.header('Cache-Control', `public, max-age=${ttl}`);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// ---------------------------------------------------------------------------
// Routes: Streaming – M3U8 Proxy
// ---------------------------------------------------------------------------

app.get('/api/stream/proxy', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'URL parameter is required' }, 400);

  const workerOrigin = new URL(c.req.url).origin;
  const proxyBase = `${workerOrigin}/api/stream/proxy`;

  try {
    const timeout = envNum(c.env.GLOBAL_TIMEOUT_MS, 15000);
    const upstreamHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: new URL(url).origin,
    };
    // Forward Range header so the browser can seek in MP4 videos
    const rangeHeader = c.req.header('range') || c.req.header('Range');
    if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

    const response = await resilientFetch(url, {
      headers: upstreamHeaders,
      timeoutMs: timeout,
      retries: 2,
      context: 'stream proxy',
    });

    if (!response.ok && response.status !== 206) {
      return c.json({ error: 'Upstream error', status: response.status }, response.status as any);
    }

    const contentType = response.headers.get('content-type') || '';
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    // For range responses (206) use short cache; for full responses cache longer
    newHeaders.set('Cache-Control', response.status === 206 ? 'no-store' : 'public, max-age=30');
    // Ensure Accept-Ranges is advertised so browser knows it can seek
    if (!newHeaders.has('accept-ranges')) {
      const ct = contentType.toLowerCase();
      if (ct.includes('video') || ct.includes('octet-stream') || url.includes('.mp4') || url.includes('.ts')) {
        newHeaders.set('Accept-Ranges', 'bytes');
      }
    }

    // Rewrite .m3u8 segment URLs so they also route through this proxy
    if (contentType.includes('mpegurl') || url.includes('.m3u8')) {
      const text = await response.text();
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const rewritten = text.replace(/^(?!#)(.+)$/gm, (line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        const absolute = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return `${proxyBase}?url=${encodeURIComponent(absolute)}`;
      });
      return new Response(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=30',
        },
      });
    }

    // Stream binary content without buffering into Worker RAM
    return new Response(response.body, { status: response.status, headers: newHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: 'Proxy failed', message: msg }, 502);
  }
});

app.options('/api/stream/proxy', (c) =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Origin, Accept',
      'Access-Control-Max-Age': '86400',
    },
  })
);

// ---------------------------------------------------------------------------
// Routes: Sources Health (static; dynamic health requires SourceManager)
// ---------------------------------------------------------------------------

app.get('/api/sources', (c) =>
  c.json({
    sources: ['AniList', 'Jikan'],
    note: 'This lightweight Worker uses AniList (primary) + Jikan (fallback). For full source support deploy with worker.ts.',
  })
);

app.get('/api/sources/health', (c) =>
  c.json({
    sources: [
      { name: 'AniList', status: 'online', role: 'primary' },
      { name: 'Jikan', status: 'online', role: 'fallback' },
    ],
  })
);

// ---------------------------------------------------------------------------
// Routes: Admin – Cache Management
// ---------------------------------------------------------------------------

app.get('/api/admin/cache/status', (c) => {
  const cache = buildCache(c.env);
  return c.json({
    enabled: c.env.ENABLE_KV_CACHING === 'true',
    backend: cache.isKVBacked ? 'cloudflare-kv' : 'in-memory',
    kvBinding: c.env.CACHE_STORE !== undefined ? 'bound' : 'not-bound',
  });
});

app.delete('/api/admin/cache/purge', async (c) => {
  // Guard with INTERNAL_API_KEY secret
  const providedKey = c.req.header('X-API-Key') || c.req.query('key');
  const secretKey = c.env.INTERNAL_API_KEY;

  if (secretKey && providedKey !== secretKey) {
    return c.json({ error: 'Unauthorized — provide a valid X-API-Key header' }, 401);
  }

  const cacheKey = c.req.query('cache_key');
  if (!cacheKey) {
    return c.json({ error: 'Query param "cache_key" is required' }, 400);
  }

  const cache = buildCache(c.env);
  const deleted = await cache.delete(cacheKey);
  return c.json({ deleted, key: cacheKey });
});

// ---------------------------------------------------------------------------
// Catch-all 404
// ---------------------------------------------------------------------------

app.all('*', (c) =>
  c.json(
    {
      error: 'Not found',
      path: c.req.path,
      method: c.req.method,
      hint: 'Use GET /api for a full list of available endpoints.',
    },
    404
  )
);

// ---------------------------------------------------------------------------
// Worker Export (Cloudflare Workers handler)
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
