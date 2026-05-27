# Migrating Route Handlers from Express to Hono (Cloudflare Workers)

## Overview

Your current setup uses Express for the main API server. To deploy to Cloudflare Workers, you need to convert your routes from Express to **Hono**, a lightweight web framework optimized for serverless environments.

### Key Differences

| Aspect | Express | Hono |
|--------|---------|------|
| Request object | `Request` | `Context` |
| Response | `res.json()`, `res.send()` | `c.json()`, `c.text()` |
| Params | `req.params.id` | `c.req.param('id')` |
| Query | `req.query.q` | `c.req.query('q')` |
| Headers | `req.headers.get()` | `c.req.header()` |
| Environment | `process.env` | `c.env` |
| Middleware | `app.use()` | `app.use()` (same) |
| Error handling | `next(error)` | `throw error` |

---

## Step 1: Convert Anime Routes

### Before (Express) - `server/src/routes/anime.ts`

```typescript
import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';

const router = Router();

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    const page = Number(req.query.page) || 1;
    const source = req.query.source as string | undefined;

    if (!q) {
      return res.status(400).json({
        error: 'Query parameter "q" is required',
      });
    }

    const data = await sourceManager.search(q, page, source);
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

### After (Hono) - `server/src/routes-worker/anime-routes.ts`

```typescript
import { Hono } from 'hono';
import { Env } from '../types/worker.js';
import { Logger } from '../utils/logger.js';
import { SourceManager } from '../services/source-manager.js';
import { CacheService } from '../services/cache-service.js';
import { ApiResponse } from '../types/worker.js';

const router = new Hono<{ Bindings: Env }>();

// GET /api/anime/search
router.get('/search', async (c) => {
  const logger = new Logger(c.env);
  const sourceManager = c.get('sourceManager') as SourceManager;
  const cacheService = c.get('cacheService') as CacheService;

  try {
    const q = c.req.query('q') || '';
    const page = Number(c.req.query('page')) || 1;
    const source = c.req.query('source');
    const forceRefresh = c.req.query('refresh') === 'true';

    // Validate input
    if (!q) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Query parameter "q" is required',
          code: 'VALIDATION_ERROR',
        },
      };
      return c.json(response, { status: 400 });
    }

    // Generate cache key
    const cacheKey = cacheService.generateKey(`/anime/search`, {
      q,
      page,
      source,
    });

    // Use cache wrapper
    const { data, cached } = await cacheService.withCache(
      cacheKey,
      () => sourceManager.search(q, page, source),
      { ttl: 3600, force: forceRefresh }
    );

    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        requestId: c.get('requestContext')?.requestId || 'unknown',
        duration: Date.now() - (c.get('requestContext')?.startTime || 0),
        cached,
      },
    };

    return c.json(response);
  } catch (error) {
    logger.error('Search error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'SEARCH_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

// GET /api/anime/trending
router.get('/trending', async (c) => {
  const logger = new Logger(c.env);
  const sourceManager = c.get('sourceManager') as SourceManager;
  const cacheService = c.get('cacheService') as CacheService;

  try {
    const page = Number(c.req.query('page')) || 1;
    const source = c.req.query('source');

    const cacheKey = cacheService.generateKey(`/anime/trending`, {
      page,
      source,
    });

    const { data, cached } = await cacheService.withCache(
      cacheKey,
      () => sourceManager.getTrending(page, source),
      { ttl: 7200 } // 2 hours
    );

    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        requestId: c.get('requestContext')?.requestId || 'unknown',
        duration: Date.now() - (c.get('requestContext')?.startTime || 0),
        cached,
      },
    };

    return c.json(response);
  } catch (error) {
    logger.error('Trending error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'TRENDING_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

// GET /api/anime/:id
router.get('/:id', async (c) => {
  const logger = new Logger(c.env);
  const sourceManager = c.get('sourceManager') as SourceManager;
  const cacheService = c.get('cacheService') as CacheService;

  try {
    const id = c.req.param('id');

    if (!id) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Anime ID is required',
          code: 'VALIDATION_ERROR',
        },
      };
      return c.json(response, { status: 400 });
    }

    const cacheKey = cacheService.generateKey(`/anime/${id}`, {});

    const { data, cached } = await cacheService.withCache(
      cacheKey,
      () => sourceManager.getAnimeDetails(id),
      { ttl: 3600 } // 1 hour
    );

    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        requestId: c.get('requestContext')?.requestId || 'unknown',
        duration: Date.now() - (c.get('requestContext')?.startTime || 0),
        cached,
      },
    };

    return c.json(response);
  } catch (error) {
    logger.error('Get anime details error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'GET_ANIME_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

// GET /api/anime/:id/episodes
router.get('/:id/episodes', async (c) => {
  const logger = new Logger(c.env);
  const sourceManager = c.get('sourceManager') as SourceManager;
  const cacheService = c.get('cacheService') as CacheService;

  try {
    const id = c.req.param('id');
    const page = Number(c.req.query('page')) || 1;

    if (!id) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Anime ID is required',
          code: 'VALIDATION_ERROR',
        },
      };
      return c.json(response, { status: 400 });
    }

    const cacheKey = cacheService.generateKey(`/anime/${id}/episodes`, {
      page,
    });

    const { data, cached } = await cacheService.withCache(
      cacheKey,
      () => sourceManager.getEpisodes(id, page),
      { ttl: 3600 }
    );

    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        requestId: c.get('requestContext')?.requestId || 'unknown',
        duration: Date.now() - (c.get('requestContext')?.startTime || 0),
        cached,
      },
    };

    return c.json(response);
  } catch (error) {
    logger.error('Get episodes error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'GET_EPISODES_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

export default router;
```

---

## Step 2: Convert Streaming Routes

### Before (Express) - `server/src/routes/streaming.ts` (partial)

```typescript
import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';

const router = Router();

router.get('/servers/:episodeId', async (req: Request, res: Response) => {
  try {
    const episodeId = req.params.episodeId;
    
    if (!episodeId) {
      return res.status(400).json({ error: 'Episode ID required' });
    }

    const servers = await sourceManager.getServers(episodeId);
    res.json(servers);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
```

### After (Hono) - `server/src/routes-worker/streaming-routes.ts`

```typescript
import { Hono } from 'hono';
import { Env, ApiResponse } from '../types/worker.js';
import { Logger } from '../utils/logger.js';
import { SourceManager } from '../services/source-manager.js';
import { CacheService } from '../services/cache-service.js';
import { RateLimitService } from '../services/rate-limiter.js';

const router = new Hono<{ Bindings: Env }>();

// GET /api/stream/servers/:episodeId
router.get('/servers/:episodeId', async (c) => {
  const logger = new Logger(c.env);
  const sourceManager = c.get('sourceManager') as SourceManager;
  const cacheService = c.get('cacheService') as CacheService;
  const rateLimiter = c.get('rateLimiter') as RateLimitService;

  try {
    const episodeId = c.req.param('episodeId');
    const userId = c.req.header('x-user-id') || 'anonymous';

    // Input validation
    if (!episodeId) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Episode ID is required',
          code: 'VALIDATION_ERROR',
        },
      };
      return c.json(response, { status: 400 });
    }

    // Check rate limit
    const rateCheckResult = await rateLimiter.checkLimit(userId);
    if (!rateCheckResult.allowed) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Rate limit exceeded',
          code: 'RATE_LIMITED',
          details: {
            retryAfter: rateCheckResult.resetIn,
          },
        },
      };
      return c.json(response, { status: 429 });
    }

    // Use cache
    const cacheKey = cacheService.generateKey(`/stream/servers/${episodeId}`, {});

    const { data, cached } = await cacheService.withCache(
      cacheKey,
      () => sourceManager.getServers(episodeId),
      { ttl: 1800 } // 30 minutes
    );

    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        requestId: c.get('requestContext')?.requestId || 'unknown',
        duration: Date.now() - (c.get('requestContext')?.startTime || 0),
        cached,
      },
    };

    return c.json(response);
  } catch (error) {
    logger.error('Get servers error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'GET_SERVERS_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

// GET /api/stream/watch/:episodeId
router.get('/watch/:episodeId', async (c) => {
  const logger = new Logger(c.env);
  const sourceManager = c.get('sourceManager') as SourceManager;
  const cacheService = c.get('cacheService') as CacheService;

  try {
    const episodeId = c.req.param('episodeId');
    const server = c.req.query('server');

    if (!episodeId) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Episode ID is required',
          code: 'VALIDATION_ERROR',
        },
      };
      return c.json(response, { status: 400 });
    }

    if (!server) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Server parameter is required',
          code: 'VALIDATION_ERROR',
        },
      };
      return c.json(response, { status: 400 });
    }

    const cacheKey = cacheService.generateKey(`/stream/watch/${episodeId}`, {
      server,
    });

    const { data, cached } = await cacheService.withCache(
      cacheKey,
      () => sourceManager.resolveStream(episodeId, server),
      { ttl: 900 } // 15 minutes
    );

    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        requestId: c.get('requestContext')?.requestId || 'unknown',
        duration: Date.now() - (c.get('requestContext')?.startTime || 0),
        cached,
      },
    };

    return c.json(response);
  } catch (error) {
    logger.error('Watch stream error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'WATCH_STREAM_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

// POST /api/stream/proxy - Stream proxy for video playback
router.post('/proxy', async (c) => {
  const logger = new Logger(c.env);

  try {
    const body = await c.req.json();
    const { url, headers } = body;

    if (!url) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'URL parameter is required',
          code: 'VALIDATION_ERROR',
        },
      };
      return c.json(response, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Invalid URL provided',
          code: 'VALIDATION_ERROR',
        },
      };
      return c.json(response, { status: 400 });
    }

    // Proxy request to external URL
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      parseInt(c.env.STREAMING_TIMEOUT, 10)
    );

    try {
      const proxyRequest = new Request(url, {
        method: 'GET',
        headers: new Headers(headers || {}),
        signal: controller.signal,
      });

      const proxyResponse = await fetch(proxyRequest);

      // Return streaming response
      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: proxyResponse.headers,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.error('Stream proxy error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'PROXY_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

export default router;
```

---

## Step 3: Convert Sources Routes

```typescript
// server/src/routes-worker/sources-routes.ts
import { Hono } from 'hono';
import { Env, ApiResponse } from '../types/worker.js';
import { SourceManager } from '../services/source-manager.js';
import { Logger } from '../utils/logger.js';

const router = new Hono<{ Bindings: Env }>();

// GET /api/sources
router.get('/', async (c) => {
  const sourceManager = c.get('sourceManager') as SourceManager;

  try {
    const sources = sourceManager.getAvailableSources();

    const response: ApiResponse = {
      success: true,
      data: sources,
      meta: {
        requestId: c.get('requestContext')?.requestId || 'unknown',
        duration: Date.now() - (c.get('requestContext')?.startTime || 0),
        cached: false,
      },
    };

    return c.json(response);
  } catch (error) {
    const logger = new Logger(c.env);
    logger.error('Get sources error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'GET_SOURCES_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

// GET /api/sources/health
router.get('/health', async (c) => {
  const sourceManager = c.get('sourceManager') as SourceManager;
  const cacheService = c.get('cacheService') as CacheService;

  try {
    const health = await sourceManager.checkHealth();

    const response: ApiResponse = {
      success: true,
      data: health,
      meta: {
        requestId: c.get('requestContext')?.requestId || 'unknown',
        duration: Date.now() - (c.get('requestContext')?.startTime || 0),
        cached: false,
      },
    };

    return c.json(response);
  } catch (error) {
    const logger = new Logger(c.env);
    logger.error('Sources health check error', error as Error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'HEALTH_CHECK_ERROR',
      },
    };

    return c.json(response, { status: 500 });
  }
});

export default router;
```

---

## Step 4: Key Patterns for Hono Routes

### Pattern 1: Extracting User Context

```typescript
// In middleware
app.use('*', async (c, next) => {
  const userId = c.req.header('x-user-id') || 'anonymous';
  const token = c.req.header('authorization');

  c.set('userId', userId);
  c.set('token', token);

  await next();
});

// In route handler
router.get('/protected', async (c) => {
  const userId = c.get('userId');
  const token = c.get('token');

  if (!token) {
    return c.json({
      success: false,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    }, { status: 401 });
  }

  // Proceed...
});
```

### Pattern 2: Validation Middleware

```typescript
// Reusable validation middleware
async function validateQuery(c: any, requiredParams: string[]): Promise<boolean> {
  for (const param of requiredParams) {
    if (!c.req.query(param)) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: `Missing required parameter: ${param}`,
          code: 'VALIDATION_ERROR',
        },
      };
      c.status(400);
      c.json(response);
      return false;
    }
  }
  return true;
}

// In route
router.get('/search', async (c) => {
  if (!(await validateQuery(c, ['q']))) {
    return c.res;
  }

  const q = c.req.query('q');
  // Continue...
});
```

### Pattern 3: Error Recovery

```typescript
router.get('/api/data', async (c) => {
  const logger = new Logger(c.env);

  try {
    // Primary source
    const data = await fetchPrimarySource();
    return c.json({ success: true, data });
  } catch (primaryError) {
    logger.warn('Primary source failed, trying fallback', primaryError);

    try {
      // Fallback source
      const data = await fetchFallbackSource();
      return c.json({ success: true, data, note: 'fallback' });
    } catch (fallbackError) {
      logger.error('Both sources failed', fallbackError);

      return c.json(
        {
          success: false,
          error: { message: 'All sources failed', code: 'SERVICE_ERROR' },
        },
        { status: 503 }
      );
    }
  }
});
```

### Pattern 4: Pagination

```typescript
router.get('/list', async (c) => {
  const page = Number(c.req.query('page')) || 1;
  const limit = Number(c.req.query('limit')) || 20;

  // Validate pagination params
  if (page < 1 || limit < 1 || limit > 100) {
    return c.json(
      {
        success: false,
        error: { message: 'Invalid pagination parameters', code: 'VALIDATION_ERROR' },
      },
      { status: 400 }
    );
  }

  const skip = (page - 1) * limit;
  const data = await fetchData(skip, limit);

  return c.json({
    success: true,
    data: data.items,
    pagination: {
      page,
      limit,
      total: data.total,
      hasMore: skip + limit < data.total,
    },
  });
});
```

---

## Step 5: Migration Checklist

- [ ] Convert all route files to Hono equivalents
- [ ] Update type definitions to use `Env` interface
- [ ] Replace `req.params` with `c.req.param()`
- [ ] Replace `req.query` with `c.req.query()`
- [ ] Replace `req.body` with `await c.req.json()`
- [ ] Replace `res.json()` with `c.json()`
- [ ] Replace `res.status()` with `c.status()` or return tuple
- [ ] Update error handling (no `next(error)`)
- [ ] Add request/response logging
- [ ] Add API response wrapper
- [ ] Test with `wrangler dev`

---

## Summary

When converting Express routes to Hono:

1. **Context object** (`c`) replaces both `req` and `res`
2. **Environment variables** come from `c.env` instead of `process.env`
3. **Return responses** directly instead of calling `res.json()`
4. **Handle errors** by throwing or returning error responses
5. **Use middleware** for cross-cutting concerns
6. **Keep services the same** - only route layer changes

The migration is straightforward and your existing business logic in services doesn't need to change!
