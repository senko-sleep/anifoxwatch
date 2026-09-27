# Streaming deployment diagnostic record

## 2026-09-27: Koyeb playback failure

| Test | Result | What it establishes |
| --- | --- | --- |
| Koyeb `/health`, `/api/health`, and browser CORS requests | `200` with application CORS headers | The public service, TLS, routing, and ordinary cross-origin browser requests work. |
| Koyeb `/api/stream/watch/aniwaves-82391%26eps%3D1?server=aniwaves` | Platform `503` in about 0.12s, no application/CORS headers | The request did not receive an application error response; the platform lost the backend connection. |
| Health before and after that request | Uptime changed from about 150,000s to about 30s | The stream request restarted the deployed process/container. |
| Same stream request locally | `200` after about 18s; response contained two ReAnime FlixCloud sources | The episode and direct resolver are valid; this is not a malformed ID or universal upstream outage. |
| Live `animekai.to` checks, local and Koyeb | DNS/fetch failure | AnimeKai is independently unavailable and must not be used as proof of cloud compatibility. |
| Low-memory profile with title/AniList context | Three `200` responses in 0.27–0.66s, each with two ReAnime sources; uptime increased monotonically | Direct playback remains functional without Chromium. An opaque provider ID alone is insufficient for a cross-source fallback; the website sends the title and/or AniList ID. |

## 2026-09-27: public-versus-local verification for the reported URLs

| Test | Local API / site | Public Koyeb API / site | Conclusion |
| --- | --- | --- | --- |
| `GET /api/anime/resolve-slug?slug=one-piece-21&mode=safe` | `200`, `anilist-21` / `ONE PIECE` | `200`, but resolves to `aniwaves-one-piece-episode-of-merry-…-76087` | The public service is running a revision older than the short-AniList-ID resolver fix. This is why the public page shows one episode. |
| One Piece episode list | `200`, 1,179 episodes | `200`, one episode for the wrongly-resolved special | The incorrect result originates in the deployed API, before the frontend renders it. |
| Local browser `http://localhost:8081/watch/anime/one-piece-21?ep=1` | The page shows One Piece, 1,179 episodes, and a `200` stream response; it creates a playback iframe | N/A | The current frontend and API work together end-to-end locally. |
| Local `GET /api/stream/watch/anilist-21?ep_num=1&anilist_id=21` | `200` with a non-empty source list | `404 No streaming sources found` after about 19 seconds | The cloud service does not have a successful direct fallback for this request. |
| Koyeb Chromium diagnostic for the old `aniwaves-76087&eps=1` request | Extracts two streams in 744 ms | Chromium launches, but the embed captures zero streams after 22.3 s | Chromium is installed and executable in Koyeb; the provider response differs from the cloud environment. |
| Koyeb health probes after the stream diagnostics | N/A | `/health` and `/api/health` time out with no response | The public deployment is now unhealthy; this is not a CORS, TLS, or browser-side failure. |

The public endpoint is `https://entitled-viki-sssssenko-2bac406a.koyeb.app`. GitHub `main`
contains the resolver fix (`5967611`) and a verified TypeScript build fix (`1c67826`), but the
Koyeb service has not deployed those commits. A successful release needs to use that commit,
retain `DISABLE_BROWSER_SOURCES=true` on a constrained instance, and then run the verification
protocol below before switching users back to it.

## Fix and verification protocol

`DISABLE_BROWSER_SOURCES=true` prevents Aniwaves and Anichi from being selected and prevents
Chromium warm-up. The direct Yomi/ReAnime resolvers remain available. It is set in both the
Render Blueprint and Koyeb Dockerfile.

After every production deploy, run this three times and record code, duration, selected `source`,
and the server uptime before/after each request:

```powershell
$base = 'https://YOUR-API-HOST'
1..3 | ForEach-Object {
  curl.exe -sS --max-time 45 "$base/api/stream/watch/aniwaves-82391%26eps%3D1?server=aniwaves"
}
```

Pass criteria: each request is an application `200` containing a non-empty `sources` array, and
the service health endpoint stays reachable with monotonically increasing uptime. Then open the
Firebase site, start the same title, and confirm the browser network request is `200` and the
player receives a source.
