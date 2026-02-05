# Cloudflare Workers Deployment Guide

This guide explains how to deploy the Aniwatch API to Cloudflare Workers.

## Prerequisites

1. **Cloudflare Account**: Create a free account at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install it globally with `npm install -g wrangler`
3. **Node.js**: Version 18 or higher

## Quick Start

### 1. Install Dependencies

```bash
cd functions/src/aniwatch-api
npm install
```

### 2. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Required for Cloudflare Workers
ANIWATCH_API_DEPLOYMENT_ENV=cloudflare-workers
NODE_ENV=production

# Optional: Rate limiting configuration
ANIWATCH_API_WINDOW_MS=1800000  # 30 minutes
ANIWATCH_API_MAX_REQS=1000      # requests per window

# Optional: CORS configuration
ANIWATCH_API_CORS_ALLOWED_ORIGINS=https://your-domain.com

# Optional: Redis for caching (requires external Redis)
# ANIWATCH_API_REDIS_CONN_URL=rediss://...
```

### 3. Login to Cloudflare

```bash
npx wrangler login
```

### 4. Test Locally

```bash
npm run cf:dev
```

This will start a local development server at `http://localhost:8787`.

### 5. Deploy to Cloudflare

```bash
npm run cf:deploy
```

Your API will be available at `https://aniwatch-api.<your-subdomain>.workers.dev`

## Custom Domain Setup

To use a custom domain:

1. Add your domain to Cloudflare
2. Update `wrangler.toml`:

```toml
[[routes]]
pattern = "api.yourdomain.com/*"
zone_name = "yourdomain.com"
```

3. Redeploy with `npm run cf:deploy`

## Free Tier Limitations

- **CPU Time**: 10ms (free) / 50ms (paid)
- **Requests**: 100,000 per day (free)
- **Memory**: 128MB
- **No WebSockets**: Use polling instead

For production, consider upgrading to paid plan for higher limits.

## Caching

### Option 1: Built-in Caching (Default)
The API uses built-in caching. No additional configuration needed.

### Option 2: Cloudflare KV (Advanced)
For persistent caching, set up a KV namespace:

```bash
npx wrangler kv:namespace create ANIWATCH_CACHE
```

Add the binding to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
```

### Option 3: Redis (External)
For distributed caching, configure an external Redis:

```env
ANIWATCH_API_REDIS_CONN_URL=rediss://default:password@hostname.redis.cloud.com:6379
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANIWATCH_API_DEPLOYMENT_ENV` | Must be `cloudflare-workers` | `nodejs` |
| `ANIWATCH_API_WINDOW_MS` | Rate limit window | `1800000` (30 min) |
| `ANIWATCH_API_MAX_REQS` | Max requests per window | `1000` |
| `ANIWATCH_API_S_MAXAGE` | Cache s-maxage (seconds) | `300` |
| `ANIWATCH_API_STALE_WHILE_REVALIDATE` | Stale while revalidate | `60` |
| `ANIWATCH_API_CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins | `*` |
| `ANIWATCH_API_REDIS_CONN_URL` | Redis connection URL | (none) |

## API Endpoints

After deployment, the API will be available at:

- `https://<worker-url>/api/v2/hianime/home`
- `https://<worker-url>/api/v2/hianime/search?q=...`
- `https://<worker-url>/api/v2/hianime/anime/...`
- `https://<worker-url>/api/v2/hianime/episodes/...`
- `https://<worker-url>/api/v2/hianime/episode-srcs?...`
- `https://<worker-url>/health` (health check)

## Troubleshooting

### Build Fails

```bash
# Clear build artifacts
rm -rf dist
npm run cf:build
```

### Types Not Found

```bash
# Regenerate types
npx wrangler types
```

### CORS Errors

Ensure `ANIWATCH_API_CORS_ALLOWED_ORIGINS` is set to your frontend domain.

### Rate Limiting Issues

If you're hitting rate limits, consider:
1. Upgrading to paid plan
2. Reducing `ANIWATCH_API_MAX_REQS`
3. Implementing client-side caching

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run cf:build` | Build the worker |
| `npm run cf:dev` | Start local dev server |
| `npm run cf:deploy` | Deploy to production |
| `npm run cf:deploy:prod` | Deploy with production env |

## Further Reading

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Hono on Cloudflare](https://hono.dev/docs/others/cloudflare-workers)
