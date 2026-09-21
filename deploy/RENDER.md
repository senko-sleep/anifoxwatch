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

The URL Render assigns depends on the service name and may get a random suffix. **Two services of this
API currently exist** — `anifoxwatch.onrender.com` and `anifoxwatch-dko2.onrender.com` — and
`.env.production` / `.env.firebase` point the frontend at the `-dko2` one. Redeploy the one the frontend
uses (or point `VITE_API_URL` at the other), and delete whichever you don't need: each free service uses
the same 750 monthly hours.

Environment set in `render.yaml` only applies to a service created from the Blueprint. A service created
by hand (which these look like — `PORT` is Render's own 10000, not the 8080 in the file) needs
`TRUST_PROXY=1` added under **Environment** in its dashboard.

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

## Checking a deployed service

`GET /api/hentai/diag` answers "can this host reach the sites?" without needing the logs:

```json
{ "curl": "curl 7.88.1 (x86_64-pc-linux-gnu) …",
  "hentaiHaven": { "ok": false, "ms": 412, "error": "curl https://hentaihaven.xxx/…: HTTP 403" },
  "index": { "total": 3900, "bySource": {…}, "down": ["HentaiHaven"], … } }
```

- `error: "curl is not installed"` → the image predates the `curl` line in the Dockerfile; redeploy.
- `error: "…: HTTP 403"` → the site's bot check is refusing this host. Nothing in the app can fix that.
- `down` lists sources the index has stopped advertising because they didn't answer. Their titles are
  hidden from browse, search and "watchable on" until the next probe (every 10 minutes) succeeds.

## Known limits

- **HentaiHaven was observed failing on Render's free tier** (its titles returned errors while
  HentaiMama on the same service streamed fine). It works from a home connection. The likely cause is
  the site's bot check refusing datacenter addresses; `/api/hentai/diag` will say which. With the
  source-down handling above this now degrades to "HentaiHaven titles aren't shown" rather than
  "clicking them fails".
- **Puppeteer launch timeouts.** The free plan is a fraction of a CPU and ~512 MB, so launching Chromium
  can take a minute or fail. The browser is no longer started at boot on Render (it starts on demand,
  with a 60 s limit; `PUPPETEER_LAUNCH_TIMEOUT_MS` and `PUPPETEER_WARMUP=true` override). Sources that
  need Chromium (Anichi, the 9anime family) are the ones affected; the hentai sources don't use it.
- The image itself was not built on the dev machine (Docker's Linux engine wouldn't start); Render's own
  build is the first real one. The TypeScript and frontend builds both pass.
