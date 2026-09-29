# Deploy the streaming API to Koyeb

Firebase Hosting serves the frontend. Streaming extraction runs in the separate Koyeb API,
so rebuilding or deploying Firebase alone does not update the streaming backend.

## Backend build and settings

Deploy the current repository revision using Docker with **build context `server`** and
**Dockerfile `Dockerfile.koyeb`** relative to that context. To build the same image locally
from the repository root:

```sh
docker build -f server/Dockerfile.koyeb -t anifoxwatch-api ./server
```

Set the service port to `8000`, health check path to `/health`, and these environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `8000` |
| `CORS_ORIGIN` | `https://anifoxwatch.web.app` or `*` |
| `DISABLE_BROWSER_SOURCES` | `false` |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` (also supplied by the image) |

**Check the existing Koyeb dashboard variables.** A dashboard value of
`DISABLE_BROWSER_SOURCES=true` overrides the new Dockerfile default. Change it to `false`
and deploy a new revision. Also remove any `STREAM_DISABLED_PROVIDERS` entries for providers
you intend to use.

The image installs Chromium and curl. Mainstream sources need browser extraction, and ReAnime
embed links also need browser validation before the API accepts them. Setting
`DISABLE_BROWSER_SOURCES=true` removes these playback paths; it is not a compatible fix for
the memory needed by streaming. Provision memory for Node, Chromium, and concurrent requests.
A 512 MB service is not guaranteed to run this workload reliably. If uptime resets or Koyeb
reports out-of-memory exits during playback, increase the instance memory and repeat the checks.

Deploy the backend first and confirm Koyeb reports the intended commit/revision. A
`STREAMING_API_URL` variable pointing at the same service does not enable extraction.

## Verify One Piece before updating the frontend

Run from PowerShell, replacing the API URL if it has changed:

```powershell
$api = 'https://entitled-viki-sssssenko-2bac406a.koyeb.app'
Invoke-RestMethod "$api/api/anime/resolve-slug?slug=one-piece-21&mode=safe"
1..3 | ForEach-Object {
    Invoke-RestMethod "$api/health"
    $stream = Invoke-RestMethod "$api/api/stream/watch/anilist-21?ep_num=1&anilist_id=21&category=sub"
    if (-not $stream.sources.Count) { throw 'One Piece returned no playable sources' }
    $stream | Select-Object source, sources, attempts
    Invoke-RestMethod "$api/health"
}
```

The slug must resolve to `anilist-21` / One Piece. Each watch request must return HTTP `200`
with a nonempty `sources` list. Health must remain reachable and uptime must increase rather
than reset. A healthy `/health` response by itself does not verify streaming.

Once the API passes, set `VITE_API_URL` in `.env.production` to its HTTPS URL and deploy the
frontend from the repository root:

```sh
npm run deploy:hosting
```

If you use `npm run build:firebase`, update `.env.firebase` to the same API URL too. Finally,
open `https://anifoxwatch.web.app/watch/anime/one-piece-21?ep=1&s=1`, start playback, and confirm
the video time advances. Provider restrictions can differ between local and cloud networks;
only successful playback from the deployed service completes this verification.
