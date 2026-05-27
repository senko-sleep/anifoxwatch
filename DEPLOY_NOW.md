# Copy & Paste: Deploy to Cloudflare Workers NOW

Just run these commands in order. Takes ~5 minutes.

---

## STEP 1: Setup (Run Once)

```powershell
# Navigate to server directory
cd server

# Install wrangler
npm install

# Authenticate with Cloudflare (opens browser)
npx wrangler login
```

After login, browser will close and return to terminal.

---

## STEP 2: Deploy (Run Anytime)

```powershell
# Build and deploy
npm run deploy:cloudflare
```

**Look for this in the output:**
```
✅ Successfully deployed your Worker
https://anifoxwatch-api.YOUR-ID.workers.dev
```

**Save this URL** - you'll need it for the frontend.

---

## STEP 3: Configure (5 minutes in dashboard)

1. Go to: https://dash.cloudflare.com/workers
2. Click: `anifoxwatch-api` worker
3. Go to: Settings → Variables
4. Add each variable (click "+ Add variable"):

| Name | Value |
|------|-------|
| `NODE_ENV` | `production` |
| `HIANIME_REST_URL` | `https://aniwatch-api-coral-seven.vercel.app` |
| `STREAMING_TIMEOUT` | `30000` |
| `DEBUG` | `false` |

Save when done.

---

## STEP 4: Update Frontend

Replace `YOUR-ID` with your actual ID from Step 2 URL.

### If using Vite (React):
Edit: `vite.config.ts`
```typescript
export default defineConfig({
  define: {
    'process.env.VITE_API_URL': JSON.stringify('https://anifoxwatch-api.YOUR-ID.workers.dev')
  }
})
```

### Or .env file:
Create or edit: `.env`
```env
VITE_API_URL=https://anifoxwatch-api.YOUR-ID.workers.dev
```

### If using Firebase Hosting:
Edit: `.firebaserc` or Firebase Console
```json
{
  "projects": {
    "default": "your-project"
  },
  "targets": {
    "your-project": {
      "hosting": {
        "dev": ["your-project-dev"]
      }
    }
  }
}
```

Environment variable:
```bash
export VITE_API_URL=https://anifoxwatch-api.YOUR-ID.workers.dev
npm run build
firebase deploy
```

---

## STEP 5: Test It Works

```bash
# Test health check
curl https://anifoxwatch-api.YOUR-ID.workers.dev/health

# Test search
curl "https://anifoxwatch-api.YOUR-ID.workers.dev/api/anime/search?q=naruto&page=1"

# Test streaming
curl "https://anifoxwatch-api.YOUR-ID.workers.dev/api/stream/watch/episode-id-here"
```

Should see JSON responses (no CORS errors).

---

## OPTIONAL: Local Testing Before Deploy

```powershell
# Run worker locally on http://localhost:8787
npm run dev:cloudflare

# In another terminal, test
curl http://localhost:8787/health
curl "http://localhost:8787/api/anime/search?q=naruto&page=1"
```

---

## Check If Deployment Works

Frontend streaming should now work! 🎉

If it doesn't:

### Check Logs
```powershell
cd server
wrangler tail
```

### Common Errors

**"Cannot find module 'hono'"**
- Solution: `npm install` in server directory

**"ERR_BLOCKED_BY_CLIENT"**
- Not your problem anymore! Worker fixes this

**Still see CORS errors**
- Check frontend is using correct worker URL
- Inspect Network tab - requests should go to worker domain

---

## That's It! 🚀

Your streams now work globally via Cloudflare's edge network.

**Deployment Time**: ~5 minutes
**Downtime**: 0 minutes (instant)
**Cost**: Free tier usually sufficient

---

For detailed docs, see:
- [CLOUDFLARE_WORKERS_DEPLOYMENT.md](CLOUDFLARE_WORKERS_DEPLOYMENT.md) - Full guide
- [CLOUDFLARE_QUICK_START.md](CLOUDFLARE_QUICK_START.md) - Quick reference
