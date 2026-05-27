# Cloudflare Workers - Quick Reference Card

## 🚀 Start Here

**New to this guide?** Read these in order:
1. **CLOUDFLARE_DOCUMENTATION_MAP.md** ← Start here
2. **CLOUDFLARE_QUICK_START_IMPLEMENTATION.md** (Parts 1-3) ← Setup
3. **ROUTE_MIGRATION_EXPRESS_TO_HONO.md** ← Understand conversion
4. **CLOUDFLARE_QUICK_START_IMPLEMENTATION.md** (Parts 4-9) ← Implement
5. **CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md** ← Deep reference

---

## ⚙️ Setup Commands (Copy & Paste)

### 1. Initialize
```bash
cd server
npm install -D wrangler
wrangler login
wrangler whoami  # Verify you're logged in
```

### 2. Create KV Namespaces
```bash
wrangler kv:namespace create "CACHE"
wrangler kv:namespace create "SESSION_STORE"
wrangler kv:namespace create "API_RESPONSE_CACHE"

# Copy the IDs from output to wrangler.toml
```

### 3. Set Production Secrets
```bash
wrangler secret put ANILIST_API_KEY --env production
# Paste your key, press Enter, Ctrl+D to save

wrangler secret put CLOUDFLARE_API_TOKEN --env production
# Paste your token

# List to verify
wrangler secret list --env production
```

### 4. Create Local Development Secrets
```bash
cat > server/.dev.vars << 'EOF'
NODE_ENV=development
LOG_LEVEL=debug
ANILIST_API_KEY=dev_key_local
CLOUDFLARE_API_TOKEN=dev_token_local
EOF
```

---

## 📝 Configuration Template

### Minimal wrangler.toml
```toml
name = "anifoxwatch-api"
main = "dist/worker-modular.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[vars]
NODE_ENV = "production"
HIANIME_REST_URL = "https://aniwatch-api-coral-seven.vercel.app"
STREAMING_TIMEOUT = "30000"

[[kv_namespaces]]
binding = "CACHE"
id = "YOUR_KV_ID_HERE"  # Get from: wrangler kv:namespace list

[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"
script_name = "anifoxwatch-api"
```

→ **Full template in:** CLOUDFLARE_QUICK_START_IMPLEMENTATION.md (Part 1)

---

## 🔑 Access Environment in Code

### In your Hono routes:
```typescript
import { Env } from '../types/worker.js';

const router = new Hono<{ Bindings: Env }>();

router.get('/api/data', async (c) => {
  const env = c.env;  // Access environment
  const timeout = parseInt(env.STREAMING_TIMEOUT, 10);
  const apiUrl = env.HIANIME_REST_URL;
  
  // Access secrets (never log these!)
  const apiKey = env.ANILIST_API_KEY;
  
  // Access KV cache
  const cached = await env.CACHE.get('my-key');
  
  // Access rate limiter
  const rateLimitId = env.RATE_LIMITER.idFromName('user123');
});
```

### Define Env Interface:
```typescript
// src/types/worker.ts
export interface Env {
  // Variables (public)
  NODE_ENV: string;
  STREAMING_TIMEOUT: string;
  HIANIME_REST_URL: string;
  
  // Secrets (private)
  ANILIST_API_KEY: string;
  
  // KV Namespaces
  CACHE: KVNamespace;
  SESSION_STORE: KVNamespace;
  
  // Durable Objects
  RATE_LIMITER: DurableObjectNamespace;
}
```

---

## 🔄 Express → Hono Conversion Quick Ref

| Express | Hono | Example |
|---------|------|---------|
| `req.params.id` | `c.req.param('id')` | `const id = c.req.param('id')` |
| `req.query.q` | `c.req.query('q')` | `const q = c.req.query('q')` |
| `req.body` | `await c.req.json()` | `const body = await c.req.json()` |
| `req.headers.get()` | `c.req.header()` | `const token = c.req.header('authorization')` |
| `res.json(data)` | `c.json(data)` | `return c.json(data)` |
| `res.status(400)` | `return c.json(..., {status: 400})` | `return c.json(data, {status: 400})` |
| `process.env.VAR` | `c.env.VAR` | `const timeout = c.env.TIMEOUT` |
| `next(error)` | `throw error` | `throw new Error('msg')` |

→ **Full guide in:** ROUTE_MIGRATION_EXPRESS_TO_HONO.md

---

## 🏗️ Project Structure You'll Create

```
server/
├── wrangler.toml                          ← (UPDATE THIS)
├── .dev.vars                              ← (CREATE THIS - local secrets)
│
├── src/
│   ├── worker-modular.ts                  ← (CREATE THIS - Hono entry point)
│   │
│   ├── types/
│   │   └── worker.ts                      ← (CREATE THIS - Env interface)
│   │
│   ├── routes-worker/
│   │   ├── anime-routes.ts                ← (UPDATE - Express→Hono)
│   │   ├── streaming-routes.ts            ← (UPDATE - Express→Hono)
│   │   └── sources-routes.ts              ← (UPDATE - Express→Hono)
│   │
│   ├── services/
│   │   ├── cache-service.ts               ← (CREATE THIS - KV wrapper)
│   │   ├── rate-limiter.ts                ← (CREATE THIS - Durable Objects)
│   │   └── ... (rest unchanged)
│   │
│   └── ... (other files unchanged)
│
└── dist/                                  ← (AUTO-GENERATED)
```

---

## ✅ Testing Checklist

### Local Development
```bash
# Build
npm run build

# Start development server
wrangler dev

# Test endpoints
curl http://localhost:8787/health
curl "http://localhost:8787/api/anime/search?q=naruto"

# View logs
# Logs appear in terminal running wrangler dev
```

### Staging Deployment
```bash
# Dry-run (see what would deploy)
wrangler publish --dry-run --env staging

# Deploy
wrangler publish --env staging

# Test
curl https://anifoxwatch-api-staging.{account}.workers.dev/health

# Monitor
wrangler tail --env staging
```

### Production Deployment
```bash
# Final dry-run
wrangler publish --dry-run --env production

# Deploy
wrangler publish --env production

# Verify
curl https://anifoxwatch-api-prod.{account}.workers.dev/health

# Monitor
wrangler tail --env production --lines 50
```

---

## 🆘 Common Errors & Fixes

| Error | Solution |
|-------|----------|
| `Secret not found: KEY` | `wrangler secret put KEY --env production` then redeploy |
| `KVNamespace binding not found` | Check ID in wrangler.toml, recreate if needed |
| `Timeout error` | Increase `STREAMING_TIMEOUT` in wrangler.toml or code |
| `Cannot find module` | Run `npm run build` before deploying |
| `Worker is too large` | Remove unused imports, use `minify = true` |
| `Cannot access env in middleware` | Use `c.env` not `process.env` |

→ **Full troubleshooting in:** CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md > Troubleshooting

---

## 📊 Architecture Overview

```
Request → Cloudflare Edge
  ↓
Hono Router (worker-modular.ts)
  ├─ Middleware (CORS, Logging, Rate Limit)
  ├─ Routes (Anime, Streaming, Sources)
  ├─ Services (SourceManager, Cache, RateLimiter)
  └─ Bindings
     ├─ KV Namespaces (Cache)
     ├─ Durable Objects (Rate Limiting)
     └─ Service Bindings (Other Workers)
  ↓
External APIs
  ├─ HiAnime REST
  ├─ AniList
  └─ Anime Sources
```

---

## 🎯 The 5-Minute Summary

1. **Update wrangler.toml** with KV namespace IDs (Part 1 of quick-start)
2. **Set secrets** via `wrangler secret put` (Part 2)
3. **Create .dev.vars** for local development (Part 2)
4. **Convert routes** from Express to Hono (ROUTE_MIGRATION guide)
5. **Create Worker entry point** using Hono (Part 4 of quick-start)
6. **Test locally** with `wrangler dev` (Part 7)
7. **Deploy** to staging then production (Part 7)
8. **Monitor** with `wrangler tail` (Part 8)

Total time: ~4-6 hours depending on code complexity

---

## 📖 Document Cross-References

**Need to understand environment variables?**
→ CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md > Environment Variable & Secret Management

**Need to convert a specific route?**
→ ROUTE_MIGRATION_EXPRESS_TO_HONO.md > Pattern examples

**Need complete wrangler.toml with all options?**
→ CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md > Understanding wrangler.toml

**Need advanced patterns (caching, rate limiting, circuit breakers)?**
→ CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md > Advanced Patterns for Multiple API Calls

**Need to set up KV namespaces?**
→ CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md > Service Bindings & Dependencies > KV Namespace Bindings

**Need troubleshooting help?**
→ CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md > Troubleshooting Common Issues

---

## 💾 Save Your Keys

When you create KV namespaces, save the IDs:

```
CACHE namespace ID: ___________________
SESSION_STORE namespace ID: ___________________
API_RESPONSE_CACHE namespace ID: ___________________

Cloudflare Account ID: ___________________
```

Add these to wrangler.toml and .wrangler/config.json

---

## 🔗 Useful Links

- [Wrangler Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Hono Documentation](https://hono.dev/)
- [Cloudflare Workers API Reference](https://developers.cloudflare.com/workers/runtime-apis/)
- [KV Namespace Docs](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Durable Objects Docs](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)

---

## ✨ You've Got This!

You now have:
- ✅ Complete configuration templates
- ✅ Step-by-step implementation guide
- ✅ Route migration examples
- ✅ Service implementation examples
- ✅ Deployment instructions
- ✅ Troubleshooting guide

**Next step:** Open CLOUDFLARE_DOCUMENTATION_MAP.md and follow the recommended flow.

Good luck! 🚀
