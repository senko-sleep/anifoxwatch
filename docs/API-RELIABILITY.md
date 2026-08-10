# API Reliability & "Safe Latch" Documentation

This document describes the reliability mechanisms implemented to ensure the API is fast, smooth, and effective without randomly breaking or flaking out on users.

## Architecture Overview

The project uses a **hybrid deployment strategy** with multiple layers of reliability protection:

### Primary API (Cloudflare Workers)
- **URL**: `https://anifoxwatch-api.anya-bot.workers.dev`
- **Framework**: Hono (no cold starts)
- **Responsibilities**: 
  - Metadata (AniList)
  - Search, trending, browse, schedule
  - Image proxy
  - HLS proxy
  - Source-prefixed anime IDs (consumet-*, watchhentai-*, hanime-*, gogoplay-*)

### Fallback API (Render)
- **URL**: `https://anifoxwatch-sm7s.onrender.com`
- **Framework**: Express + Puppeteer
- **Responsibilities**:
  - Streaming links extraction (Puppeteer-dependent)
  - Source-prefixed anime IDs (allanime-*, animekai-*, 9anime-*, kaido-*, akih-*)

### Frontend API Client
- **Primary**: CF Worker
- **Fallback**: Render (automatic switch on failure)
- **Cache**: Intelligent TTL-based caching
- **Deduplication**: In-flight request deduplication

## Reliability Layers

### Layer 1: Cloudflare Workers Reliability Utility

**File**: `server/src/utils/workers-reliability.ts`

This utility provides Workers-compatible reliability patterns (no Node.js dependencies):

#### Circuit Breaker Pattern
- **Purpose**: Prevents cascading failures by temporarily stopping requests to failing sources
- **Configuration**:
  - `maxFailures`: 5 (allows transient errors before tripping)
  - `resetTime`: 15s (fast recovery from brief outages)
  - `timeout`: 8s (instant feedback on failures)
- **States**:
  - `closed`: Normal operation, requests allowed
  - `open`: Circuit tripped, requests rejected
  - `half-open`: Testing if source has recovered

#### Retry with Exponential Backoff
- **Purpose**: Handles transient network errors
- **Configuration**:
  - `maxAttempts`: 2-3 (prevents infinite retry loops)
  - `initialDelay`: 1000ms
  - `backoff`: Exponential (delay doubles each retry)
- **Behavior**: Retries on network errors, timeouts, and 5xx errors

#### Timeout Protection
- **Purpose**: Prevents hanging requests
- **Configuration**: 8-15s depending on operation type
- **Behavior**: Aborts request after timeout, allows fallback to trigger

### Layer 2: Cloudflare Worker Routes

**File**: `server/src/worker-modular.ts`

All HiAnime routes now wrapped with reliability protection:

```typescript
// Before (no protection)
const data = await hianime.search(query, page);

// After (with retry + timeout + circuit breaker)
const data = await reliableRequest(
    'HiAnime',
    'search',
    () => hianime.search(query, page),
    { maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
);
```

**Protected Routes**:
- `/api/home` - getHomePage (10s timeout)
- `/api/search` - search (10s timeout)
- `/api/azlist/:sortOption` - getAZList (10s timeout)
- `/api/qtip/:animeId` - getQtipInfo (10s timeout)
- `/api/category/:name` - getCategoryAnime (10s timeout)
- `/api/genre/:name` - getGenreAnime (10s timeout)
- `/api/producer/:name` - getProducerAnimes (10s timeout)
- `/api/schedule` - getEstimatedSchedule (10s timeout)
- `/api/search/suggestion` - searchSuggestions (10s timeout)
- `/api/hianime/:animeId` - getInfo (10s timeout)
- `/api/episode/servers` - getEpisodeServers (10s timeout)
- `/api/episode/sources` - getEpisodeSources (15s timeout)
- `/api/hianime/:animeId/episodes` - getEpisodes (10s timeout)
- `/api/hianime/:animeId/next-episode-schedule` - getNextEpisodeSchedule (10s timeout)

### Layer 3: Cloudflare Source Manager

**File**: `server/src/services/source-manager-cloudflare.ts`

Streaming link extraction enhanced with circuit breaker:

```typescript
async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub') {
    // Check circuit breaker before attempting
    if (isCircuitBreakerOpen(source.name)) {
        // Skip to fallback immediately
        return tryFallback();
    }
    
    try {
        const streamData = await source.getStreamingLinks(...);
        recordSuccess(source.name);
        return streamData;
    } catch (error) {
        recordFailure(source.name);
        return tryFallback();
    }
}
```

**Behavior**:
1. Check circuit breaker state before attempting request
2. If open, skip to fallback immediately (no wasted time)
3. On success, record success and reset circuit
4. On failure, record failure and increment circuit
5. After 5 failures, circuit opens for 15s
6. Automatic fallback to CloudflareConsumet if primary fails

### Layer 4: Streaming Routes

**File**: `server/src/routes-worker/streaming-routes.ts`

Render proxy calls now include retry logic:

```typescript
async function proxyToRender(path: string, timeoutMs = 120_000): Promise<Response> {
    return await retryWithBackoff(
        async () => {
            const resp = await fetch(`${RENDER_BACKEND_URL}${path}`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' },
            });
            return processResponse(resp);
        },
        2, // maxAttempts
        2000, // initialDelay
        'proxyToRender'
    );
}
```

**Behavior**:
- Retries Render proxy calls on failure
- 2 attempts with 2s initial delay
- 120s timeout for Puppeteer operations
- Dead domain filtering (prevents requests to known bad CDNs)

### Layer 5: Frontend API Client

**File**: `src/lib/api-client.ts`

Already has comprehensive reliability:

- **Retry Logic**: MAX_RETRIES = 2 with exponential backoff
- **Timeout**: TIMEOUT_MS = 25000 (25s)
- **Fallback**: Automatic switch between CF Worker and Render
- **Cache**: Intelligent TTL-based caching (2-15min depending on endpoint)
- **Deduplication**: In-flight request deduplication
- **Offline Detection**: Prevents requests when offline
- **CORS Handling**: Special handling for Render cold starts

**Fallback TTL**: 5 minutes (after switching to fallback, stays on fallback for 5min before retrying primary)

## Health Monitoring

### Health Check Endpoint

**URL**: `/health`

**Response**:
```json
{
    "status": "healthy",
    "environment": "cloudflare-workers",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "version": "1.0.0-modular",
    "circuitBreakers": [
        {
            "name": "HiAnime",
            "state": "closed",
            "failureCount": 0,
            "lastAttemptTime": "2024-01-15T10:30:00.000Z",
            "lastFailureTime": null,
            "resetTimeRemaining": 0
        },
        {
            "name": "CloudflareConsumet",
            "state": "closed",
            "failureCount": 0,
            "lastAttemptTime": "2024-01-15T10:30:00.000Z",
            "lastFailureTime": null,
            "resetTimeRemaining": 0
        }
    ]
}
```

### Circuit Breaker States

- **closed**: Normal operation, requests allowed
- **open**: Circuit tripped, requests rejected, waiting for reset
- **half-open**: Testing if source has recovered

## Failure Scenarios & Mitigation

### Scenario 1: Transient Network Error
1. Request fails with network error
2. Retry with exponential backoff (1s, then 2s)
3. If still fails, try fallback API
4. If fallback succeeds, switch to fallback for 5min
5. After 5min, retry primary

### Scenario 2: Source Timeout
1. Request times out after 8-15s
2. Circuit breaker records failure
3. Retry with exponential backoff
4. After 5 failures, circuit opens for 15s
5. All requests skip to fallback during open state
6. After 15s, circuit moves to half-open
7. Next success resets circuit to closed

### Scenario 3: Render Cold Start
1. Render free-tier cold start causes CORS error
2. Frontend detects CORS/network error
3. Retries with longer delay (3s for first attempt)
4. Eventually succeeds when Render is ready
5. Frontend switches to fallback for 5min to avoid repeated cold starts

### Scenario 4: Streaming Source Failure
1. Primary streaming source fails
2. Circuit breaker records failure
3. Immediate fallback to CloudflareConsumet
4. If fallback succeeds, return stream
5. If fallback also fails, return empty sources
6. User can try different server in UI

## Deployment & Monitoring

### Deploying Changes

**Cloudflare Workers**:
```bash
cd server
npx wrangler deploy
```

**Render**:
```bash
# Auto-deploys on push to main
# Or manual deploy via Render dashboard
```

### Monitoring Recommendations

1. **Health Checks**: Monitor `/health` endpoint every 30s
2. **Circuit Breaker States**: Alert if any circuit stays open > 1min
3. **Error Rates**: Alert if error rate > 5% for any endpoint
4. **Latency**: Alert if p95 latency > 5s
5. **Fallback Usage**: Alert if fallback usage > 20%

### Logging

All reliability events are logged:
- Circuit breaker trips/resets
- Retry attempts
- Timeout events
- Fallback switches
- Source health changes

## Configuration

### Tuning Circuit Breaker

Edit `server/src/utils/workers-reliability.ts`:

```typescript
const DEFAULT_CIRCUIT_SETTINGS = {
    maxFailures: 5,        // Increase for more tolerance
    resetTime: 15000,      // Increase for longer recovery time
    timeout: 8000          // Increase for slower sources
};
```

### Tuning Timeouts

Edit route-specific timeouts in `server/src/worker-modular.ts`:

```typescript
{ maxAttempts: 2, timeout: 10000, retryDelay: 1000 }
```

### Tuning Frontend

Edit `src/lib/api-client.ts`:

```typescript
private readonly MAX_RETRIES = 2;
private readonly TIMEOUT_MS = 25000;
private readonly FALLBACK_TTL = 5 * 60 * 1000; // 5 min
```

## Summary

The API now has **multiple layers of protection** against random failures:

1. **Circuit Breaker**: Prevents cascading failures
2. **Retry Logic**: Handles transient errors
3. **Timeout Protection**: Prevents hanging requests
4. **Automatic Fallback**: Switches to backup API on failure
5. **Intelligent Caching**: Reduces load and improves speed
6. **Request Deduplication**: Prevents duplicate in-flight requests
7. **Health Monitoring**: Real-time visibility into system health

This creates a "safe latch" mechanism where the API will not randomly fail - it will retry, fallback, and degrade gracefully rather than flaking out on users.
