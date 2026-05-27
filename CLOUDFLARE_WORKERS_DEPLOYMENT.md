# Cloudflare Workers Deployment Guide

Deploy AniStream Hub API on Cloudflare Workers for global edge computing, CORS bypass, and streaming proxy capabilities.

## 🎯 Why Cloudflare Workers?

- **CORS Bypass**: Workers sit at the edge and can bypass CORS issues that plague browser requests
- **Global Distribution**: Edge network reaches users worldwide for low latency
- **Streaming Proxy**: Perfect for HLS/M3U8 streaming with Range request support
- **No Cold Starts**: Always hot and ready
- **Cost-Effective**: Free tier covers most use cases; pay-as-you-go for overages

## 📋 Prerequisites

1. Cloudflare Account ([https://dash.cloudflare.com](https://dash.cloudflare.com))
2. Cloudflare API Token (create in Account Settings → API Tokens)
3. Node.js 18+ and npm
4. `wrangler` CLI (installed as devDependency)

## 🚀 Quick Start - Local Development

### 1. Install Wrangler Dependencies

```bash
cd server
npm install
# Installs wrangler and @wrangler/types as devDependencies
```

### 2. Login to Cloudflare

```bash
npx wrangler login
# Opens browser for OAuth authentication
```

### 3. Run Locally

```bash
npm run dev:cloudflare
# Starts worker on http://localhost:8787
```

Test endpoints:
```bash
curl http://localhost:8787/health
curl http://localhost:8787/api
curl "http://localhost:8787/api/anime/search?q=naruto&page=1"
```

## 📦 Deployment - Production

### Option A: Using npm Script (Recommended)

```bash
cd server

# Build and deploy
npm run deploy:cloudflare
```

### Option B: Manual Wrangler Deploy

```bash
cd server
npm run build:cloudflare
wrangler deploy src/worker.ts
```

### Verify Deployment

After deployment, you'll get a URL like:
```
https://anifoxwatch-api.<your-account>.workers.dev
```

Test it:
```bash
curl https://anifoxwatch-api.<your-account>.workers.dev/health
```

## ⚙️ Environment Variables

### Set in Cloudflare Dashboard

1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com/workers)
2. Select your worker: `anifoxwatch-api`
3. Settings → Variables → Add variables:

| Variable | Value | Example |
|----------|-------|---------|
| `NODE_ENV` | `production` | - |
| `HIANIME_REST_URL` | REST API for anime data | `https://aniwatch-api-coral-seven.vercel.app` |
| `STREAMING_TIMEOUT` | Timeout in ms | `30000` |
| `DEBUG` | Debug logging | `false` or `true` |

### Secrets (if needed in future)

```bash
wrangler secret put DB_CONNECTION_STRING
wrangler secret put API_KEY
```

Then reference in worker.ts:
```typescript
import { WorkerEnv } from './types';
export default {
  async fetch(request: Request, env: WorkerEnv) {
    const dbUrl = env.DB_CONNECTION_STRING;
    const apiKey = env.API_KEY;
  }
}
```

## 🌐 Configure Frontend to Use Worker

Update your frontend `.env` or `vite.config.ts`:

```env
VITE_API_URL=https://anifoxwatch-api.<your-account>.workers.dev
```

Or in React code:
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'https://anifoxwatch-api.<your-account>.workers.dev';
```

## 🎯 Key Features Enabled on Workers

### ✅ CORS Handling
Worker automatically adds CORS headers to all responses:
```typescript
c.header('Access-Control-Allow-Origin', '*');
c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
```

### ✅ Streaming/Proxy Support
HLS/M3U8 streaming via:
- `GET /api/stream/watch/:episodeId?server={server}`
- `GET /api/stream/proxy?url={hlsUrl}` - Proxy streaming URLs

### ✅ Anime Search & Browse
- Search across multiple sources
- Trending, Latest, Top-Rated
- Genre filtering
- Seasonal anime

### ✅ Error Handling
All errors return proper HTTP status codes and CORS headers

## 🔄 Continuous Deployment

### GitHub Actions (Optional)

Create `.github/workflows/deploy-workers.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]
    paths:
      - 'server/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd server && npm install
      - run: npm run deploy:cloudflare
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Get Your Secrets

1. API Token: [Cloudflare Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Create token with "Edit Cloudflare Workers" permission
2. Account ID: Dashboard URL contains it: `https://dash.cloudflare.com/<ACCOUNT_ID>`

Add to GitHub:
- Settings → Secrets and variables → Actions
- Add `CLOUDFLARE_API_TOKEN`
- Add `CLOUDFLARE_ACCOUNT_ID`

## 📊 Monitoring

### View Logs

```bash
# Real-time logs
wrangler tail

# Tail specific logs
wrangler tail --status ok
wrangler tail --status error
```

### Cloudflare Dashboard

1. Workers → Your worker → Logs
2. View request/response metrics
3. Error rates and performance

## 🐛 Troubleshooting

### Issue: "Worker size exceeded"
- **Solution**: Reduce dependencies or use dynamic imports
- Check: `npm ls --depth=0` for large packages
- Consider: Tree-shaking unused code

### Issue: Timeouts on streaming
- **Solution**: Increase CPU limit in Cloudflare settings
- Check: `limits.cpu = 30000` in wrangler.toml
- Verify: Streaming sources are responding

### Issue: CORS still failing
- **Solution**: Ensure Worker has CORS headers (should be automatic)
- Check: Network tab in DevTools shows `Access-Control-Allow-Origin`
- Verify: Request is going through Worker URL

### Issue: 502 Bad Gateway
- **Solution**: Check source availability
- Verify: HIANIME_REST_URL is correct and reachable
- Check: Worker logs via `wrangler tail`

## 🔗 Custom Domain (Optional)

1. Go to Cloudflare Workers Settings
2. Custom Domain → Add Custom Domain
3. Point to your domain (requires Cloudflare DNS)
4. Update `VITE_API_URL` in frontend

## 📈 Scaling & Optimization

### Caching Headers

Workers automatically cache based on response headers:

```typescript
// Cache for 5 minutes
c.header('Cache-Control', 'public, max-age=300');
```

### Request Size Limits

Cloudflare Workers has limits:
- Request body: 100MB
- Response: Unlimited streaming
- CPU time: 30s per request

### Performance Tips

1. **Use streaming responses** for large data
2. **Cache repeated requests** in Worker KV (advanced)
3. **Compress responses** with gzip
4. **Monitor metrics** in Cloudflare dashboard

## 📚 Advanced: KV Storage (Optional)

For caching anime data across requests:

```bash
# Create KV namespace
wrangler kv:namespace create "ANIME_CACHE"

# Add to wrangler.toml
[[kv_namespaces]]
binding = "ANIME_CACHE"
id = "<namespace-id>"
```

Use in worker:
```typescript
const cached = await env.ANIME_CACHE.get('search:naruto');
if (!cached) {
  const data = await sourceManager.search('naruto');
  await env.ANIME_CACHE.put('search:naruto', JSON.stringify(data), { expirationTtl: 300 });
}
```

## 🚀 Next Steps

1. ✅ Deploy Worker: `npm run deploy:cloudflare`
2. ✅ Get Worker URL from terminal output
3. ✅ Update frontend `VITE_API_URL`
4. ✅ Test streaming endpoints
5. ✅ Monitor via `wrangler tail`

## 📖 Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Hono Framework](https://hono.dev/)
- [Streaming with Workers](https://developers.cloudflare.com/workers/runtime-apis/streams/readable/)

## 🎓 Video Tutorial (Optional)

See detailed setup in Cloudflare docs:
- https://developers.cloudflare.com/workers/get-started/guide/

---

**Questions?** Check server logs with `wrangler tail` or review error responses in DevTools Network tab.
