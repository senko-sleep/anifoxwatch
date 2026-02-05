import { Hono } from "hono";
import { HiAnime } from "aniwatch";
import { corsConfig } from "./config/cors.js";
import { cacheControl, cacheConfigSetter } from "./middleware/cache.js";
import { errorHandler, notFoundHandler } from "./config/errorHandler.js";
import type { ServerContext } from "./config/context.js";
import { cache } from "./cache-shim.js";

import { hianimeRouter } from "./routes/cloudflare-hianime.js";

const hianime = new HiAnime.Scraper();

//
const BASE_PATH = "/api" as const;
const API_VERSION = "2.18.2";

const app = new Hono<ServerContext>();

app.use(corsConfig);
app.use(cacheControl);
app.use(cacheConfigSetter(BASE_PATH.length));

// Static file serving (like Render.com)
app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /"));
app.get("/favicon.ico", (c) => c.redirect("https://aniwatch.me/favicon.ico", 301));

// Root endpoint - redirect to help
app.get("/", (c) => c.redirect("/help"));

// Health endpoint - match Render.com exactly
app.get("/health", (c) => c.text("daijoubu", { status: 200 }));

// Version endpoint - match Render.com
app.get("/v", async (c) =>
    c.text(`aniwatch-api: v${API_VERSION}\nenvironment: cloudflare-workers`)
);

app.get("/help", (c) => {
    const baseUrl = "https://aniwatch-api.anifoxwatch.workers.dev";

    return c.json({
        api_info: {
            name: "Aniwatch API",
            version: API_VERSION,
            environment: "cloudflare-workers",
            description: "Complete anime streaming API with search, details, episodes, and streaming sources",
            base_url: baseUrl,
            status: "active",
            features: [
                "Anime search and discovery",
                "Detailed anime information",
                "Episode listings and metadata",
                "Multiple streaming sources",
                "Genre and category filtering",
                "Release schedules",
                "Browser-compatible CORS",
                "Cached responses for performance"
            ]
        },

        quick_start: {
            description: "Get started with these common endpoints",
            examples: [
                {
                    endpoint: `${baseUrl}/api/home`,
                    description: "Get homepage with trending anime",
                    method: "GET"
                },
                {
                    endpoint: `${baseUrl}/api/search?q=naruto`,
                    description: "Search for anime by title",
                    method: "GET"
                },
                {
                    endpoint: `${baseUrl}/api/category/most-popular`,
                    description: "Get most popular anime",
                    method: "GET"
                },
                {
                    endpoint: `${baseUrl}/health`,
                    description: "Check API health status",
                    method: "GET"
                }
            ]
        },

        endpoints: {
            system: {
                health: {
                    method: "GET",
                    path: "/health",
                    full_url: `${baseUrl}/health`,
                    description: "API health check with status and version info",
                    response: {
                        status: "daijoubu",
                        timestamp: "ISO datetime",
                        version: "string",
                        uptime: "number"
                    }
                },
                help: {
                    method: "GET",
                    path: "/help",
                    full_url: `${baseUrl}/help`,
                    description: "Comprehensive API documentation"
                },
                version: {
                    method: "GET",
                    path: "/v",
                    full_url: `${baseUrl}/v`,
                    description: "API version information"
                }
            },

            anime_core: {
                search: {
                    method: "GET",
                    path: "/api/anime/search",
                    full_url: `${baseUrl}/api/anime/search`,
                    description: "Search for anime by title",
                    parameters: {
                        q: "Search query (required)",
                        page: "Page number (optional, default: 1)",
                        type: "Filter by type (optional)",
                        status: "Filter by status (optional)",
                        season: "Filter by season (optional)",
                        year: "Filter by year (optional)",
                        genre: "Filter by genre (optional)"
                    },
                    example: `${baseUrl}/api/anime/search?q=naruto&page=1`,
                    response: {
                        status: 200,
                        data: {
                            animes: "Array of anime objects",
                            currentPage: "number",
                            hasNextPage: "boolean",
                            totalPages: "number"
                        }
                    }
                },

                trending: {
                    method: "GET",
                    path: "/api/anime/trending",
                    full_url: `${baseUrl}/api/anime/trending`,
                    description: "Get currently trending anime",
                    parameters: {},
                    example: `${baseUrl}/api/anime/trending`,
                    response: {
                        status: 200,
                        data: {
                            spotlightAnimes: "Array of featured anime",
                            trendingAnimes: "Array of trending anime",
                            latestEpisodes: "Array of latest episodes",
                            topUpcomingAnimes: "Array of upcoming anime",
                            top10Animes: {
                                today: "Array of top anime today",
                                week: "Array of top anime this week",
                                month: "Array of top anime this month"
                            }
                        }
                    }
                },

                latest: {
                    method: "GET",
                    path: "/api/anime/latest",
                    full_url: `${baseUrl}/api/anime/latest`,
                    description: "Get latest episode releases",
                    parameters: {},
                    example: `${baseUrl}/api/anime/latest`,
                    response: {
                        status: 200,
                        data: "Latest episodes data"
                    }
                },

                top_rated: {
                    method: "GET",
                    path: "/api/anime/top-rated",
                    full_url: `${baseUrl}/api/anime/top-rated`,
                    description: "Get top rated anime",
                    parameters: {},
                    example: `${baseUrl}/api/anime/top-rated`,
                    response: {
                        status: 200,
                        data: "Top rated anime data"
                    }
                }
            },

            anime_details: {
                details: {
                    method: "GET",
                    path: "/api/anime/{id}",
                    full_url: `${baseUrl}/api/anime/{animeId}`,
                    description: "Get detailed anime information",
                    parameters: {
                        animeId: "Anime ID (from search results)"
                    },
                    example: `${baseUrl}/api/anime/naruto-123`,
                    response: {
                        status: 200,
                        data: {
                            id: "string",
                            name: "string",
                            japaneseName: "string",
                            type: "TV/Movie/OVA/etc",
                            episodes: {
                                sub: "number",
                                dub: "number"
                            },
                            status: "Ongoing/Completed/etc",
                            year: "number",
                            season: "string",
                            rating: "number",
                            genres: "Array of strings",
                            otherNames: "Array of strings",
                            synopsis: "string",
                            image: "string",
                            trailer: "string"
                        }
                    }
                },

                episodes: {
                    method: "GET",
                    path: "/api/anime/{id}/episodes",
                    full_url: `${baseUrl}/api/anime/{animeId}/episodes`,
                    description: "Get list of episodes for an anime",
                    parameters: {
                        animeId: "Anime ID (from search results)"
                    },
                    example: `${baseUrl}/api/anime/naruto-123/episodes`,
                    response: {
                        status: 200,
                        data: {
                            totalEpisodes: "number",
                            episodes: "Array of episode objects with id, number, title, etc"
                        }
                    }
                },

                next_episode: {
                    method: "GET",
                    path: "/api/anime/{id}/next-episode-schedule",
                    full_url: `${baseUrl}/api/anime/{animeId}/next-episode-schedule`,
                    description: "Get next episode release schedule",
                    parameters: {
                        animeId: "Anime ID (from search results)"
                    },
                    example: `${baseUrl}/api/anime/naruto-123/next-episode-schedule`,
                    response: {
                        status: 200,
                        data: "Next episode schedule information"
                    }
                }
            },

            streaming: {
                episode_servers: {
                    method: "GET",
                    path: "/api/anime/episode/servers",
                    full_url: `${baseUrl}/api/anime/episode/servers`,
                    description: "Get available streaming servers for an episode",
                    parameters: {
                        animeEpisodeId: "Episode ID (required)"
                    },
                    example: `${baseUrl}/api/anime/episode/servers?animeEpisodeId=naruto-ep-1`,
                    response: {
                        status: 200,
                        data: {
                            servers: "Array of available streaming servers"
                        }
                    }
                },

                episode_sources: {
                    method: "GET",
                    path: "/api/anime/episode/sources",
                    full_url: `${baseUrl}/api/anime/episode/sources`,
                    description: "Get actual streaming sources/links for an episode",
                    parameters: {
                        animeEpisodeId: "Episode ID (required)",
                        server: "Server type: vidstreaming/streamsb/mixdrop (optional, default: vidstreaming)",
                        category: "Category: sub/dub/raw (optional, default: sub)"
                    },
                    example: `${baseUrl}/api/anime/episode/sources?animeEpisodeId=naruto-ep-1&server=vidstreaming&category=sub`,
                    response: {
                        status: 200,
                        data: {
                            sources: "Array of streaming links with quality and format info",
                            subtitles: "Array of subtitle tracks (if available)",
                            tracks: "Array of video/audio tracks"
                        }
                    }
                }
            },

            discovery: {
                genre: {
                    method: "GET",
                    path: "/api/anime/genre/{name}",
                    full_url: `${baseUrl}/api/anime/genre/{genreName}`,
                    description: "Get anime by genre",
                    parameters: {
                        name: "Genre name (action, romance, comedy, etc)",
                        page: "Page number (optional, default: 1)"
                    },
                    example: `${baseUrl}/api/anime/genre/action?page=1`,
                    response: {
                        status: 200,
                        data: "Paginated anime list for the genre"
                    }
                },

                category: {
                    method: "GET",
                    path: "/api/anime/category/{name}",
                    full_url: `${baseUrl}/api/anime/category/{categoryName}`,
                    description: "Get anime by category",
                    parameters: {
                        name: "Category name (most-popular, recently-updated, etc)",
                        page: "Page number (optional, default: 1)"
                    },
                    example: `${baseUrl}/api/anime/category/most-popular?page=1`,
                    response: {
                        status: 200,
                        data: "Paginated anime list for the category"
                    }
                },

                producer: {
                    method: "GET",
                    path: "/api/anime/producer/{name}",
                    full_url: `${baseUrl}/api/anime/producer/{producerName}`,
                    description: "Get anime by producer",
                    parameters: {
                        name: "Producer name (ufotable, madhouse, etc)",
                        page: "Page number (optional, default: 1)"
                    },
                    example: `${baseUrl}/api/anime/producer/ufotable?page=1`,
                    response: {
                        status: 200,
                        data: "Paginated anime list for the producer"
                    }
                },

                schedule: {
                    method: "GET",
                    path: "/api/anime/schedule",
                    full_url: `${baseUrl}/api/anime/schedule`,
                    description: "Get anime release schedule",
                    parameters: {
                        date: "Date in YYYY-MM-DD format (optional, default: today)",
                        tzOffset: "Timezone offset in minutes (optional, default: -330)"
                    },
                    example: `${baseUrl}/api/anime/schedule?date=2024-01-29&tzOffset=-330`,
                    response: {
                        status: 200,
                        data: "Scheduled anime releases for the date"
                    }
                },

                azlist: {
                    method: "GET",
                    path: "/api/anime/azlist/{sortOption}",
                    full_url: `${baseUrl}/api/anime/azlist/{sortOption}`,
                    description: "Get anime list sorted A-Z",
                    parameters: {
                        sortOption: "Sort option: 0-9, a, b, c, etc",
                        page: "Page number (optional, default: 1)"
                    },
                    example: `${baseUrl}/api/anime/azlist/0-9?page=1`,
                    response: {
                        status: 200,
                        data: "Paginated anime list for the letter/number"
                    }
                },

                search_suggestion: {
                    method: "GET",
                    path: "/api/anime/search/suggestion",
                    full_url: `${baseUrl}/api/anime/search/suggestion`,
                    description: "Get search suggestions as you type",
                    parameters: {
                        q: "Partial search query"
                    },
                    example: `${baseUrl}/api/anime/search/suggestion?q=naru`,
                    response: {
                        status: 200,
                        data: "Array of search suggestions"
                    }
                },

                qtip: {
                    method: "GET",
                    path: "/api/anime/qtip/{animeId}",
                    full_url: `${baseUrl}/api/anime/qtip/{animeId}`,
                    description: "Get quick anime info tooltip",
                    parameters: {
                        animeId: "Anime ID"
                    },
                    example: `${baseUrl}/api/anime/qtip/naruto-123`,
                    response: {
                        status: 200,
                        data: "Quick anime info for tooltips"
                    }
                }
            }
        },

        streaming_workflow: {
            title: "Complete Streaming Workflow",
            description: "Step-by-step process to get streaming links",
            steps: [
                {
                    step: 1,
                    action: "Search for anime",
                    endpoint: `${baseUrl}/api/anime/search?q={animeName}`,
                    purpose: "Find the anime and get its ID"
                },
                {
                    step: 2,
                    action: "Get episode list",
                    endpoint: `${baseUrl}/api/anime/{animeId}/episodes`,
                    purpose: "Get all episodes and their IDs"
                },
                {
                    step: 3,
                    action: "Get episode servers",
                    endpoint: `${baseUrl}/api/anime/episode/servers?animeEpisodeId={episodeId}`,
                    purpose: "Get available streaming servers"
                },
                {
                    step: 4,
                    action: "Get streaming sources",
                    endpoint: `${baseUrl}/api/anime/episode/sources?animeEpisodeId={episodeId}&server={server}&category={category}`,
                    purpose: "Get actual streaming links"
                }
            ],
            example_flow: {
                search: `${baseUrl}/api/anime/search?q=naruto`,
                episodes: `${baseUrl}/api/anime/naruto-123/episodes`,
                servers: `${baseUrl}/api/anime/episode/servers?animeEpisodeId=naruto-ep-1`,
                sources: `${baseUrl}/api/anime/episode/sources?animeEpisodeId=naruto-ep-1&server=vidstreaming&category=sub`
            }
        },

        technical_info: {
            cors: {
                enabled: true,
                allowed_origins: ["*"],
                allowed_methods: ["GET", "POST", "OPTIONS"],
                allowed_headers: ["Content-Type", "Authorization", "X-Requested-With"],
                credentials: true
            },
            caching: {
                enabled: true,
                default_ttl: "5 minutes",
                cache_control: "s-maxage=300, stale-while-revalidate=60"
            },
            rate_limiting: {
                enabled: true,
                window: "30 minutes",
                max_requests: "1000 per window"
            },
            response_format: {
                type: "JSON",
                structure: {
                    status: "HTTP status code",
                    data: "Response data or error message"
                }
            }
        },

        usage_examples: {
            javascript: `
// Basic usage in JavaScript
const API_BASE = 'https://aniwatch-api.anifoxwatch.workers.dev';

// Search anime
fetch(\`\${API_BASE}/api/anime/search?q=naruto\`)
  .then(res => res.json())
  .then(data => console.log(data));

// Get streaming sources
fetch(\`\${API_BASE}/api/anime/episode/sources?animeEpisodeId=naruto-ep-1&server=vidstreaming&category=sub\`)
  .then(res => res.json())
  .then(data => console.log(data));`,

            curl: `
# Basic usage with curl
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/anime/trending"

# Search anime
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/anime/search?q=naruto"

# Get streaming sources
curl "https://aniwatch-api.anifoxwatch.workers.dev/api/anime/episode/sources?animeEpisodeId=naruto-ep-1&server=vidstreaming&category=sub"`
        }
    });
});
app.get("/v", async (c) =>
    c.text(`aniwatch-api: v${API_VERSION}\nenvironment: cloudflare-workers`)
);

// Add routes to match frontend expectations (MUST be before basePath route)
// These routes map /api/anime/* to the hianimeRouter routes
app.get("/api/anime/search", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const { q: query, page, ...filters } = c.req.query();
    const decodedQuery = decodeURIComponent(query || "");
    const pageNo = Number(decodeURIComponent(page || "")) || 1;

    const data = await cache.getOrSet(
        async () => hianime.search(decodedQuery, pageNo, filters),
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ status: 200, data }, { status: 200 });
});

app.get("/api/anime/browse", async (c) => {
    // Browse is the same as search
    const cacheConfig = c.get("CACHE_CONFIG");
    const { q: query, page, ...filters } = c.req.query();
    const decodedQuery = decodeURIComponent(query || "");
    const pageNo = Number(decodeURIComponent(page || "")) || 1;

    const data = await cache.getOrSet(
        async () => hianime.search(decodedQuery, pageNo, filters),
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ status: 200, data }, { status: 200 });
});

app.get("/api/anime/trending", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const data = await cache.getOrSet(
        hianime.getHomePage,
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ status: 200, data }, { status: 200 });
});

app.get("/api/anime/latest", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const data = await cache.getOrSet(
        hianime.getHomePage,
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ status: 200, data }, { status: 200 });
});

app.get("/api/anime/top-rated", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const data = await cache.getOrSet(
        async () => hianime.getCategoryAnime("most-popular", 1),
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ status: 200, data }, { status: 200 });
});

app.get("/api/anime/genre/:genre", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const genreName = decodeURIComponent(c.req.param("genre").trim());
    const page = Number(decodeURIComponent(c.req.query("page") || "")) || 1;

    const data = await cache.getOrSet(
        async () => hianime.getGenreAnime(genreName, page),
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ status: 200, data }, { status: 200 });
});

app.get("/api/anime/:id", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeId = decodeURIComponent(c.req.param("id").trim());

    const data = await cache.getOrSet(
        async () => hianime.getInfo(animeId),
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ status: 200, data }, { status: 200 });
});

app.get("/api/anime/:id/episodes", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeId = decodeURIComponent(c.req.param("id").trim());

    const data = await cache.getOrSet(
        async () => hianime.getEpisodes(animeId),
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ status: 200, data }, { status: 200 });
});

// Working API instances that can scrape hianime.to (not blocked by Cloudflare)
// Cloudflare Workers IPs are blocked by hianime.to's Cloudflare protection,
// so we proxy streaming requests to these working instances
const WORKING_API_INSTANCES = [
    'https://aniwatch-api-v2.vercel.app',
    'https://api-aniwatch.onrender.com',
    'https://aniwatch-api.onrender.com',
    'https://hianime-api-chi.vercel.app',
];

let currentApiIndex = 0;

/**
 * Get the next working API instance with rotation
 */
function getWorkingApiUrl(): string {
    const apiUrl = WORKING_API_INSTANCES[currentApiIndex];
    // Rotate to next API for load balancing
    currentApiIndex = (currentApiIndex + 1) % WORKING_API_INSTANCES.length;
    return apiUrl;
}

/**
 * Proxy request to a working API instance with fallback
 */
async function proxyToWorkingApi(endpoint: string, params: Record<string, string>): Promise<any> {
    let lastError: Error | null = null;

    // Try each API instance in order
    for (let i = 0; i < WORKING_API_INSTANCES.length; i++) {
        const apiUrl = WORKING_API_INSTANCES[i];
        const url = new URL(`${apiUrl}${endpoint}`);

        // Add query params
        Object.entries(params).forEach(([key, value]) => {
            if (value) url.searchParams.append(key, value);
        });

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'AniStreamHub/1.0'
                }
            });

            if (response.ok) {
                const data = await response.json();
                // Update current API index to this working one
                currentApiIndex = i;
                return data;
            }
        } catch (error) {
            lastError = error as Error;
            console.warn(`API ${apiUrl} failed: ${lastError.message}`);
        }
    }

    throw lastError || new Error('All API instances failed');
}

app.get("/api/episode/servers", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeEpisodeId = decodeURIComponent(c.req.query("animeEpisodeId") || "");

    if (!animeEpisodeId) {
        return c.json({ error: "animeEpisodeId is required" }, 400);
    }

    try {
        // Use direct HiAnime scraping via aniwatch package
        const data = await cache.getOrSet(
            async () => hianime.getEpisodeServers(animeEpisodeId),
            cacheConfig.key,
            cacheConfig.duration
        );
        return c.json({ status: 200, data }, { status: 200 });
    } catch (error) {
        console.error('Episode servers error:', error);
        return c.json({ error: 'Failed to get episode servers', details: String(error) }, 500);
    }
});

app.get("/api/episode/sources", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const animeEpisodeId = decodeURIComponent(c.req.query("animeEpisodeId") || "");
    const server = decodeURIComponent(c.req.query("server") || "hd-2") as HiAnime.AnimeServers;
    const category = decodeURIComponent(c.req.query("category") || "sub") as "sub" | "dub" | "raw";

    if (!animeEpisodeId) {
        return c.json({ error: "animeEpisodeId is required" }, 400);
    }

    try {
        // Use direct HiAnime scraping via aniwatch package
        const data = await cache.getOrSet(
            async () => hianime.getEpisodeSources(animeEpisodeId, server, category),
            cacheConfig.key,
            cacheConfig.duration
        );
        return c.json({ status: 200, data }, { status: 200 });
    } catch (error) {
        console.error('Episode sources error:', error);
        return c.json({ error: 'Failed to get episode sources', details: String(error) }, 500);
    }
});

// Now register the basePath route (after all proxy routes)
app.basePath(BASE_PATH).route("/", hianimeRouter);

app.basePath(BASE_PATH).get("/anicrush", (c) =>
    c.text("Anicrush could be implemented in future.")
);

app.notFound(notFoundHandler);
app.onError(errorHandler);

// Export for Cloudflare Workers
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return app.fetch(request, env, ctx);
    },
};

type Env = {
    ANIWATCH_API_REDIS_CONN_URL?: string;
    ANIWATCH_API_HOSTNAME?: string;
    ANIWATCH_API_DEPLOYMENT_ENV?: string;
    ANIWATCH_API_S_MAXAGE?: string;
    ANIWATCH_API_STALE_WHILE_REVALIDATE?: string;
    ANIWATCH_API_WINDOW_MS?: string;
    ANIWATCH_API_MAX_REQS?: string;
    ANIWATCH_API_CORS_ALLOWED_ORIGINS?: string;
    NODE_ENV?: string;
};
