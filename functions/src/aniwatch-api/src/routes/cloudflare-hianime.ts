import { Hono } from "hono";
import { HiAnime } from "aniwatch";
import { cache } from "../cache-shim.js";
import type { ServerContext } from "../config/context.js";

const hianime = new HiAnime.Scraper();
const hianimeRouter = new Hono<ServerContext>();

// /api/
hianimeRouter.get("/", (c) => c.redirect("/", 301));

// /api/home
hianimeRouter.get("/home", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");

    const data = await cache.getOrSet<HiAnime.ScrapedHomePage>(
        hianime.getHomePage,
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/search?q={query}
hianimeRouter.get("/search", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const { q: query, page, ...filters } = c.req.query();

    const decodedQuery = decodeURIComponent(query || "");
    const pageNo = Number(decodeURIComponent(page || "")) || 1;

    const data = await cache.getOrSet<HiAnime.ScrapedAnimeSearchResult>(
        async () => hianime.search(decodedQuery, pageNo, filters),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/azlist/{sortOption}?page={page}
hianimeRouter.get("/azlist/:sortOption", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");

    const sortOption = decodeURIComponent(
        c.req.param("sortOption").trim().toLowerCase()
    ) as HiAnime.AZListSortOptions;
    const page: number =
        Number(decodeURIComponent(c.req.query("page") || "")) || 1;

    const data = await cache.getOrSet<HiAnime.ScrapedAnimeAZList>(
        async () => hianime.getAZList(sortOption, page),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/qtip/{animeId}
hianimeRouter.get("/qtip/:animeId", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeId = decodeURIComponent(c.req.param("animeId").trim());

    const data = await cache.getOrSet<HiAnime.ScrapedAnimeQtipInfo>(
        async () => hianime.getQtipInfo(animeId),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/category/{name}?page={page}
hianimeRouter.get("/category/:name", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const categoryName = decodeURIComponent(
        c.req.param("name").trim()
    ) as HiAnime.AnimeCategories;
    const page: number =
        Number(decodeURIComponent(c.req.query("page") || "")) || 1;

    const data = await cache.getOrSet<HiAnime.ScrapedAnimeCategory>(
        async () => hianime.getCategoryAnime(categoryName, page),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/genre/{name}?page={page}
hianimeRouter.get("/genre/:name", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const genreName = decodeURIComponent(c.req.param("name").trim());
    const page: number =
        Number(decodeURIComponent(c.req.query("page") || "")) || 1;

    const data = await cache.getOrSet<HiAnime.ScrapedGenreAnime>(
        async () => hianime.getGenreAnime(genreName, page),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/producer/{name}?page={page}
hianimeRouter.get("/producer/:name", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const producerName = decodeURIComponent(c.req.param("name").trim());
    const page: number =
        Number(decodeURIComponent(c.req.query("page") || "")) || 1;

    const data = await cache.getOrSet<HiAnime.ScrapedProducerAnime>(
        async () => hianime.getProducerAnimes(producerName, page),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/schedule?date={date}&tzOffset={tzOffset}
hianimeRouter.get("/schedule", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");

    const date = decodeURIComponent(c.req.query("date") || "");
    let tzOffset = Number(
        decodeURIComponent(c.req.query("tzOffset") || "-330")
    );
    tzOffset = isNaN(tzOffset) ? -330 : tzOffset;

    const data = await cache.getOrSet<HiAnime.ScrapedEstimatedSchedule>(
        async () => hianime.getEstimatedSchedule(date, tzOffset),
        `${cacheConfig.key}_${tzOffset}`,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/search/suggestion?q={query}
hianimeRouter.get("/search/suggestion", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const query = decodeURIComponent(c.req.query("q") || "");

    const data = await cache.getOrSet<HiAnime.ScrapedAnimeSearchSuggestion>(
        async () => hianime.searchSuggestions(query),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/anime/{animeId}
hianimeRouter.get("/anime/:animeId", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeId = decodeURIComponent(c.req.param("animeId").trim());

    const data = await cache.getOrSet<HiAnime.ScrapedAnimeAboutInfo>(
        async () => hianime.getInfo(animeId),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/episode/servers?animeEpisodeId={id}
hianimeRouter.get("/episode/servers", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeEpisodeId = decodeURIComponent(
        c.req.query("animeEpisodeId") || ""
    );

    const data = await cache.getOrSet<HiAnime.ScrapedEpisodeServers>(
        async () => hianime.getEpisodeServers(animeEpisodeId),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/episode/sources?animeEpisodeId={episodeId}&server={server}&category={category}
hianimeRouter.get("/episode/sources", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeEpisodeId = decodeURIComponent(
        c.req.query("animeEpisodeId") || ""
    );
    const server = decodeURIComponent(
        c.req.query("server") || HiAnime.Servers.VidStreaming
    ) as HiAnime.AnimeServers;
    const category = decodeURIComponent(c.req.query("category") || "sub") as
        | "sub"
        | "dub"
        | "raw";

    const data = await cache.getOrSet<HiAnime.ScrapedAnimeEpisodesSources>(
        async () => hianime.getEpisodeSources(animeEpisodeId, server, category),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/anime/{anime-id}/episodes
hianimeRouter.get("/anime/:animeId/episodes", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeId = decodeURIComponent(c.req.param("animeId").trim());

    const data = await cache.getOrSet<HiAnime.ScrapedAnimeEpisodes>(
        async () => hianime.getEpisodes(animeId),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

// /api/anime/{anime-id}/next-episode-schedule
hianimeRouter.get("/anime/:animeId/next-episode-schedule", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeId = decodeURIComponent(c.req.param("animeId").trim());

    const data = await cache.getOrSet<HiAnime.ScrapedNextEpisodeSchedule>(
        async () => hianime.getNextEpisodeSchedule(animeId),
        cacheConfig.key,
        cacheConfig.duration
    );

    return c.json({ status: 200, data }, { status: 200 });
});

export { hianimeRouter };
