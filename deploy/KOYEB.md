# Deploy the streaming API to Koyeb

Firebase Hosting serves the frontend. Koyeb runs the API. Deploying Firebase alone does
not update the backend. Keep the existing free instance and its 512 MB memory limit.

## Current production configuration

Read-only CLI inspection on October 13, 2026 identified:

- Service: `poor-marne/anifoxwatch` (`910270b5-3784-491b-8162-661aa29cfb66`).
- API: `https://poor-marne-sssssenko-05a416b4.koyeb.app`.
- Git source: `github.com/senko-sleep/anifoxwatch`, branch `main`.
- Build context: repository root, default root `Dockerfile`.
- Instance: `free`, region `was`, one maximum replica, public port `8000`.
- The inspected deployment used a TCP health check. Change it to HTTP `/health` so a
  listening proxy cannot conceal an unresponsive API.

The root image contains the existing Rust media proxy plus Node on loopback. No measured
Rust speedup is claimed here. `server/Dockerfile` is a browser-free Node-only alternative
using the same repository-root context. `server/Dockerfile.koyeb` is the Node-only option
when the build context is explicitly `server`.

```sh
# Existing production build path
docker build -f Dockerfile -t anifoxwatch-api .
# Optional Node-only image; use only with a corresponding Koyeb build-context change
docker build -f server/Dockerfile.koyeb -t anifoxwatch-api ./server
```

## Memory and browser settings

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `8000` |
| `LOW_MEMORY_PROFILE` | `true` |
| `MEMORY_LIMIT_MB` | `512` |
| `NODE_OPTIONS` | `--max-old-space-size=220` |
| `BROWSER_EXTRACTOR` | `remote` with an approved existing extractor, otherwise `off` |
| `CORS_ORIGIN` | `https://anifoxwatch.web.app` |

All API Dockerfiles omit Chromium and prevent Puppeteer downloads in both build and runtime
stages. A database connection does not opt the API out of its low-memory cache profile.
The V8 heap ceiling is only part of the memory budget: Buffers, native allocations, the Rust
proxy, and every child process also count toward the container limit.

The remote extractor requires `EXTRACTOR_URL` and `EXTRACTOR_TOKEN` supplied securely by the
existing deployment. Without both, browser extraction fails fast and direct HTTP providers
remain available. Do not select local extraction on Koyeb or provision a new external
extractor without approval of its free-tier and cost constraints. Remove obsolete dashboard
values for `PUPPETEER_EXECUTABLE_PATH` and `DISABLE_BROWSER_SOURCES`; browser mode is selected
by `BROWSER_EXTRACTOR`. Do not disable TLS verification.

## Release the reviewed revision

Commit and push the reviewed changes first. Replace `REVIEWED_SHA` with that published SHA.
This command updates the existing free service and selects HTTP health checks; it does not
create a paid service. Preserve any approved extractor secrets already configured.

```powershell
koyeb services update poor-marne/anifoxwatch `
  --git-builder docker --git-workdir . --git-docker-dockerfile Dockerfile `
  --git-sha REVIEWED_SHA --instance-type free `
  --env PORT=8000 --env LOW_MEMORY_PROFILE=true --env MEMORY_LIMIT_MB=512 `
  --env NODE_OPTIONS=--max-old-space-size=220 --env BROWSER_EXTRACTOR=off `
  --checks 8000:http:/health
```

Use `BROWSER_EXTRACTOR=remote` instead of `off` only when the approved remote extractor is
already configured. Confirm the actual deployed SHA before testing:

```powershell
koyeb services list --output json
koyeb deployments get DEPLOYMENT_ID --output json
koyeb metrics get --service 910270b5-3784-491b-8162-661aa29cfb66 `
  --start START_UTC --end END_UTC --output json
```

Inspect deployment output without printing secret values. CLI service metrics may include
overlapping old and new deployment series; do not attribute an older instance's peak to
the current one. `/health` reports Node RSS, process peak RSS, cumulative CPU microseconds,
browser mode, and Linux cgroup memory current/peak/limit when the files are available.
Unavailable cgroup measurements are `null`, never fabricated zeros. Node RSS alone does
not establish total container memory or prove that no Chromium process exists.

## Playback acceptance

Open the exact production URL in a fresh real browser session:

`https://anifoxwatch.web.app/watch/anime/you-and-i-are-polar-opposites-season-2-210031?lang=sub&ep=1&s=2`

Each pass requires a decoded video frame, advancing playback and changing frames for at
least 60 seconds, seeking both directions, pause/resume, and reload with restored Continue
Watching position. Repeat for 20 consecutive passes, resetting the counter on any failure.
Then verify at least 15 valid episode transitions. Record cold/warm conditions, first-frame
latency, API latency, CPU/RAM samples, and every failed attempt. HTTP 200 or a nonempty source
list alone does not count as playback success.

Once the backend revision is verified, build and deploy the frontend from the repository
root with `npm run deploy:hosting`. Keep `.env.production` and `.env.firebase` pointed at
the same approved HTTPS API when using their corresponding builds.
