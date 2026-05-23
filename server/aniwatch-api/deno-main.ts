/**
 * Deno Deploy entry point for aniwatch-api
 * This replaces server.ts for Deno Deploy deployments.
 * Uses npm: specifiers for npm packages compatible with Deno.
 */

import { Hono } from "npm:hono@^4.7.10";
import { cors } from "npm:hono/cors";
import { HiAnime } from "npm:aniwatch@^2.27.9";

// ─── Types ──────────────────────────────────────────────────────────────────
type CacheConfig = { key: string; duration: number };
type ServerContext = {
  Variables: {
    CACHE_CONFIG: CacheConfig;
  };
};

// ─── Simple in-memory cache (no Redis on Deno Deploy free tier) ─────────────
const memCache = new Map<string, { data: unknown; expiresAt: number }>();

async function cacheGetOrSet<T>(
  dataGetter: () => Promise<T>,
  key: string,
  expirySeconds = 300
): Promise<T> {
  const now = Date.now();
  const cached = memCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }
  const data = await dataGetter();
  memCache.set(key, { data, expiresAt: now + expirySeconds * 1000 });
  return data;
}

// ─── Cache middleware ─────────────────────────────────────────────────────────
const BASE_PATH = "/api/v2" as const;

function cacheConfigSetter(basePathLen: number) {
  return async (c: any, next: () => Promise<void>) => {
    const pathname = new URL(c.req.url).pathname;
    const cacheKey = pathname.slice(basePathLen);
    const query = c.req.query ? JSON.stringify(c.req.query()) : "";
    c.set("CACHE_CONFIG", {
      key: `${cacheKey}${query}`,
      duration: 300,
    });
    await next();
  };
}

// ─── App setup ───────────────────────────────────────────────────────────────
const app = new Hono<ServerContext>();

// CORS — allow all origins (or set ANIWATCH_API_CORS_ALLOWED_ORIGINS in Deno Deploy env)
const allowedOrigins = Deno.env.get("ANIWATCH_API_CORS_ALLOWED_ORIGINS")
  ? Deno.env.get("ANIWATCH_API_CORS_ALLOWED_ORIGINS")!.split(",")
  : ["*"];

app.use(
  cors({
    allowMethods: ["GET", "OPTIONS"],
    maxAge: 600,
    credentials: true,
    origin: allowedOrigins,
  })
);

// Health check
app.get("/health", (c) => c.text("daijoubu", { status: 200 }));

// Version
app.get("/v", (c) =>
  c.text("aniwatch-api: deno-deploy\naniwatch-package: ^2.27.9")
);

// Cache config middleware for /api/v2/**
app.use(`${BASE_PATH}/*`, cacheConfigSetter(BASE_PATH.length));

// ─── HiAnime scraper routes ───────────────────────────────────────────────────
const hianime = new HiAnime.Scraper();
const hianimeRouter = new Hono<ServerContext>();

hianimeRouter.get("/", (c) => c.redirect("/", 301));

hianimeRouter.get("/home", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const data = await cacheGetOrSet(() => hianime.getHomePage(), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/azlist/:sortOption", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const sortOption = decodeURIComponent(c.req.param("sortOption").trim()) as HiAnime.AZListSortOptions;
  const page = Number(c.req.query("page") || "1") || 1;
  const data = await cacheGetOrSet(() => hianime.getAZList(sortOption, page), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/qtip/:animeId", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const animeId = decodeURIComponent(c.req.param("animeId").trim());
  const data = await cacheGetOrSet(() => hianime.getQtipInfo(animeId), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/category/:name", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const categoryName = decodeURIComponent(c.req.param("name").trim()) as HiAnime.AnimeCategories;
  const page = Number(c.req.query("page") || "1") || 1;
  const data = await cacheGetOrSet(() => hianime.getCategoryAnime(categoryName, page), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/genre/:name", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const genreName = decodeURIComponent(c.req.param("name").trim());
  const page = Number(c.req.query("page") || "1") || 1;
  const data = await cacheGetOrSet(() => hianime.getGenreAnime(genreName, page), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/producer/:name", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const producerName = decodeURIComponent(c.req.param("name").trim());
  const page = Number(c.req.query("page") || "1") || 1;
  const data = await cacheGetOrSet(() => hianime.getProducerAnimes(producerName, page), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/schedule", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const date = decodeURIComponent(c.req.query("date") || "");
  let tzOffset = Number(c.req.query("tzOffset") || "-330");
  tzOffset = isNaN(tzOffset) ? -330 : tzOffset;
  const data = await cacheGetOrSet(
    () => hianime.getEstimatedSchedule(date, tzOffset),
    `${cc.key}_${tzOffset}`,
    cc.duration
  );
  return c.json({ status: 200, data });
});

hianimeRouter.get("/search", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const { q: rawQ, page: rawPage, ...filters } = c.req.query();
  const query = decodeURIComponent(rawQ || "");
  const pageNo = Number(rawPage || "1") || 1;
  const data = await cacheGetOrSet(() => hianime.search(query, pageNo, filters), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/search/suggestion", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const query = decodeURIComponent(c.req.query("q") || "");
  const data = await cacheGetOrSet(() => hianime.searchSuggestions(query), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/anime/:animeId", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const animeId = decodeURIComponent(c.req.param("animeId").trim());
  const data = await cacheGetOrSet(() => hianime.getInfo(animeId), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/episode/servers", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const animeEpisodeId = decodeURIComponent(c.req.query("animeEpisodeId") || "");
  const data = await cacheGetOrSet(() => hianime.getEpisodeServers(animeEpisodeId), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/episode/sources", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const animeEpisodeId = decodeURIComponent(c.req.query("animeEpisodeId") || "");
  const server = decodeURIComponent(c.req.query("server") || HiAnime.Servers.VidStreaming) as HiAnime.AnimeServers;
  const category = decodeURIComponent(c.req.query("category") || "sub") as "sub" | "dub" | "raw";
  const data = await cacheGetOrSet(
    () => hianime.getEpisodeSources(animeEpisodeId, server, category),
    cc.key,
    cc.duration
  );
  return c.json({ status: 200, data });
});

hianimeRouter.get("/anime/:animeId/episodes", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const animeId = decodeURIComponent(c.req.param("animeId").trim());
  const data = await cacheGetOrSet(() => hianime.getEpisodes(animeId), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

hianimeRouter.get("/anime/:animeId/next-episode-schedule", async (c) => {
  const cc = c.get("CACHE_CONFIG");
  const animeId = decodeURIComponent(c.req.param("animeId").trim());
  const data = await cacheGetOrSet(() => hianime.getNextEpisodeSchedule(animeId), cc.key, cc.duration);
  return c.json({ status: 200, data });
});

// Mount router
app.basePath(BASE_PATH).route("/hianime", hianimeRouter);

// 404 fallback
app.notFound((c) =>
  c.json({ status: 404, error: "Not found" }, { status: 404 })
);

// Error handler
app.onError((err, c) => {
  console.error("[aniwatch-api error]", err);
  return c.json(
    { status: 500, error: "Internal server error", message: err.message },
    { status: 500 }
  );
});

// ─── Start server ─────────────────────────────────────────────────────────────
const port = Number(Deno.env.get("PORT") || "4000");
console.log(`aniwatch-api (Deno) running on port ${port}`);

Deno.serve({ port }, app.fetch);
