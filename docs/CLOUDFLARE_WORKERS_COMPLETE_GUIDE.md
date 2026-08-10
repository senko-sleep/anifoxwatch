# Complete Guide: Configuring Cloudflare Workers for Complex API Interactions

## Table of Contents
1. [Prerequisites & Setup](#prerequisites--setup)
2. [Understanding wrangler.toml](#understanding-wranglertoml)
3. [Environment Variable & Secret Management](#environment-variable--secret-management)
4. [Structured Source Code Architecture](#structured-source-code-architecture)
5. [Service Bindings & Dependencies](#service-bindings--dependencies)
6. [Advanced Patterns for Multiple API Calls](#advanced-patterns-for-multiple-api-calls)
7. [Deployment & Best Practices](#deployment--best-practices)
8. [Monitoring & Debugging](#monitoring--debugging)

---

## Prerequisites & Setup

### 1. Install Wrangler CLI
```bash
npm install -g @cloudflare/wrangler
# or
npm install -D wrangler
```

### 2. Authenticate with Cloudflare
```bash
wrangler login
# This opens your browser to authenticate. Your credentials are stored locally in ~/.wrangler/config.toml
```

### 3. Verify Authentication
```bash
wrangler whoami
# Output: You are logged in with an API token
# Account ID: xxxxxxxxxxxxxxxxxxxxx
```

### 4. Create Project Structure
```bash
# Option A: Start from scratch
wrangler init my-worker --type ts

# Option B: Use existing project (your case)
cd server
npm install wrangler --save-dev
```

---

## Understanding wrangler.toml

### Comprehensive Configuration Template

```toml
# ============================================================================
# BASIC WORKER CONFIGURATION
# ============================================================================

# Worker name and entry point
name = "anifoxwatch-api"
main = "dist/worker.js"                    # Entry point after build
type = "service"                           # "service" for HTTP workers, "analytics" for tail consumers

# Compatibility settings (required for Node.js features)
compatibility_date = "2024-09-23"          # Date when Cloudflare stabilized APIs
compatibility_flags = ["nodejs_compat"]    # Enable Node.js compatibility layer

# Build configuration
build = { command = "npm run build", watch_paths = ["src/**/*.ts"] }
main = "dist/worker.js"
outdir = "dist"

# ============================================================================
# DEPLOYMENT & HOSTING
# ============================================================================

workers_dev = true                         # Deploy to {worker-name}.{username}.workers.dev

[env.production]
name = "anifoxwatch-api-prod"
routes = [
  { pattern = "api.anifoxwatch.com/*", zone_name = "anifoxwatch.com" }
]

[env.staging]
name = "anifoxwatch-api-staging"
routes = [
  { pattern = "staging-api.anifoxwatch.com/*", zone_name = "anifoxwatch.com" }
]

# ============================================================================
# ENVIRONMENT VARIABLES (Non-sensitive, bound at deploy time)
# ============================================================================

[vars]
NODE_ENV = "production"
LOG_LEVEL = "info"
API_VERSION = "1.0.0"
WORKER_ENVIRONMENT = "cloudflare"

# External service URLs (public endpoints)
HIANIME_REST_URL = "https://aniwatch-api-coral-seven.vercel.app"
ANILIST_API_URL = "https://graphql.anilist.co"

# Timeout configurations (milliseconds)
STREAMING_TIMEOUT = "30000"
DUB_PATIENCE_MS = "25000"
GLOBAL_TIMEOUT_MS = "60000"

# Feature flags
ENABLE_CACHING = "true"
ENABLE_COMPRESSION = "true"
ENABLE_REQUEST_LOGGING = "true"

# Performance settings
MAX_CONCURRENT_REQUESTS = "50"
CIRCUIT_BREAKER_THRESHOLD = "5"

[env.production.vars]
LOG_LEVEL = "warn"
API_VERSION = "1.0.0"
ENABLE_DETAILED_LOGGING = "false"

[env.staging.vars]
LOG_LEVEL = "debug"
API_VERSION = "1.0.0-beta"
ENABLE_DETAILED_LOGGING = "true"

# ============================================================================
# SECRETS MANAGEMENT (Sensitive data, handled by Wrangler)
# ============================================================================
# These are referenced by name and injected at runtime
# Set via: wrangler secret put SECRET_NAME --env production
# See section: "Environment Variable & Secret Management" for detailed setup

# Format: [env.{environment}]
# Add secret bindings (no values here, managed separately)

# ============================================================================
# KV NAMESPACE BINDINGS (Distributed Cache)
# ============================================================================

[[kv_namespaces]]
binding = "CACHE"                          # Name in Worker code: env.CACHE
id = "abc123def456..."                     # Namespace ID from Cloudflare Dashboard
preview_id = "abc123def456-preview"        # Preview namespace for development

[[kv_namespaces]]
binding = "SESSION_STORE"
id = "xyz789..."
preview_id = "xyz789-preview"

[env.production.kv_namespaces]
[[env.production.kv_namespaces]]
binding = "CACHE"
id = "prod-kv-id-here"

[env.staging.kv_namespaces]
[[env.staging.kv_namespaces]]
binding = "CACHE"
id = "staging-kv-id-here"

# ============================================================================
# DURABLE OBJECTS (Persistent state across requests)
# ============================================================================

[[durable_objects.bindings]]
name = "REQUEST_COUNTER"                   # Name in Worker code: env.REQUEST_COUNTER
class_name = "Counter"                     # Class defined in src/durable-objects/counter.ts
script_name = "anifoxwatch-api"

[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"
script_name = "anifoxwatch-api"

[env.production.durable_objects]
bindings = [
  { name = "REQUEST_COUNTER", class_name = "Counter", script_name = "anifoxwatch-api-prod" }
]

# ============================================================================
# SERVICE BINDINGS (Call other Workers)
# ============================================================================

[[services]]
binding = "AUTH_WORKER"                    # Name in code: env.AUTH_WORKER
service = "auth-service"
environment = "production"

[[services]]
binding = "PROXY_WORKER"
service = "stream-proxy-service"
environment = "production"

# ============================================================================
# ANALYTICS ENGINE (Event logging & monitoring)
# ============================================================================

[analytics]
enabled = true

[observability]
enabled = true

# ============================================================================
# TRIGGERS & CRON JOBS
# ============================================================================

[triggers]
# Run a scheduled task every day at 2 AM UTC
crons = ["0 2 * * *"]

# ============================================================================
# NODE.JS COMPATIBILITY & POLYFILLS
# ============================================================================

[nodejs_compat]
# Enables Node.js built-in modules:
# - stream, buffer, util, path, crypto, fs (limited), events, etc.

# ============================================================================
# BUILD CONFIGURATION
# ============================================================================

[build]
command = "npm run build"
cwd = "./"
watch_paths = ["src/**/*.ts"]

# Custom build watch directories
watch = true

# ============================================================================
# LIMITS & QUOTAS
# ============================================================================

# CPU timeout per request
cpu_ms = 50                                # Max 50ms CPU time (default: 50ms for free tier)
                                           # Bundled Plans: up to 400ms

# Memory allocation
memory_mb = 128                            # Default: 128MB (can vary by plan)

# Limits configuration
limits = { cpu_ms = 50 }

# ============================================================================
# DEVELOPMENT & DEBUGGING
# ============================================================================

[env.development]
name = "anifoxwatch-api-dev"
workers_dev = true

[env.development.vars]
NODE_ENV = "development"
LOG_LEVEL = "debug"
DEBUG = "true"
API_VERSION = "0.0.0-dev"

# Local development with local.json overrides
# Create local.wrangler.toml for local secrets

# ============================================================================
# MIGRATIONS (Schema changes, if using D1 database)
# ============================================================================

[[migrations]]
tag = "v1"
new = true
path = "migrations"

# ============================================================================
# TEXT BLOBS (Inline small assets)
# ============================================================================

[[text_blobs]]
binding = "CONFIG"
path = "config/worker-config.json"

# ============================================================================
# UNSAFE BINDINGS (For advanced use cases)
# ============================================================================

[[unsafe.bindings]]
name = "RAW_SOCKET"
type = "rpc"
service = "raw-socket-service"

# ============================================================================
# ADDITIONAL SETTINGS
# ============================================================================

# Automatically minify JavaScript
minify = true

# Source maps for debugging
sourcemap = true

# Define environment-specific settings
env_groups = [
  { name = "production", environments = ["prod"] },
  { name = "staging", environments = ["staging"] }
]
```

### Key Sections Explained

| Section | Purpose | Example |
|---------|---------|---------|
| `vars` | Public environment variables | API URLs, feature flags, timeouts |
| `secrets` | Sensitive variables (set separately) | API keys, database credentials |
| `kv_namespaces` | Distributed cache storage | Session data, API response caching |
| `durable_objects` | Persistent state (state machine) | Rate limiting, counters, locks |
| `services` | Communication between Workers | Auth service, proxy service |
| `triggers.crons` | Scheduled tasks | Daily cleanup, health checks |

---

## Environment Variable & Secret Management

### Step 1: Create Local Configuration Files

#### `.wrangler/config.json` (Local Authentication)
```json
{
  "api_token": "Bearer YOUR_API_TOKEN",
  "account_id": "YOUR_ACCOUNT_ID"
}
```

#### `.env.cloudflare.example` (Template for team)
```env
# ============================================================================
# NODE ENVIRONMENT
# ============================================================================
NODE_ENV=production
LOG_LEVEL=info
DEBUG=false

# ============================================================================
# EXTERNAL API ENDPOINTS
# ============================================================================
HIANIME_REST_URL=https://aniwatch-api-coral-seven.vercel.app
ANILIST_API_URL=https://graphql.anilist.co
CONSUMET_API_URL=https://api.consumet.org
JIKAN_API_URL=https://api.jikan.moe/v4

# ============================================================================
# API KEYS & SECRETS (Set via `wrangler secret put`)
# ============================================================================
# CLOUDFLARE_API_TOKEN=xxx
# CLOUDFLARE_ZONE_ID=xxx
# ANILIST_API_KEY=xxx
# EXTERNAL_SERVICE_API_KEY=xxx
# DATABASE_URL=xxx

# ============================================================================
# TIMEOUT CONFIGURATIONS
# ============================================================================
STREAMING_TIMEOUT=30000
DUB_PATIENCE_MS=25000
GLOBAL_TIMEOUT_MS=60000
API_CALL_TIMEOUT=15000

# ============================================================================
# PERFORMANCE & RELIABILITY
# ============================================================================
MAX_CONCURRENT_REQUESTS=50
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=60000
RATE_LIMIT_REQUESTS_PER_MINUTE=1000

# ============================================================================
# FEATURE FLAGS
# ============================================================================
ENABLE_CACHING=true
ENABLE_COMPRESSION=true
ENABLE_REQUEST_LOGGING=true
ENABLE_DETAILED_LOGGING=false
ENABLE_RATE_LIMITING=true

# ============================================================================
# CLOUDFLARE WORKERS SETTINGS
# ============================================================================
WORKER_NAME=anifoxwatch-api
WORKER_ENVIRONMENT=cloudflare
ENABLE_OBSERVABILITY=true
```

#### `.env.local` (Your local development)
```env
# Copy from .env.cloudflare.example and customize
NODE_ENV=development
LOG_LEVEL=debug
DEBUG=true
ENABLE_DETAILED_LOGGING=true
```

### Step 2: Set Environment Variables in wrangler.toml

```toml
[vars]
NODE_ENV = "production"
LOG_LEVEL = "info"
HIANIME_REST_URL = "https://aniwatch-api-coral-seven.vercel.app"
ANILIST_API_URL = "https://graphql.anilist.co"
STREAMING_TIMEOUT = "30000"
DUB_PATIENCE_MS = "25000"
ENABLE_CACHING = "true"
ENABLE_COMPRESSION = "true"
```

**In Worker code, access via:**
```typescript
interface Env {
  NODE_ENV: string;
  HIANIME_REST_URL: string;
  ANILIST_API_URL: string;
  STREAMING_TIMEOUT: string;
  DUB_PATIENCE_MS: string;
  ENABLE_CACHING: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const timeout = parseInt(env.STREAMING_TIMEOUT, 10);
    const apiUrl = env.HIANIME_REST_URL;
  }
};
```

### Step 3: Set Secrets (Sensitive Data)

#### Interactive Setup
```bash
# Production environment
wrangler secret put CLOUDFLARE_API_TOKEN --env production
# Prompts for value, encrypts locally

wrangler secret put DATABASE_URL --env production
wrangler secret put ANILIST_API_KEY --env production
wrangler secret put EXTERNAL_SERVICE_KEY --env production

# Staging environment
wrangler secret put CLOUDFLARE_API_TOKEN --env staging
```

#### Bulk Setup via JSON
```bash
# Create secrets.json
cat > secrets.json << 'EOF'
{
  "CLOUDFLARE_API_TOKEN": "token_value",
  "DATABASE_URL": "postgres://user:pass@host/db",
  "ANILIST_API_KEY": "key_value"
}
EOF

# Load all secrets
jq -r 'to_entries | .[] | "\(.key)=\(.value)"' secrets.json | while read line; do
  key=$(echo $line | cut -d'=' -f1)
  value=$(echo $line | cut -d'=' -f2-)
  wrangler secret put "$key" --env production <<< "$value"
done

# Clean up
rm secrets.json
```

#### View Configured Secrets
```bash
# List secrets (doesn't show values, only names)
wrangler secret list --env production

# Verify a secret exists
wrangler secret list --env production | grep DATABASE_URL
```

### Step 4: Access Secrets in Worker Code

```typescript
interface Env {
  // Variables (public, in wrangler.toml)
  HIANIME_REST_URL: string;
  STREAMING_TIMEOUT: string;
  
  // Secrets (sensitive, set via wrangler secret put)
  CLOUDFLARE_API_TOKEN: string;
  DATABASE_URL: string;
  ANILIST_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env) {
    // Access variables
    const timeout = parseInt(env.STREAMING_TIMEOUT, 10);
    
    // Access secrets (never logged or exposed in responses)
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    const dbUrl = env.DATABASE_URL;
    
    // Use them safely
    const headers = new Headers({
      'Authorization': `Bearer ${apiToken}`
    });
    
    return new Response('OK');
  }
};
```

### Step 5: Different Secrets per Environment

```bash
# Production secrets
wrangler secret put API_KEY --env production
# Enter: prod_key_12345

# Staging secrets
wrangler secret put API_KEY --env staging
# Enter: staging_key_abcde

# Local development (in .dev.vars file)
cat > .dev.vars << 'EOF'
API_KEY=dev_key_local
DATABASE_URL=sqlite:///local.db
EOF
```

### Step 6: Best Practices for Secrets

```typescript
// ✅ Good: Validate secrets exist
if (!env.CLOUDFLARE_API_TOKEN) {
  throw new Error('CLOUDFLARE_API_TOKEN secret not configured');
}

// ❌ Bad: Never log secrets
console.log('API Key:', env.CLOUDFLARE_API_TOKEN); // DON'T DO THIS

// ✅ Good: Validate secret format
function validateDatabaseUrl(url: string): boolean {
  try {
    new URL(url);
    return url.startsWith('postgres://') || url.startsWith('postgresql://');
  } catch {
    return false;
  }
}

if (!validateDatabaseUrl(env.DATABASE_URL)) {
  throw new Error('DATABASE_URL invalid format');
}

// ✅ Good: Rotate secrets periodically
// 1. Create new secret with _v2 suffix
// wrangler secret put API_KEY_V2 --env production
// 2. Update code to use API_KEY_V2
// 3. Monitor logs for old API_KEY usage
// 4. After 30 days, remove old secret
```

---

## Structured Source Code Architecture

### Recommended Project Structure

```
server/
├── src/
│   ├── index.ts                      # Express entry point (for local dev)
│   ├── worker.ts                     # Cloudflare Worker entry point
│   ├── worker-modular.ts             # Alternative modular Worker impl
│   │
│   ├── routes/                       # Route handlers (Express)
│   │   ├── anime.ts
│   │   ├── streaming.ts
│   │   ├── sources.ts
│   │   └── monitoring.ts
│   │
│   ├── routes-worker/                # Route handlers (Hono for Workers)
│   │   ├── anime-routes.ts
│   │   ├── streaming-routes.ts
│   │   ├── sources-routes.ts
│   │   └── hianime-rest-proxy-routes.ts
│   │
│   ├── services/                     # Business logic & API calls
│   │   ├── source-manager.ts         # Orchestrates multiple anime sources
│   │   ├── anilist-service.ts        # AniList API interactions
│   │   ├── streaming-resolver.ts     # Stream resolution logic
│   │   ├── hianime-rest-fallback.ts  # Fallback for HiAnime
│   │   ├── cache-service.ts          # Caching layer (KV or in-memory)
│   │   ├── rate-limiter.ts           # Rate limiting service
│   │   └── circuit-breaker.ts        # Fault tolerance
│   │
│   ├── lib/                          # Utilities & helpers
│   │   ├── db.ts                     # Database connection (if using D1)
│   │   ├── axios-client.ts           # Pre-configured axios instance
│   │   ├── fetch-wrapper.ts          # Fetch with timeout & retries
│   │   └── batch-processor.ts        # Process multiple concurrent calls
│   │
│   ├── middleware/                   # Express middleware
│   │   ├── error-handler.ts
│   │   ├── request-logger.ts
│   │   ├── reliability.ts
│   │   └── cors.ts
│   │
│   ├── utils/                        # Utility functions
│   │   ├── logger.ts                 # Structured logging
│   │   ├── validators.ts
│   │   ├── hianime-rest-servers.ts
│   │   └── retry-logic.ts
│   │
│   ├── types/                        # TypeScript interfaces
│   │   ├── api.ts
│   │   ├── streaming.ts
│   │   └── worker.ts
│   │
│   ├── durable-objects/              # Cloudflare Durable Objects
│   │   ├── rate-limiter.ts
│   │   └── request-counter.ts
│   │
│   ├── config/                       # Configuration
│   │   ├── api-sources.ts            # Registered anime sources
│   │   ├── timeout-config.ts         # Timeout values
│   │   └── feature-flags.ts
│   │
│   └── polyfills.ts                  # Node.js compatibility
│
├── wrangler.toml                     # Cloudflare Workers config
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.cloudflare.example
└── .dev.vars                         # Local secrets for wrangler dev
```

### Key Architecture Principles

#### 1. **Separation of Concerns**
- **Routes**: Handle HTTP request/response
- **Services**: Business logic and external API calls
- **Utils**: Reusable functions (logging, retry, validation)
- **Config**: Static configuration

#### 2. **Worker-Specific Considerations**

```typescript
// src/worker.ts - Entry point for Cloudflare Workers
import { Hono } from 'hono';
import { logger } from './utils/logger.js';
import { SourceManager } from './services/source-manager.js';

export interface Env {
  // Environment variables
  NODE_ENV: string;
  HIANIME_REST_URL: string;
  STREAMING_TIMEOUT: string;
  
  // Secrets
  ANILIST_API_KEY: string;
  
  // KV Namespaces
  CACHE: KVNamespace;
  SESSION_STORE: KVNamespace;
  
  // Durable Objects
  REQUEST_COUNTER: DurableObjectNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  
  // Service bindings
  AUTH_WORKER: Fetcher;
  PROXY_WORKER: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

// Global SourceManager instance (reused across requests)
let sourceManager: SourceManager | null = null;

function getSourceManager(env: Env): SourceManager {
  if (!sourceManager) {
    sourceManager = new SourceManager({
      cache: env.CACHE,
      timeout: parseInt(env.STREAMING_TIMEOUT, 10)
    });
  }
  return sourceManager;
}

// Example route using environment
app.get('/api/anime/search', async (c) => {
  const env = c.env as Env;
  const query = c.req.query('q');
  
  const sourceManager = getSourceManager(env);
  const results = await sourceManager.search(query);
  
  return c.json(results);
});

export default app;
```

#### 3. **API Call Orchestration Pattern**

```typescript
// src/services/source-manager.ts
export class SourceManager {
  private cache: KVNamespace;
  private timeout: number;
  private circuitBreaker: CircuitBreaker;

  constructor(options: { cache?: KVNamespace; timeout: number }) {
    this.cache = options.cache!;
    this.timeout = options.timeout;
    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeout: 60000
    });
  }

  async search(
    query: string,
    page: number = 1,
    source?: string,
  ): Promise<SearchResult[]> {
    // 1. Check cache
    const cacheKey = `search:${source}:${query}:${page}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 2. Parallel requests to multiple sources
    const sources = source ? [source] : ['9Anime', 'Aniwave', 'Aniwatch'];
    
    const results = await Promise.allSettled(
      sources.map(src => 
        this.circuitBreaker.execute(() =>
          this.searchSingleSource(src, query, page)
        )
      )
    );

    // 3. Aggregate results (handle partial failures)
    const allResults = results
      .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);

    // 4. Deduplicate and sort
    const deduplicated = this.deduplicateResults(allResults);
    const sorted = deduplicated.sort((a, b) => b.score - a.score);

    // 5. Cache and return
    await this.cache.put(cacheKey, JSON.stringify(sorted), {
      expirationTtl: 3600 // 1 hour
    });

    return sorted;
  }

  private async searchSingleSource(
    source: string,
    query: string,
    page: number
  ): Promise<SearchResult[]> {
    const timeout = this.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      switch (source) {
        case '9Anime':
          return await this.search9Anime(query, page, controller.signal);
        case 'Aniwave':
          return await this.searchAniwave(query, page, controller.signal);
        case 'Aniwatch':
          return await this.searchAniwatch(query, page, controller.signal);
        default:
          return [];
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async search9Anime(
    query: string,
    page: number,
    signal: AbortSignal
  ): Promise<SearchResult[]> {
    // Implementation with retry logic
  }
}
```

---

## Service Bindings & Dependencies

### 1. KV Namespace Bindings (Distributed Cache)

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "CACHE"
id = "abc123def456"                   # Production KV ID
preview_id = "abc123def456-preview"

[[kv_namespaces]]
binding = "SESSION_STORE"
id = "xyz789abc123"
preview_id = "xyz789abc123-preview"

[env.production.kv_namespaces]
[[env.production.kv_namespaces]]
binding = "CACHE"
id = "production-kv-id"

[env.staging.kv_namespaces]
[[env.staging.kv_namespaces]]
binding = "CACHE"
id = "staging-kv-id"
```

#### Create KV Namespace
```bash
# List existing KV namespaces
wrangler kv:namespace list

# Create new KV namespace
wrangler kv:namespace create "CACHE"
# Output: Adding kv_namespace binding to wrangler.toml
# Created namespace with ID: abc123def456

# Create for preview/development
wrangler kv:namespace create "CACHE" --preview

# Create for specific environment
wrangler kv:namespace create "CACHE" --env production
```

#### Using KV in Worker Code
```typescript
export interface Env {
  CACHE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env) {
    // GET
    const cached = await env.CACHE.get('my-key');
    
    // PUT with TTL
    await env.CACHE.put('my-key', 'my-value', {
      expirationTtl: 3600 // 1 hour
    });
    
    // DELETE
    await env.CACHE.delete('my-key');
    
    // List (all keys in namespace)
    const { keys } = await env.CACHE.list();
    
    return new Response('OK');
  }
};
```

### 2. Durable Objects (Persistent State)

```toml
# wrangler.toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"
script_name = "anifoxwatch-api"

[[durable_objects.bindings]]
name = "REQUEST_COUNTER"
class_name = "Counter"
script_name = "anifoxwatch-api"
```

#### Define Durable Object
```typescript
// src/durable-objects/rate-limiter.ts
export class RateLimiter {
  private state: DurableObjectState;
  private env: Env;
  private requests: number = 0;
  private windowStart: number = Date.now();
  private readonly WINDOW_MS = 60000; // 1 minute
  private readonly LIMIT = 1000; // requests per minute

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const method = request.method;

    if (method === 'POST') {
      const { userId } = await request.json() as { userId: string };
      return this.checkLimit(userId);
    }

    return new Response('Not found', { status: 404 });
  }

  private checkLimit(userId: string): Response {
    const now = Date.now();
    
    // Reset window if expired
    if (now - this.windowStart > this.WINDOW_MS) {
      this.requests = 0;
      this.windowStart = now;
    }

    // Increment counter
    this.requests++;

    const isAllowed = this.requests <= this.LIMIT;
    const remaining = Math.max(0, this.LIMIT - this.requests);

    return new Response(JSON.stringify({
      allowed: isAllowed,
      requests: this.requests,
      remaining,
      resetIn: this.WINDOW_MS - (now - this.windowStart)
    }), {
      status: isAllowed ? 200 : 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

#### Use Durable Object in Worker
```typescript
export interface Env {
  RATE_LIMITER: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env) {
    const userId = request.headers.get('x-user-id') || 'anonymous';
    
    // Get unique Durable Object instance per user
    const id = env.RATE_LIMITER.idFromName(userId);
    const stub = env.RATE_LIMITER.get(id);
    
    // Call stub method
    const checkRequest = new Request('http://internal/check', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    
    const response = await stub.fetch(checkRequest);
    const result = await response.json() as {
      allowed: boolean;
      remaining: number;
    };
    
    if (!result.allowed) {
      return new Response('Rate limit exceeded', { status: 429 });
    }

    return new Response('Proceeding with request');
  }
};
```

### 3. Service Bindings (Call Other Workers)

```toml
# wrangler.toml

# Call an Auth Worker
[[services]]
binding = "AUTH_WORKER"
service = "auth-service"
environment = "production"

# Call a Streaming Proxy Worker
[[services]]
binding = "PROXY_WORKER"
service = "stream-proxy"
environment = "production"
```

#### Create Auth Worker
```typescript
// Create separate worker
// wrangler init auth-service

// src/auth-service/index.ts
export default {
  async fetch(request: Request) {
    const token = request.headers.get('authorization');
    
    if (!token || !token.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const tokenValue = token.slice(7);
    const isValid = await validateToken(tokenValue);

    return new Response(JSON.stringify({ valid: isValid }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function validateToken(token: string): Promise<boolean> {
  // Token validation logic
  return token.length > 20;
}
```

#### Call Service Binding
```typescript
export interface Env {
  AUTH_WORKER: Fetcher;
}

export default {
  async fetch(request: Request, env: Env) {
    // Call bound Auth Worker
    const authResponse = await env.AUTH_WORKER.fetch(
      new Request('http://internal/auth', {
        headers: { 'Authorization': request.headers.get('Authorization') || '' }
      })
    );

    const { valid } = await authResponse.json() as { valid: boolean };
    
    if (!valid) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Proceed with request
    return new Response('Authorized');
  }
};
```

### 4. External Service Integration

```typescript
// src/lib/axios-client.ts - Pre-configured HTTP client
import axios, { AxiosInstance } from 'axios';

export class ApiClient {
  private client: AxiosInstance;

  constructor(env: Env) {
    this.client = axios.create({
      timeout: parseInt(env.STREAMING_TIMEOUT, 10),
      headers: {
        'User-Agent': 'AniStream-Hub/1.0 (+https://github.com/yourname/anistream)',
      }
    });

    // Add request interceptor
    this.client.interceptors.request.use(config => {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      async error => {
        console.error(`[API Error] ${error.message}`);
        throw error;
      }
    );
  }

  async get<T>(url: string, config?: any): Promise<T> {
    const { data } = await this.client.get<T>(url, config);
    return data;
  }

  async post<T>(url: string, data?: any, config?: any): Promise<T> {
    const { data: response } = await this.client.post<T>(url, data, config);
    return response;
  }
}
```

---

## Advanced Patterns for Multiple API Calls

### 1. Parallel Requests with Timeout

```typescript
export async function fetchMultipleSourcesInParallel(
  sources: { name: string; url: string }[],
  timeout: number
): Promise<{ success: { name: string; data: any }[]; failed: string[] }> {
  const controllers = sources.map(() => new AbortController());
  const timeoutIds = controllers.map(ctrl =>
    setTimeout(() => ctrl.abort(), timeout)
  );

  try {
    const results = await Promise.allSettled(
      sources.map((src, i) =>
        fetch(src.url, { signal: controllers[i].signal })
          .then(r => r.json())
          .then(data => ({ name: src.name, data }))
      )
    );

    const success = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    const failed = results
      .map((r, i) => r.status === 'rejected' ? sources[i].name : null)
      .filter((n): n is string => n !== null);

    return { success, failed };
  } finally {
    timeoutIds.forEach(id => clearTimeout(id));
    controllers.forEach(ctrl => ctrl.abort());
  }
}
```

### 2. Sequential Fallback Pattern

```typescript
export async function resolveStreamWithFallback(
  episodeId: string,
  sources: string[],
  env: Env
): Promise<StreamingData | null> {
  for (const source of sources) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        parseInt(env.STREAMING_TIMEOUT, 10)
      );

      try {
        const result = await resolveStream(episodeId, source, controller.signal);
        if (result) return result;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error(`Failed to resolve stream from ${source}:`, error);
      continue; // Try next source
    }
  }

  return null; // All sources failed
}

async function resolveStream(
  episodeId: string,
  source: string,
  signal: AbortSignal
): Promise<StreamingData | null> {
  // Implementation for specific source
  const response = await fetch(`https://api.${source}.com/episode/${episodeId}`, {
    signal
  });

  if (!response.ok) return null;
  
  return response.json();
}
```

### 3. Request Batching & Deduplication

```typescript
export class BatchProcessor {
  private queue: Map<string, Promise<any>> = new Map();
  private batchSize: number = 10;
  private batchDelayMs: number = 50;

  async process<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // Deduplication: if same key is requested, return existing promise
    if (this.queue.has(key)) {
      return this.queue.get(key)!;
    }

    const promise = fn();
    this.queue.set(key, promise);

    // Clean up after completion
    promise.finally(() => {
      this.queue.delete(key);
    });

    return promise;
  }

  async batchFetch(
    urls: string[],
    options: { concurrency: number } = { concurrency: 5 }
  ): Promise<Response[]> {
    const results: Response[] = [];
    const errors: (Error | null)[] = [];

    for (let i = 0; i < urls.length; i += options.concurrency) {
      const batch = urls.slice(i, i + options.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(url => fetch(url))
      );

      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          errors.push(null);
        } else {
          results.push(new Response('Error', { status: 500 }));
          errors.push(result.reason);
        }
      });

      // Delay between batches to avoid overload
      if (i + options.concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
      }
    }

    return results;
  }
}
```

### 4. Circuit Breaker Pattern

```typescript
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private failureThreshold: number = 5;
  private resetTimeoutMs: number = 60000;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if we should transition to HALF_OPEN
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      
      // Success: reset on HALF_OPEN
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
      }

      throw error;
    }
  }

  getState(): string {
    return this.state;
  }
}
```

---

## Deployment & Best Practices

### 1. Build Process

```bash
# Build TypeScript to JavaScript
npm run build

# This compiles:
# - src/**/*.ts → dist/*.js
# - Preserves directory structure
# - Generates source maps for debugging
```

#### tsconfig.json (Worker-compatible)
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "WebWorker"],
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 2. Local Development

```bash
# Start local development server (wrangler dev)
wrangler dev

# The development server:
# - Watches src/ for changes
# - Rebuilds on file change
# - Runs Worker locally with full Cloudflare APIs
# - Accessible at http://localhost:8787

# Test local deployment
curl http://localhost:8787/api/anime/search?q=naruto
```

#### .dev.vars (Local Development Secrets)
```
API_KEY=dev_key_local_12345
DATABASE_URL=sqlite:///local.db
ANILIST_API_KEY=dev_anilist_key
```

### 3. Deployment

#### Step 1: Verify Configuration
```bash
# Check worker configuration
wrangler publish --dry-run

# Preview what will be deployed
wrangler publish --dry-run --env production
```

#### Step 2: Deploy to Production
```bash
# Deploy to production environment
wrangler publish --env production

# Output:
# ✓ Successfully published your Worker to
# https://anifoxwatch-api-prod.{account}.workers.dev

# Deploy to staging
wrangler publish --env staging

# Deploy with custom route
wrangler publish --env production --route api.anifoxwatch.com/*
```

#### Step 3: Verify Deployment
```bash
# Check deployed version
curl https://anifoxwatch-api-prod.{account}.workers.dev/health

# Tail logs
wrangler tail --env production

# Get deployment history
wrangler deployments list
```

#### Step 4: Rollback if Needed
```bash
# Rollback to previous deployment
wrangler deployments rollback --message "Reverting to stable version"

# View rollback history
wrangler deployments list
```

### 4. Performance Optimization

#### Enable Minification
```toml
# wrangler.toml
minify = true
sourcemap = true  # Keep sourcemaps for debugging
```

#### Reduce Bundle Size
```typescript
// ❌ Bad: Import entire library
import * as lodash from 'lodash';

// ✅ Good: Import only what you need
import { debounce } from 'lodash-es';

// ✅ Better: Use lightweight alternatives
const debounce = (fn: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};
```

#### Code Splitting for Worker Bundles
```typescript
// src/worker.ts
import { Hono } from 'hono';

const app = new Hono();

// Lazy-load heavy routes
app.get('/api/heavy', async (c) => {
  // Only import when needed
  const { heavyFunction } = await import('./heavy-module.js');
  const result = await heavyFunction();
  return c.json(result);
});

export default app;
```

### 5. Monitoring & Observability

```typescript
export interface Env {
  ANALYTICS_ENGINE: AnalyticsEngineDataset;
}

export default {
  async fetch(request: Request, env: Env) {
    const startTime = Date.now();

    try {
      const response = await handleRequest(request);
      const duration = Date.now() - startTime;

      // Log analytics event
      env.ANALYTICS_ENGINE.writeDataPoint({
        indexes: [
          request.method,
          new URL(request.url).pathname,
          response.status
        ],
        blobs: [
          request.headers.get('user-agent') || 'unknown'
        ],
        doubles: [duration]
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      env.ANALYTICS_ENGINE.writeDataPoint({
        indexes: ['ERROR', 'request', 'failed'],
        blobs: [error instanceof Error ? error.message : 'Unknown'],
        doubles: [duration]
      });

      throw error;
    }
  }
};

async function handleRequest(request: Request): Promise<Response> {
  return new Response('OK');
}
```

---

## Monitoring & Debugging

### 1. Tail Logs in Real-Time

```bash
# Stream logs from production worker
wrangler tail --env production

# Filter logs by status code
wrangler tail --format pretty --env production

# Export logs to file
wrangler tail --env production > worker-logs.txt
```

### 2. Structured Logging

```typescript
// src/utils/logger.ts
export class Logger {
  constructor(private env: Env) {}

  log(level: string, message: string, metadata?: any) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      env: this.env.NODE_ENV,
      requestId: crypto.randomUUID()
    }));
  }

  info(message: string, metadata?: any) {
    this.log('INFO', message, metadata);
  }

  error(message: string, error?: Error, metadata?: any) {
    this.log('ERROR', message, {
      errorMessage: error?.message,
      errorStack: error?.stack,
      ...metadata
    });
  }

  debug(message: string, metadata?: any) {
    if (this.env.NODE_ENV === 'development') {
      this.log('DEBUG', message, metadata);
    }
  }
}
```

### 3. Error Handling & Recovery

```typescript
export async function withErrorRecovery<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    retryDelayMs: number;
    timeout: number;
    onError?: (error: Error, attempt: number) => void;
  }
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      try {
        return await fn();
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      options.onError?.(lastError, attempt + 1);

      if (attempt < options.maxRetries) {
        // Exponential backoff
        const delay = options.retryDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}
```

### 4. Health Checks & Status Endpoints

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime?.() || 0,
        memoryUsage: process.memoryUsage?.() || {}
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/status') {
      // Detailed status check
      const checks = {
        cache: await checkCacheConnection(env),
        externalApis: await checkExternalApis(env),
        database: await checkDatabaseConnection(env)
      };

      const allHealthy = Object.values(checks).every(c => c.healthy);

      return new Response(JSON.stringify(checks), {
        status: allHealthy ? 200 : 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};

async function checkCacheConnection(env: Env): Promise<{ healthy: boolean; responseTime: number }> {
  const start = Date.now();
  try {
    await env.CACHE.put('health-check', 'OK', { expirationTtl: 10 });
    return { healthy: true, responseTime: Date.now() - start };
  } catch {
    return { healthy: false, responseTime: Date.now() - start };
  }
}

async function checkExternalApis(env: Env): Promise<{ healthy: boolean; apis: any }> {
  const start = Date.now();
  const results = {
    hianime: false,
    anilist: false,
    responseTime: 0
  };

  try {
    const [hiRes, alRes] = await Promise.all([
      fetch(env.HIANIME_REST_URL + '/health').catch(() => null),
      fetch('https://graphql.anilist.co').catch(() => null)
    ]);

    results.hianime = hiRes?.ok || false;
    results.anilist = alRes?.ok || false;
  } catch {}

  results.responseTime = Date.now() - start;
  return {
    healthy: results.hianime || results.anilist,
    apis: results
  };
}

async function checkDatabaseConnection(env: Env): Promise<{ healthy: boolean; responseTime: number }> {
  const start = Date.now();
  try {
    // Attempt simple DB query
    return { healthy: true, responseTime: Date.now() - start };
  } catch {
    return { healthy: false, responseTime: Date.now() - start };
  }
}
```

---

## Troubleshooting Common Issues

### Issue 1: Secrets Not Available in Worker
```bash
# ❌ Problem: Secret shows as undefined
# ✅ Solution: Verify secret is set
wrangler secret list --env production

# Re-set the secret
wrangler secret put API_KEY --env production

# Redeploy worker
wrangler publish --env production
```

### Issue 2: KV Namespace Not Found
```bash
# ❌ Problem: "KVNamespace binding not found"
# ✅ Solution: Verify binding in wrangler.toml

cat wrangler.toml | grep -A 3 "kv_namespaces"

# Create namespace if missing
wrangler kv:namespace create "CACHE" --env production

# Update wrangler.toml with correct ID
wrangler kv:namespace create "SESSION_STORE" --env production
```

### Issue 3: Timeout Errors in Production
```typescript
// ✅ Solution: Increase timeout for specific operations
const EXTENDED_TIMEOUT = 90000; // 90 seconds

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), EXTENDED_TIMEOUT);

try {
  const response = await fetch(url, { signal: controller.signal });
  // Handle response
} finally {
  clearTimeout(timeoutId);
}
```

### Issue 4: Memory Limits Exceeded
```typescript
// ❌ Bad: Loading entire dataset into memory
const allResults = await fetchAllPages(1, 1000);

// ✅ Good: Stream processing
async function* fetchAllPagesStreaming(startPage: number, endPage: number) {
  for (let page = startPage; page <= endPage; page++) {
    const results = await fetchPage(page);
    yield results;
    // Memory released after each yield
  }
}

for await (const page of fetchAllPagesStreaming(1, 1000)) {
  console.log(`Processing ${page.length} items`);
  // Process and discard before next iteration
}
```

---

## Complete Example: Deploy Complex API Project

### Final wrangler.toml
```toml
name = "anifoxwatch-api"
main = "dist/worker.js"
type = "service"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

workers_dev = true
minify = true
sourcemap = true

[build]
command = "npm run build"
cwd = "./"

[vars]
NODE_ENV = "production"
LOG_LEVEL = "info"
HIANIME_REST_URL = "https://aniwatch-api-coral-seven.vercel.app"
ANILIST_API_URL = "https://graphql.anilist.co"
STREAMING_TIMEOUT = "30000"
DUB_PATIENCE_MS = "25000"
ENABLE_CACHING = "true"

[[kv_namespaces]]
binding = "CACHE"
id = "abc123def456"
preview_id = "abc123def456-preview"

[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"
script_name = "anifoxwatch-api"

[[services]]
binding = "AUTH_WORKER"
service = "auth-service"
environment = "production"

[env.production]
name = "anifoxwatch-api-prod"

[env.production.vars]
LOG_LEVEL = "warn"

[env.production.kv_namespaces]
[[env.production.kv_namespaces]]
binding = "CACHE"
id = "prod-kv-id"

[env.staging]
name = "anifoxwatch-api-staging"

[env.staging.vars]
LOG_LEVEL = "debug"

[env.staging.kv_namespaces]
[[env.staging.kv_namespaces]]
binding = "CACHE"
id = "staging-kv-id"
```

### Deployment Checklist
- [ ] Configure `wrangler.toml` with correct values
- [ ] Create KV namespaces: `wrangler kv:namespace create "CACHE" --env production`
- [ ] Set secrets: `wrangler secret put ANILIST_API_KEY --env production`
- [ ] Build project: `npm run build`
- [ ] Test locally: `wrangler dev`
- [ ] Dry-run deployment: `wrangler publish --dry-run --env production`
- [ ] Deploy: `wrangler publish --env production`
- [ ] Verify: `curl https://anifoxwatch-api-prod.{account}.workers.dev/health`
- [ ] Monitor logs: `wrangler tail --env production`

---

## Next Steps

1. **Review** your current `wrangler.toml` against the template above
2. **Create** KV namespaces for caching
3. **Set** all required secrets using `wrangler secret put`
4. **Test** locally with `wrangler dev`
5. **Deploy** to staging first with `wrangler publish --env staging`
6. **Monitor** with `wrangler tail` for issues
7. **Deploy** to production with `wrangler publish --env production`

For more information:
- [Wrangler Official Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Workers API Reference](https://developers.cloudflare.com/workers/runtime-apis/)
- [Best Practices Guide](https://developers.cloudflare.com/workers/platform/deployment-trim-sizes/)
