# Deploying the API to Render

The API is one Docker web service, defined by [`render.yaml`](../render.yaml) at the repo root.
The frontend is a static build hosted separately (Firebase Hosting) and reaches the API through
`VITE_API_URL`.

## First deploy

1. Push the repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. It reads `render.yaml`.
3. Wait for the build (Chromium is installed for the Puppeteer sources, so the first one is slow).
4. Open `https://<service>.onrender.com/health` — it should answer `{"status":"ok",…}`.
5. Point the frontend at it: set `VITE_API_URL` in `.env.production` (and `.env.firebase`) to the
   service URL, then `npm run deploy:hosting`.

The URL Render assigns depends on the service name and may get a random suffix. **`.env.production`
currently points at `https://anifoxwatch-dko2.onrender.com`** — an older service. Until you change it,
the frontend keeps talking to that one.

## What is configured for you

| Setting | Why |
|---|---|
| `RENDER_EXTERNAL_URL` (set by Render) | The stream proxy builds its own `https://…` URLs from it, so video isn't blocked as mixed content. |
| `TRUST_PROXY=1` | Render's router is in front of the app; without it every visitor looks like one address. |
| `CORS_ORIGIN=*` | Public API. Set it to the frontend's origin to restrict. |
| `curl` in the image | hentaihaven.xxx challenges Node's TLS fingerprint; that source shells out to `curl` (`server/src/utils/curl-fetch.ts`). |
| `server/seed/hentai-index.json` | See below. |

## Free-tier behaviour

**Spin-down.** A free service sleeps after ~15 minutes without traffic and takes roughly a minute to
wake. Ping `/health` every 10 minutes (UptimeRobot, cron-job.org) to keep it awake — one always-on
free service fits inside Render's 750 free hours a month.

**The disk is wiped on every wake-up.** The hentai index (what WatchHentai, HentaiMama and
HentaiHaven carry) is normally cached in `server/.cache/`, so a cold start would begin with no index
and re-crawl three sites while visitors got partial search results. The image therefore ships a
snapshot, `server/seed/hentai-index.json`, which is loaded when there is no cache and then refreshed
in the background. It also carries the child-content exclusion list, so that protection is in force
from the first request even if AniList can't be reached.

Refresh the snapshot now and then so the starting point stays close to the sites:

```bash
cd server && npm run dev          # let it crawl, hit /api/hentai/search?q=a once, then stop it
cp .cache/hentai-index.json seed/hentai-index.json
```

**Memory.** The free plan has 512 MB and the image caps Node's heap at 320 MB. The Puppeteer-based
sources launch Chromium, which is the likeliest thing to run it out; if the service restarts under
load, move to a paid plan.

## Not verified

- The image itself was **not built** here (Docker's Linux engine wouldn't start on the dev machine).
  The TypeScript build and the frontend build both pass, and the Dockerfile changes are two lines.
- **HentaiHaven on Linux.** It works with the Windows `curl` and with Python's OpenSSL, so Cloudflare
  isn't blocking OpenSSL clients in general — but Render's IP range and Linux `curl` weren't tested.
  If `/api/hentai/index` shows `HentaiHaven: 0` after a deploy, that's the cause; the site keeps
  working on the other two.
