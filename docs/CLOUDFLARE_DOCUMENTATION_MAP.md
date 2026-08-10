# Cloudflare Workers Setup - Documentation Map

## Quick Navigation

This folder now contains a comprehensive guide system for deploying your AniStream Hub API to Cloudflare Workers. Here's how to use each document:

---

## 📚 Document Overview

### 1. **CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md** (Main Reference)
**When to use:** Reference guide for deep understanding and troubleshooting

**Contents:**
- ✅ Prerequisites & installation
- ✅ Complete `wrangler.toml` configuration template with all options
- ✅ Environment variable management (public & secrets)
- ✅ Structured source code architecture
- ✅ Service bindings (KV, Durable Objects, Service Bindings)
- ✅ Advanced patterns (parallel requests, fallbacks, caching, circuit breakers)
- ✅ Deployment strategies & best practices
- ✅ Monitoring, debugging, and troubleshooting
- ✅ Complete working examples

**Best for:** Understanding how Cloudflare Workers works, learning patterns, reference material

---

### 2. **CLOUDFLARE_QUICK_START_IMPLEMENTATION.md** (Action Guide)
**When to use:** When ready to implement changes to your project

**Contents:**
- ✅ Production-ready `wrangler.toml` template for your project
- ✅ Step-by-step KV namespace setup
- ✅ Secret configuration for production
- ✅ TypeScript types for Worker environment
- ✅ Worker entry point implementation (Hono-based)
- ✅ Cache service implementation
- ✅ Rate limiter service implementation
- ✅ Build & deployment commands
- ✅ Verification checklist
- ✅ Quick troubleshooting

**Best for:** Actually implementing Cloudflare Workers in your project

---

### 3. **ROUTE_MIGRATION_EXPRESS_TO_HONO.md** (Migration Guide)
**When to use:** Converting your existing Express routes to Hono

**Contents:**
- ✅ Side-by-side comparison: Express vs Hono
- ✅ Converted anime routes example
- ✅ Converted streaming routes example
- ✅ Converted sources routes example
- ✅ Key patterns for Hono (validation, error recovery, pagination)
- ✅ Migration checklist

**Best for:** Understanding how to convert your existing route handlers

---

## 🚀 Getting Started - Recommended Flow

### Phase 1: Understanding (30 mins)
1. Read the **Quick Overview** section below
2. Skim **CLOUDFLARE_QUICK_START_IMPLEMENTATION.md** Part 1-3
3. Review **ROUTE_MIGRATION_EXPRESS_TO_HONO.md** to understand the migration

### Phase 2: Setup (1-2 hours)
1. Follow **CLOUDFLARE_QUICK_START_IMPLEMENTATION.md** Part 1-3
   - Update `wrangler.toml`
   - Create KV namespaces
   - Set secrets
2. Create environment files (`.dev.vars`, etc.)

### Phase 3: Implementation (2-4 hours)
1. Follow **CLOUDFLARE_QUICK_START_IMPLEMENTATION.md** Part 4-6
   - Create TypeScript types
   - Implement Worker entry point
   - Implement cache service
2. Use **ROUTE_MIGRATION_EXPRESS_TO_HONO.md** to convert your routes

### Phase 4: Testing & Deployment (1-2 hours)
1. Follow **CLOUDFLARE_QUICK_START_IMPLEMENTATION.md** Part 7-9
   - Local testing with `wrangler dev`
   - Staging deployment
   - Production deployment
2. Use **CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md** for troubleshooting if needed

---

## 📋 Quick Overview

### What You're Building

A serverless deployment of your AniStream Hub API on Cloudflare Workers with:

```
┌─────────────────────────────────────────────────┐
│        Cloudflare Workers (Hono Framework)      │
│  ┌───────────────────────────────────────────┐  │
│  │  Worker Entry Point (worker-modular.ts)   │  │
│  ├───────────────────────────────────────────┤  │
│  │  Routes (Anime, Streaming, Sources)       │  │
│  ├───────────────────────────────────────────┤  │
│  │  Services (SourceManager, Cache, etc)     │  │
│  ├───────────────────────────────────────────┤  │
│  │  Middleware (CORS, Logging, Rate Limit)   │  │
│  └───────────────────────────────────────────┘  │
│                                                   │
│  Bindings:                                        │
│  • KV Namespaces (Cache)                        │
│  • Durable Objects (Rate Limiter)               │
│  • Service Bindings (Other Workers)             │
└─────────────────────────────────────────────────┘
        ↓
   External APIs
   • HiAnime
   • AniList
   • Other anime sources
```

### Key Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | Hono | Lightweight web framework for Cloudflare Workers |
| **Config** | `wrangler.toml` | Cloudflare Workers configuration |
| **Cache** | KV Namespaces | Distributed caching |
| **Rate Limiting** | Durable Objects | Persistent state for rate limiting |
| **Secrets** | Wrangler | Secret management for API keys |
| **Environment** | `nodejs_compat` | Node.js compatibility for Workers |

---

## 🔧 Key Concepts

### Environment Variables vs Secrets

```
┌─────────────────────────────────────┐
│  Environment Variables (Public)     │  Stored in wrangler.toml
│  • API URLs                         │  Visible in deployment
│  • Feature flags                    │  Safe to commit
│  • Timeout settings                 │
├─────────────────────────────────────┤
│  Secrets (Private)                  │  Set via: wrangler secret put
│  • API keys                         │  Not visible in deployment
│  • Database URLs                    │  Never commit
│  • Tokens                           │
└─────────────────────────────────────┘
```

### Bindings Explained

```
1. KV Namespaces
   ├─ Storage: Distributed cache across Cloudflare's edge
   ├─ Use: Cache API responses, session data
   └─ Example: API response caching for 1 hour

2. Durable Objects
   ├─ Storage: Persistent state for a single instance
   ├─ Use: Rate limiting, counters, locks
   └─ Example: Track requests per user per minute

3. Service Bindings
   ├─ Storage: Call other Cloudflare Workers
   ├─ Use: Separate auth, proxy, or processing
   └─ Example: Auth Worker validates tokens
```

---

## 📝 File Structure You'll Create

```
server/
├── wrangler.toml                    ← Production config
├── .env.cloudflare.example          ← Template
├── .dev.vars                        ← Local development secrets
├── tsconfig.json
├── package.json
│
├── src/
│   ├── worker.ts                    ← Express entry point (keep for local dev)
│   ├── worker-modular.ts            ← Hono entry point for Cloudflare (NEW)
│   │
│   ├── types/
│   │   ├── worker.ts                ← Env interface for Cloudflare (NEW)
│   │   ├── api.ts
│   │   └── streaming.ts
│   │
│   ├── routes/                      ← Express routes (for local dev)
│   │   ├── anime.ts
│   │   ├── streaming.ts
│   │   └── sources.ts
│   │
│   ├── routes-worker/               ← Hono routes for Cloudflare (NEW/UPDATED)
│   │   ├── anime-routes.ts          ← Converted to Hono
│   │   ├── streaming-routes.ts      ← Converted to Hono
│   │   ├── sources-routes.ts        ← Converted to Hono
│   │   └── hianime-rest-proxy-routes.ts
│   │
│   ├── services/
│   │   ├── source-manager.ts        ← Keep as-is
│   │   ├── anilist-service.ts       ← Keep as-is
│   │   ├── cache-service.ts         ← NEW: KV-aware caching
│   │   ├── rate-limiter.ts          ← NEW: Durable Object integration
│   │   └── ...
│   │
│   ├── utils/
│   │   ├── logger.ts                ← Update for Cloudflare logging
│   │   └── ...
│   │
│   └── middleware/
│       ├── error-handler.ts
│       └── reliability.ts
│
└── dist/                            ← Built output (auto-generated)
    └── worker-modular.js            ← Main Cloudflare Worker
```

---

## ⚡ Quick Commands Reference

```bash
# Setup
cd server
npm install
wrangler login

# Create KV namespaces
wrangler kv:namespace create "CACHE"
wrangler kv:namespace create "SESSION_STORE"
wrangler kv:namespace create "API_RESPONSE_CACHE"

# Set secrets
wrangler secret put ANILIST_API_KEY --env production
wrangler secret put CLOUDFLARE_API_TOKEN --env production

# Development
wrangler dev                         # Local testing
curl http://localhost:8787/health   # Test locally

# Staging
npm run build
wrangler publish --env staging
curl https://anifoxwatch-api-staging.{account}.workers.dev/health

# Production
wrangler publish --env production
curl https://anifoxwatch-api-prod.{account}.workers.dev/health

# Monitoring
wrangler tail --env production
wrangler tail --env production --lines 100
```

---

## 🎯 Next Steps

### Immediate (Today)
- [ ] Read this map document
- [ ] Review CLOUDFLARE_QUICK_START_IMPLEMENTATION.md (Part 1-3)
- [ ] Run: `wrangler whoami` (verify login)

### Short Term (This week)
- [ ] Update `wrangler.toml` using template
- [ ] Create KV namespaces
- [ ] Set production secrets
- [ ] Create `.dev.vars` for local development

### Medium Term (This week/next)
- [ ] Implement cache service
- [ ] Convert route handlers (reference ROUTE_MIGRATION_EXPRESS_TO_HONO.md)
- [ ] Create Worker entry point
- [ ] Test locally with `wrangler dev`

### Long Term (This month)
- [ ] Deploy to staging
- [ ] Monitor with `wrangler tail`
- [ ] Deploy to production
- [ ] Configure monitoring in Cloudflare dashboard

---

## 📚 Document Map

```
START HERE → CLOUDFLARE_QUICK_START_IMPLEMENTATION.md (Parts 1-3)
    ↓
Understand →  CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md (for deep dives)
    ↓
Implement → CLOUDFLARE_QUICK_START_IMPLEMENTATION.md (Parts 4-9)
    ↓
Routes → ROUTE_MIGRATION_EXPRESS_TO_HONO.md
    ↓
Deploy → CLOUDFLARE_QUICK_START_IMPLEMENTATION.md (Part 7-9)
    ↓
Troubleshoot → CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md (Troubleshooting section)
```

---

## 💡 Pro Tips

1. **Test locally first** with `wrangler dev` before deploying
2. **Use staging environment** to test production configuration
3. **Monitor with `wrangler tail`** to catch issues early
4. **Keep secrets separate** - never commit `.dev.vars` or secrets
5. **Cache strategically** - use KV for frequently accessed data
6. **Handle timeouts** - Cloudflare Workers have CPU limits
7. **Use circuit breakers** - handle external API failures gracefully
8. **Log structured data** - helps with debugging in production

---

## ❓ FAQ

### Q: Do I need to remove Express?
**A:** No! You can keep Express for local development and test against it during migration. Later, you can use Hono entirely.

### Q: What if my service logic is complex?
**A:** The service layer doesn't change - only route handlers change from Express to Hono. All your business logic stays the same.

### Q: How do I handle gradual migration?
**A:** 
1. Keep Express API running
2. Deploy Hono Worker alongside it
3. Route specific endpoints to Worker, others to Express
4. Gradually move endpoints to Worker
5. Eventually retire Express

### Q: What about database connections?
**A:** Use the connection string secret (DATABASE_URL) and pass to services. Connection pooling works fine with Cloudflare Workers.

### Q: How do I monitor Worker performance?
**A:** Use `wrangler tail` for logs and Cloudflare Dashboard for analytics and metrics.

---

## 📞 Need Help?

### Common Issues Quick Links
- **"Secret not found" error** → CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md > Troubleshooting > Issue 1
- **"KVNamespace binding not found"** → CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md > Troubleshooting > Issue 2
- **Route handler errors** → ROUTE_MIGRATION_EXPRESS_TO_HONO.md > Pattern examples
- **Deployment issues** → CLOUDFLARE_QUICK_START_IMPLEMENTATION.md > Part 8-9

---

## Version Information

- **Created:** May 26, 2026
- **Cloudflare Workers API Version:** 2024-09-23
- **Hono Framework:** v4.x
- **Node.js Compatibility:** `nodejs_compat` flag enabled
- **Target:** Production deployment for AniStream Hub API

---

## Summary

You now have a complete guide system to deploy your AniStream Hub API to Cloudflare Workers:

1. **Understanding** → CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md
2. **Implementation** → CLOUDFLARE_QUICK_START_IMPLEMENTATION.md
3. **Migration** → ROUTE_MIGRATION_EXPRESS_TO_HONO.md

Start with Part 1-3 of CLOUDFLARE_QUICK_START_IMPLEMENTATION.md and follow the recommended flow above. Good luck! 🚀
