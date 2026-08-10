# 🚀 Cloudflare Workers - Quick Start

## The 60-Second Setup

### 1️⃣ Install & Login
```bash
cd server
npm install
npx wrangler login
```

### 2️⃣ Deploy
```bash
npm run deploy:cloudflare
```

### 3️⃣ Get Your URL
Output will show: `https://anifoxwatch-api.YOUR-ACCOUNT.workers.dev`

### 4️⃣ Update Frontend
In your frontend `.env` or `vite.config.ts`:
```env
VITE_API_URL=https://anifoxwatch-api.YOUR-ACCOUNT.workers.dev
```

---

## Why This Fixes Streaming

| Problem | Render | Cloudflare Workers |
|---------|--------|-------------------|
| CORS Blocked | ❌ Browser sees cross-origin | ✅ Server-side proxy |
| Geographic Block | ❌ Single server location | ✅ Global edge IPs |
| Extension Block | ❌ Browser extensions interfere | ✅ Server request only |
| HLS Streaming | ⚠️ Intermittent | ✅ Edge cached |

---

## Commands You Need

### Local Development
```bash
cd server
npm run dev:cloudflare
# Runs on http://localhost:8787
```

### Production Deploy
```bash
cd server
npm run deploy:cloudflare
```

### View Live Logs
```bash
cd server
wrangler tail
```

### Debugging
```bash
# Build locally first
npm run build:cloudflare

# Deploy specific worker
wrangler deploy src/worker.ts
```

---

## Environment Variables (in Cloudflare Dashboard)

After deploying, go to Workers → anifoxwatch-api → Settings → Variables

Add these:
- `NODE_ENV` = `production`
- `HIANIME_REST_URL` = `https://aniwatch-api-coral-seven.vercel.app`
- `STREAMING_TIMEOUT` = `30000`
- `DEBUG` = `false`

---

## Test Your Worker

```bash
# Health check
curl https://anifoxwatch-api.YOUR-ACCOUNT.workers.dev/health

# API info
curl https://anifoxwatch-api.YOUR-ACCOUNT.workers.dev/api

# Search anime
curl "https://anifoxwatch-api.YOUR-ACCOUNT.workers.dev/api/anime/search?q=naruto&page=1"
```

---

## Troubleshooting

**Error: "Not authenticated"**
- Run: `npx wrangler login`
- Opens browser for OAuth

**Error: "Worker size exceeded"**
- Reduce dependencies or check `npm ls --depth=0`
- This is rare with Hono + standard deps

**Streaming still fails**
- Check logs: `wrangler tail`
- Verify HIANIME_REST_URL is correct
- Test source directly in worker URL

**CORS still happening**
- Ensure requests go to `anifoxwatch-api.xxx.workers.dev`
- Not to original domain
- Check Network tab in DevTools

---

## Next: Production Frontend Deployment

Once worker is running, update frontend:

### Vercel/Netlify
```
VITE_API_URL=https://anifoxwatch-api.YOUR-ACCOUNT.workers.dev
```

### GitHub Pages
Add to build environment variables

### Firebase
Set in `.firebaserc` or dashboard

---

**Docs**: [CLOUDFLARE_WORKERS_DEPLOYMENT.md](CLOUDFLARE_WORKERS_DEPLOYMENT.md)
