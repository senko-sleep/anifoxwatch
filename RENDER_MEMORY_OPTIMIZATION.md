# Render.com Memory Optimization Guide

## Problem: OOM on Render Free Tier

Render's free tier provides **512MB of memory**. When you watch anime, the app launches Puppeteer (Chromium), which alone uses 200-400MB, causing instant OOM crashes.

```
Error: Instance failed: mv5sp
Ran out of memory (used over 512MB) while running your code
```

## Solution 1: Use Lightweight API-Based Sources (IMPLEMENTED) ✅

**Status:** Already deployed in `.env` and `streaming.ts`

### Changes Made
1. **Disabled Puppeteer** - Set `ENABLE_MIRO_PUPPETEER=0` in `.env`
2. **Reduced caches** - Streaming cache reduced from 200 to 20 entries on low-memory systems
3. **Smart detection** - App auto-detects low-memory environments via `IS_LOW_MEMORY` flag

### Primary Sources (No Puppeteer)
- ✅ **Aniwaves** (primary) - API-based, lightweight
- ✅ **AkiHSource** - Adult anime, uses Cheerio (not Puppeteer)
- ✅ **WatchHentaiSource** - Adult anime, lightweight

### Deploy
```bash
git add .env server/src/routes/streaming.ts
git commit -m "fix: reduce memory usage on render free tier"
git push origin main
# Render auto-deploys
```

**Memory footprint after fix:** ~150-200MB (safe for 512MB tier)

---

## Solution 2: Upgrade Render Instance

If Solution 1 doesn't work, upgrade Render to a **paid instance**:

### Render Pricing
| Instance | RAM | CPU | Cost/Month |
|----------|-----|-----|-----------|
| Free | 512MB | 0.5 CPU | $0 (shared, sleeping) |
| Starter | 512MB | 0.5 CPU | $7 |
| Standard | 2GB | 1 CPU | $12 |
| Pro | 4GB | 2 CPU | $29 |

### Upgrade Steps
1. Go to [render.com/dashboard](https://render.com/dashboard)
2. Click on your service
3. Settings → Upgrade Plan
4. Select **Starter** ($7/month) or higher
5. Confirm billing

This gives you 512MB unshared + more CPU.

---

## Solution 3: Deploy to Cloudflare Workers (RECOMMENDED) 🚀

**Why Cloudflare Workers is Better:**
- ✅ No memory concerns (streaming handled at edge)
- ✅ Cheaper ($5/month or free tier has generous limits)
- ✅ Faster globally (50+ data centers)
- ✅ Better for streaming (Range requests natively supported)
- ✅ CORS issues solved automatically
- ✅ Can scale to millions of requests

### Quick Setup (5 minutes)

```bash
cd server

# 1. Login to Cloudflare
npx wrangler login

# 2. Create worker
npx wrangler publish

# 3. Get your URL
# https://anifoxwatch-api.<your-account-id>.workers.dev

# 4. Update frontend
# .env: VITE_API_URL=https://anifoxwatch-api.<your-account-id>.workers.dev
```

Full guide: [CLOUDFLARE_WORKERS_DEPLOYMENT.md](CLOUDFLARE_WORKERS_DEPLOYMENT.md)

---

## Solution 4: Deploy to Vercel (Node.js Runtime) ⚡

**Good alternative** if you prefer Vercel's ecosystem:

```bash
npm run deploy:vercel
```

Pros:
- 3GB RAM per function
- Integrated with Next.js-friendly deployment
- $0-20/month depending on usage

---

## Solution 5: Railway or Fly.io

Both offer cheap Node.js hosting with better memory:

**Railway:**
```bash
npm install -g railway
railway login
railway link  # connects to Railway project
railway up    # deploy
```

**Fly.io:**
```bash
npm install -g flyctl
flyctl auth login
flyctl deploy --dockerfile
```

---

## Monitoring Memory Usage

### Check Current Memory on Render
```bash
# SSH into Render instance
# Then run:
free -h
ps aux --sort=-%mem | head
```

### Add Memory Monitoring to Your App
```typescript
// server/src/utils/memory-monitor.ts
import os from 'os';

export function logMemoryUsage() {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  
  console.log(`🧠 Memory: ${heapUsedMB}MB / ${heapTotalMB}MB`);
  
  if (heapUsedMB > 400) {
    console.warn('⚠️  HIGH MEMORY USAGE - approaching OOM limit!');
  }
}

// Call every 30 seconds
setInterval(logMemoryUsage, 30000);
```

---

## Emergency: If Still Getting OOM

1. **Check logs** for what's using memory:
   ```bash
   # Render Dashboard → Logs
   # Look for "HEAP" or "Memory" warnings
   ```

2. **Kill background processes:**
   - Database connections leaking?
   - Caches not cleaning up?
   - Health check loops spawning requests?

3. **Disable caching entirely:**
   ```env
   DISABLE_STREAM_CACHE=true
   DISABLE_SEGMENT_CACHE=true
   ```

4. **Reduce concurrency:**
   ```typescript
   // In source-manager.ts
   private maxGlobalConcurrent = 5; // reduced from 20
   ```

---

## Recommended Path Forward

1. **Immediate:** Use Solution 1 (already applied) ✅
2. **If still crashing:** Upgrade to Render Starter ($7/month)
3. **For production:** Deploy to Cloudflare Workers (free/cheap + better)
4. **Long-term:** Use Vercel or Railway for full control

---

## Files Modified
- [.env](.env) - `ENABLE_MIRO_PUPPETEER=0`, `NODE_ENV=production`
- [server/src/routes/streaming.ts](server/src/routes/streaming.ts) - Adaptive cache sizing
- [server/src/index.ts](server/src/index.ts) - Consider adding memory logging

## Related Documentation
- [CLOUDFLARE_WORKERS_DEPLOYMENT.md](CLOUDFLARE_WORKERS_DEPLOYMENT.md) - Full Cloudflare setup
- [DEPLOYMENT.md](DEPLOYMENT.md) - All deployment options
- [API-RELIABILITY.md](API-RELIABILITY.md) - Resilience patterns
