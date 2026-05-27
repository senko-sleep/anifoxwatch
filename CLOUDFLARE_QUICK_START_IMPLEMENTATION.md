# Quick-Start Implementation: Cloudflare Workers for AniStream Hub

## Part 1: Update Your wrangler.toml

Replace your current `server/wrangler.toml` with this production-ready configuration:

```toml
# server/wrangler.toml

name = "anifoxwatch-api"
main = "dist/worker-modular.js"
type = "service"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

# Deploy to workers.dev
workers_dev = true

# Build configuration
[build]
command = "npm run build"
watch_paths = ["src/**/*.ts"]

# Build output
outdir = "dist"
minify = true
sourcemap = true

# ============================================================================
# ENVIRONMENT VARIABLES (Non-sensitive)
# ============================================================================
[vars]
NODE_ENV = "production"
LOG_LEVEL = "info"
WORKER_NAME = "anifoxwatch-api"

# External API URLs
HIANIME_REST_URL = "https://aniwatch-api-coral-seven.vercel.app"
ANILIST_API_URL = "https://graphql.anilist.co"

# Timeout configurations
STREAMING_TIMEOUT = "30000"
DUB_PATIENCE_MS = "25000"
GLOBAL_TIMEOUT_MS = "60000"
API_CALL_TIMEOUT = "15000"

# Performance & reliability settings
MAX_CONCURRENT_REQUESTS = "50"
CIRCUIT_BREAKER_THRESHOLD = "5"
CIRCUIT_BREAKER_RESET_MS = "60000"

# Feature flags
ENABLE_CACHING = "true"
ENABLE_COMPRESSION = "true"
ENABLE_REQUEST_LOGGING = "true"
ENABLE_DETAILED_LOGGING = "false"

# ============================================================================
# KV NAMESPACE BINDINGS (Distributed Cache)
# ============================================================================
[[kv_namespaces]]
binding = "CACHE"
id = ""                                    # Get from: wrangler kv:namespace list
preview_id = ""

[[kv_namespaces]]
binding = "SESSION_STORE"
id = ""
preview_id = ""

[[kv_namespaces]]
binding = "API_RESPONSE_CACHE"
id = ""
preview_id = ""

# ============================================================================
# DURABLE OBJECTS (Persistent State)
# ============================================================================
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"
script_name = "anifoxwatch-api"

[[durable_objects.bindings]]
name = "REQUEST_COUNTER"
class_name = "RequestCounter"
script_name = "anifoxwatch-api"

# ============================================================================
# SERVICE BINDINGS (Communication with other Workers)
# ============================================================================
[[services]]
binding = "STREAM_PROXY_WORKER"
service = "stream-proxy"
environment = "production"

# ============================================================================
# ANALYTICS ENGINE
# ============================================================================
[observability]
enabled = true

# ============================================================================
# PRODUCTION ENVIRONMENT
# ============================================================================
[env.production]
name = "anifoxwatch-api-prod"

[env.production.vars]
NODE_ENV = "production"
LOG_LEVEL = "warn"
ENABLE_DETAILED_LOGGING = "false"

[env.production.kv_namespaces]
[[env.production.kv_namespaces]]
binding = "CACHE"
id = "your-prod-cache-id"
[[env.production.kv_namespaces]]
binding = "SESSION_STORE"
id = "your-prod-session-id"
[[env.production.kv_namespaces]]
binding = "API_RESPONSE_CACHE"
id = "your-prod-api-response-id"

# ============================================================================
# STAGING ENVIRONMENT
# ============================================================================
[env.staging]
name = "anifoxwatch-api-staging"

[env.staging.vars]
NODE_ENV = "staging"
LOG_LEVEL = "info"
ENABLE_DETAILED_LOGGING = "true"

[env.staging.kv_namespaces]
[[env.staging.kv_namespaces]]
binding = "CACHE"
id = "your-staging-cache-id"
[[env.staging.kv_namespaces]]
binding = "SESSION_STORE"
id = "your-staging-session-id"
[[env.staging.kv_namespaces]]
binding = "API_RESPONSE_CACHE"
id = "your-staging-api-response-id"

# ============================================================================
# DEVELOPMENT ENVIRONMENT
# ============================================================================
[env.development]
name = "anifoxwatch-api-dev"
workers_dev = true

[env.development.vars]
NODE_ENV = "development"
LOG_LEVEL = "debug"
DEBUG = "true"
ENABLE_DETAILED_LOGGING = "true"
```

---

## Part 2: Set Up Secrets

### 1. Create KV Namespaces

```bash
# Navigate to server directory
cd server

# Create CACHE namespace
wrangler kv:namespace create "CACHE"
# Output: Adding kv_namespace binding to wrangler.toml
# Created namespace with ID: abc123def456...

# Create SESSION_STORE namespace
wrangler kv:namespace create "SESSION_STORE"

# Create API_RESPONSE_CACHE namespace
wrangler kv:namespace create "API_RESPONSE_CACHE"

# For production
wrangler kv:namespace create "CACHE" --env production
wrangler kv:namespace create "SESSION_STORE" --env production
wrangler kv:namespace create "API_RESPONSE_CACHE" --env production

# Copy the IDs from output and update wrangler.toml
```

### 2. Set Production Secrets

```bash
# Set API keys for production
wrangler secret put ANILIST_API_KEY --env production
# Paste your AniList API key when prompted

wrangler secret put CLOUDFLARE_API_TOKEN --env production
# Your Cloudflare API token

wrangler secret put DATABASE_URL --env production
# Your database connection string (if applicable)

# Verify secrets are set
wrangler secret list --env production
```

### 3. Create Local Development Secrets File

Create `.dev.vars` in the `server/` directory:

```env
NODE_ENV=development
LOG_LEVEL=debug
HIANIME_REST_URL=http://localhost:3001
ANILIST_API_KEY=dev_key_local_12345
CLOUDFLARE_API_TOKEN=dev_token_local
DATABASE_URL=sqlite:///local.db
ENABLE_DETAILED_LOGGING=true
```

---

## Part 3: Create Production-Ready Types

Create `server/src/types/worker.ts`:

```typescript
export interface Env {
  // Environment Variables
  NODE_ENV: 'production' | 'staging' | 'development';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  WORKER_NAME: string;
  WORKER_ENVIRONMENT: string;

  // External API URLs
  HIANIME_REST_URL: string;
  ANILIST_API_URL: string;

  // Timeouts
  STREAMING_TIMEOUT: string;
  DUB_PATIENCE_MS: string;
  GLOBAL_TIMEOUT_MS: string;
  API_CALL_TIMEOUT: string;

  // Performance settings
  MAX_CONCURRENT_REQUESTS: string;
  CIRCUIT_BREAKER_THRESHOLD: string;
  CIRCUIT_BREAKER_RESET_MS: string;

  // Feature flags
  ENABLE_CACHING: string;
  ENABLE_COMPRESSION: string;
  ENABLE_REQUEST_LOGGING: string;
  ENABLE_DETAILED_LOGGING: string;

  // Secrets (sensitive data)
  ANILIST_API_KEY: string;
  CLOUDFLARE_API_TOKEN?: string;
  DATABASE_URL?: string;

  // KV Namespaces
  CACHE: KVNamespace;
  SESSION_STORE: KVNamespace;
  API_RESPONSE_CACHE: KVNamespace;

  // Durable Objects
  RATE_LIMITER: DurableObjectNamespace;
  REQUEST_COUNTER: DurableObjectNamespace;

  // Service Bindings
  STREAM_PROXY_WORKER?: Fetcher;
}

export interface RequestContext {
  requestId: string;
  startTime: number;
  timestamp: string;
  method: string;
  path: string;
  userAgent?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  meta?: {
    requestId: string;
    duration: number;
    cached: boolean;
  };
}
```

---

## Part 4: Create Worker Entry Point

Create `server/src/worker-modular.ts`:

```typescript
import './polyfills.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { Env, RequestContext, ApiResponse } from './types/worker.js';
import { Logger } from './utils/logger.js';
import { SourceManager } from './services/source-manager.js';
import { RateLimitService } from './services/rate-limiter.js';
import { CacheService } from './services/cache-service.js';

// Import route handlers
import animeRoutes from './routes-worker/anime-routes.js';
import streamingRoutes from './routes-worker/streaming-routes.js';
import sourcesRoutes from './routes-worker/sources-routes.js';
import hianimeRestProxyRoutes from './routes-worker/hianime-rest-proxy-routes.js';

// Initialize Hono app
const app = new Hono<{ Bindings: Env }>();

// Global singleton services
let sourceManagerInstance: SourceManager | null = null;
let cacheServiceInstance: CacheService | null = null;
let rateLimiterService: RateLimitService | null = null;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS configuration
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Requested-With'],
  maxAge: 86400,
}));

// Request logging middleware
app.use('*', async (c, next) => {
  const logger = new Logger(c.env);
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  const context: RequestContext = {
    requestId,
    startTime,
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    userAgent: c.req.header('User-Agent'),
  };

  // Store in context for use in handlers
  c.set('requestContext', context);
  c.set('logger', logger);

  try {
    await next();
  } finally {
    const duration = Date.now() - startTime;
    
    if (c.env.ENABLE_REQUEST_LOGGING === 'true') {
      logger.info(`${c.req.method} ${context.path}`, {
        requestId,
        duration,
        status: c.res.status,
      });
    }

    // Add request timing headers
    c.header('X-Request-ID', requestId);
    c.header('X-Response-Time', `${duration}ms`);
  }
});

// Error handling middleware
app.onError((err, c) => {
  const logger = new Logger(c.env);
  const requestContext = c.get('requestContext') as RequestContext;

  logger.error('Request error', err as Error, {
    requestId: requestContext?.requestId,
    path: requestContext?.path,
  });

  const response: ApiResponse = {
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    },
    meta: {
      requestId: requestContext?.requestId || 'unknown',
      duration: Date.now() - (requestContext?.startTime || 0),
      cached: false,
    },
  };

  return c.json(response, { status: 500 });
});

// ============================================================================
// SERVICE INITIALIZATION
// ============================================================================

function getSourceManager(env: Env): SourceManager {
  if (!sourceManagerInstance) {
    sourceManagerInstance = new SourceManager({
      cache: env.CACHE,
      timeout: parseInt(env.STREAMING_TIMEOUT, 10),
      apiUrl: env.HIANIME_REST_URL,
    });
  }
  return sourceManagerInstance;
}

function getCacheService(env: Env): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService({
      kv: env.API_RESPONSE_CACHE,
      enabled: env.ENABLE_CACHING === 'true',
    });
  }
  return cacheServiceInstance;
}

function getRateLimiter(env: Env): RateLimitService {
  if (!rateLimiterService) {
    rateLimiterService = new RateLimitService({
      durableObject: env.RATE_LIMITER,
      maxRequests: parseInt(env.MAX_CONCURRENT_REQUESTS, 10),
    });
  }
  return rateLimiterService;
}

// ============================================================================
// HEALTH & STATUS ENDPOINTS
// ============================================================================

app.get('/health', (c) => {
  const response: ApiResponse = {
    success: true,
    data: {
      status: 'healthy',
      environment: c.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  };
  return c.json(response);
});

app.get('/api', (c) => {
  const response: ApiResponse = {
    success: true,
    data: {
      name: 'AniStream Hub API',
      version: '1.0.0',
      environment: c.env.WORKER_ENVIRONMENT,
      endpoints: {
        anime: [
          'GET /api/anime/search?q=query&page=1',
          'GET /api/anime/trending?page=1',
          'GET /api/anime/:id',
          'GET /api/anime/:id/episodes',
        ],
        streaming: [
          'GET /api/stream/servers/:episodeId',
          'GET /api/stream/watch/:episodeId?server=name',
          'GET /api/stream/proxy?url=hlsUrl',
        ],
        sources: [
          'GET /api/sources',
          'GET /api/sources/health',
        ],
      },
    },
  };
  return c.json(response);
});

// ============================================================================
// REGISTER ROUTES
// ============================================================================

// Make services available to routes
app.use('*', async (c, next) => {
  c.set('sourceManager', getSourceManager(c.env));
  c.set('cacheService', getCacheService(c.env));
  c.set('rateLimiter', getRateLimiter(c.env));
  await next();
});

// Register route handlers
app.route('/api/anime', animeRoutes);
app.route('/api/stream', streamingRoutes);
app.route('/api/sources', sourcesRoutes);
app.route('/api/hianime-rest-proxy', hianimeRestProxyRoutes);

// ============================================================================
// 404 HANDLER
// ============================================================================

app.notFound((c) => {
  const response: ApiResponse = {
    success: false,
    error: {
      message: 'Endpoint not found',
      code: 'NOT_FOUND',
    },
  };
  return c.json(response, { status: 404 });
});

// ============================================================================
// EXPORT WORKER
// ============================================================================

export default app;
```

---

## Part 5: Create Cache Service

Create `server/src/services/cache-service.ts`:

```typescript
import { ApiResponse } from '../types/worker.js';

export interface CacheOptions {
  kv: KVNamespace;
  enabled: boolean;
  defaultTtl?: number;
}

export class CacheService {
  private kv: KVNamespace;
  private enabled: boolean;
  private defaultTtl: number;

  constructor(options: CacheOptions) {
    this.kv = options.kv;
    this.enabled = options.enabled;
    this.defaultTtl = options.defaultTtl || 3600; // 1 hour default
  }

  // Generate cache key from URL and query parameters
  generateKey(url: string, params?: Record<string, any>): string {
    const baseKey = new URL(url).pathname;
    const paramStr = params ? JSON.stringify(params) : '';
    return `${baseKey}:${paramStr}`.toLowerCase();
  }

  // Check if response is cacheable
  isCacheable(response: any): boolean {
    if (!response || !response.success) return false;
    
    // Don't cache error responses or user-specific data
    if (response.error) return false;
    if (response.data?.userId) return false;
    
    return true;
  }

  // Get from cache
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.enabled) return null;

    try {
      const cached = await this.kv.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
    }

    return null;
  }

  // Set in cache
  async set<T = any>(
    key: string,
    value: T,
    options?: { ttl?: number }
  ): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const ttl = options?.ttl || this.defaultTtl;
      await this.kv.put(key, JSON.stringify(value), {
        expirationTtl: ttl,
      });
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  // Delete from cache
  async delete(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      await this.kv.delete(key);
      return true;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  // Clear all cache (use with caution!)
  async clear(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const keys = await this.kv.list();
      await Promise.all(keys.keys.map(k => this.kv.delete(k.name)));
      return true;
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  // Cache wrapper for API calls
  async withCache<T>(
    key: string,
    fn: () => Promise<T>,
    options?: { ttl?: number; force?: boolean }
  ): Promise<{ data: T; cached: boolean }> {
    // Check cache first (unless force is true)
    if (!options?.force) {
      const cached = await this.get<T>(key);
      if (cached) {
        return { data: cached, cached: true };
      }
    }

    // Execute function
    const data = await fn();

    // Cache result
    await this.set(key, data, { ttl: options?.ttl });

    return { data, cached: false };
  }
}
```

---

## Part 6: Create Rate Limiter Service

Create `server/src/services/rate-limiter.ts`:

```typescript
export interface RateLimiterOptions {
  durableObject: DurableObjectNamespace;
  maxRequests: number;
  windowMs?: number;
}

export class RateLimitService {
  private durableObject: DurableObjectNamespace;
  private maxRequests: number;
  private windowMs: number;

  constructor(options: RateLimiterOptions) {
    this.durableObject = options.durableObject;
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs || 60000; // 1 minute default
  }

  // Check if request should be allowed
  async checkLimit(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetIn: number;
  }> {
    try {
      const id = this.durableObject.idFromName(userId);
      const stub = this.durableObject.get(id);

      const response = await stub.fetch(new Request('http://internal/check', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }));

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request if service is down
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetIn: this.windowMs,
      };
    }
  }

  // Reset user's rate limit
  async reset(userId: string): Promise<boolean> {
    try {
      const id = this.durableObject.idFromName(userId);
      const stub = this.durableObject.get(id);

      await stub.fetch(new Request('http://internal/reset', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }));

      return true;
    } catch (error) {
      console.error('Rate limit reset error:', error);
      return false;
    }
  }
}
```

---

## Part 7: Build & Deploy

### Local Testing

```bash
# Navigate to server directory
cd server

# Install dependencies (if not done)
npm install

# Build TypeScript
npm run build

# Start local development server
wrangler dev

# Test in another terminal
curl http://localhost:8787/health
curl http://localhost:8787/api
curl "http://localhost:8787/api/anime/search?q=naruto"
```

### Deploy to Staging

```bash
# Build
npm run build

# Verify configuration
wrangler publish --dry-run --env staging

# Deploy to staging
wrangler publish --env staging

# Test deployment
curl https://anifoxwatch-api-staging.{your-account}.workers.dev/health

# Tail logs
wrangler tail --env staging
```

### Deploy to Production

```bash
# Final verification
wrangler publish --dry-run --env production

# Deploy
wrangler publish --env production

# Verify production deployment
curl https://anifoxwatch-api-prod.{your-account}.workers.dev/health

# Monitor production
wrangler tail --env production

# Check analytics
wrangler analytics --env production
```

---

## Part 8: Verification Checklist

Before deploying to production, verify:

- [ ] **wrangler.toml configured** with correct values
- [ ] **KV namespaces created** and IDs added to wrangler.toml
- [ ] **Secrets set** for production environment
  ```bash
  wrangler secret list --env production
  ```
- [ ] **TypeScript compiles** without errors
  ```bash
  npm run build
  ```
- [ ] **Local development works**
  ```bash
  wrangler dev
  curl http://localhost:8787/health
  ```
- [ ] **Staging deployment successful**
  ```bash
  wrangler publish --env staging
  ```
- [ ] **Staging endpoints respond**
  ```bash
  curl https://anifoxwatch-api-staging.{account}.workers.dev/health
  ```
- [ ] **Staging logs are clean**
  ```bash
  wrangler tail --env staging --lines 50
  ```
- [ ] **Production configuration correct** in wrangler.toml
- [ ] **All team members notified** of deployment
- [ ] **Monitoring alerts configured** in Cloudflare dashboard

---

## Part 9: Troubleshooting

### Issue: "Secret not found" error

```bash
# Verify secret exists
wrangler secret list --env production

# Re-set the secret
wrangler secret put ANILIST_API_KEY --env production
# Then redeploy
wrangler publish --env production
```

### Issue: "KVNamespace binding not found"

```bash
# Verify KV namespace IDs in wrangler.toml are correct
cat wrangler.toml | grep -A 2 "kv_namespaces"

# List all KV namespaces
wrangler kv:namespace list

# If missing, create:
wrangler kv:namespace create "CACHE" --env production
```

### Issue: Timeout errors

```typescript
// In your code, increase timeout for specific operations:
const EXTENDED_TIMEOUT = 90000; // 90 seconds
```

### Issue: Worker bundle too large

```typescript
// Reduce imports - use tree-shaking:
// ❌ Bad
import * as lodash from 'lodash';

// ✅ Good
import debounce from 'lodash-es/debounce';
```

---

## Next Actions

1. **Copy** `wrangler.toml` template and update with your account details
2. **Create** KV namespaces
3. **Set** production secrets
4. **Create** worker TypeScript files
5. **Test** locally with `wrangler dev`
6. **Deploy** to staging first
7. **Monitor** with `wrangler tail`
8. **Deploy** to production

For detailed configuration options, refer to the main guide: [CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md](./CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md)
