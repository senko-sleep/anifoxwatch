# 🚀 Cloudflare Worker Guide

## 📋 Available Worker Versions

### 1. Standard Worker (`worker.ts`)
- ✅ All routes defined inline
- ⚠️ 700+ lines in one file
- ⚠️ Manual sync with Express routes required

### 2. **Modular Worker (`worker-modular.ts`)** ⭐ **Recommended**
- ✅ Separate route modules
- ✅ Clean code organization
- ✅ Easy to maintain and update
- ✅ Mirrors Express server structure

---

## 🎯 Quick Start

### Local Development

```bash
# Test the modular worker locally
cd server
npm run dev:cloudflare
```

Visit: `http://localhost:8787/api`

### Deploy to Cloudflare

```bash
# Deploy
cd server
npm run deploy:cloudflare
```

---

## 🔧 Switch Between Workers

Edit `wrangler.toml`:

```toml
# Use modular worker (recommended)
main = "src/worker-modular.ts"

# Or use standard worker
# main = "src/worker.ts"
```

Then redeploy:
```bash
npm run deploy:cloudflare
```

---

## 📁 File Structure

### Modular Worker Files

```
server/src/
├── worker-modular.ts          # Main worker entry (imports routes)
└── routes-worker/             # Worker-specific routes
    ├── anime-routes.ts        # All anime endpoints
    ├── streaming-routes.ts    # All streaming endpoints
    └── sources-routes.ts      # All source management endpoints
```

### How It Works

```typescript
// worker-modular.ts
import { createAnimeRoutes } from './routes-worker/anime-routes.js';

const sourceManager = new SourceManager();
const animeRoutes = createAnimeRoutes(sourceManager);

app.route('/api/anime', animeRoutes);
```

Each route module:
1. Receives `sourceManager` instance
2. Creates Hono app with all routes
3. Returns configured app
4. Worker mounts it automatically

---

## 🆕 Adding New Endpoints

### With Modular Worker (Easy!)

1. **Add route to appropriate file**:
   ```typescript
   // routes-worker/anime-routes.ts
   app.get('/new-endpoint', async (c) => {
       const data = await sourceManager.someMethod();
       return c.json(data);
   });
   ```

2. **That's it!** The worker automatically includes it.

### Update API Documentation

```typescript
// worker-modular.ts
endpoints: {
    anime: {
        // ... existing endpoints
        newEndpoint: 'GET /api/anime/new-endpoint'
    }
}
```

---

## 🧪 Testing

### Test Specific Routes

```bash
# Test anime routes
curl http://localhost:8787/api/anime/search?q=naruto

# Test streaming routes
curl http://localhost:8787/api/stream/servers/episode-123

# Test sources routes
curl http://localhost:8787/api/sources
```

### Test All Endpoints

```bash
# Get API documentation
curl http://localhost:8787/api
```

---

## 🔍 Debugging

### View Worker Logs

```bash
# Tail live logs
cd server
wrangler tail
```

### Check Worker Status

```bash
# Get health check
curl https://your-worker.workers.dev/health
```

---

## 📊 Comparison: Express vs Worker

Both use the same `SourceManager`:

| Feature | Express Server | Cloudflare Worker |
|---------|----------------|-------------------|
| **Runtime** | Node.js | V8 Isolate (Edge) |
| **Framework** | Express | Hono |
| **Routes** | `routes/*.ts` | `routes-worker/*.ts` |
| **Deployment** | Render.com | Cloudflare Workers |
| **Cold Start** | 500-1000ms | 0-50ms |
| **Global Coverage** | Single region | 300+ locations |
| **Cost** | $7/month | Free (100k req/day) |

---

## 🎯 Best Practices

### 1. Keep Routes Modular
- One route module per resource (anime, streaming, sources)
- Each module exports a function that creates a Hono app
- Pass dependencies (sourceManager) as parameters

### 2. Share Logic
- Use `sourceManager` from `services/source-manager.ts`
- Both Express and Worker use the same source manager
- No code duplication in business logic

### 3. Error Handling
```typescript
try {
    const data = await sourceManager.someMethod();
    return c.json(data);
} catch (e: any) {
    return c.json({ error: e.message }, 500);
}
```

### 4. Query Parameters
```typescript
const page = Number(c.req.query('page')) || 1;
const source = c.req.query('source');
```

### 5. Path Parameters
```typescript
const id = c.req.param('id');
const decodedId = decodeURIComponent(id);
```

---

## 🚀 Deployment Checklist

- [ ] Test locally with `npm run dev:cloudflare`
- [ ] Verify all endpoints work
- [ ] Check error handling
- [ ] Update `wrangler.toml` if needed
- [ ] Deploy: `npm run deploy:cloudflare`
- [ ] Test production deployment
- [ ] Monitor logs: `wrangler tail`

---

## 📈 Performance Tips

### 1. Enable Caching
```typescript
// Cache responses for 5 minutes
return c.json(data, 200, {
    'Cache-Control': 'public, max-age=300'
});
```

### 2. Use Conditional Requests
```typescript
const lastModified = req.headers.get('if-modified-since');
if (cachedTime && lastModified === cachedTime) {
    return c.text('', 304);
}
```

### 3. Compress Responses
Cloudflare automatically compresses responses > 1KB

---

## 🐛 Troubleshooting

### Issue: Routes not working

**Solution**: Check `wrangler.toml` main field points to correct worker

### Issue: Missing dependencies

**Solution**: Ensure polyfills are imported:
```typescript
import './polyfills.js';
```

### Issue: CORS errors

**Solution**: CORS middleware is in worker, should work automatically

### Issue: Timeout errors

**Solution**: Cloudflare Workers have 30s CPU time limit. Optimize slow operations.

---

## 📚 Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Hono Framework](https://hono.dev/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

## 🎉 Summary

**Modular Worker** gives you:
- ✅ Clean code organization
- ✅ Easy maintenance
- ✅ Mirrors Express structure
- ✅ No code duplication
- ✅ Fast development

**Deploy and enjoy edge computing!** 🚀
