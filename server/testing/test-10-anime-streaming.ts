/**
 * Ten-anime API check — trending → detail, episodes, stream servers, optional watch.
 *
 *   API_URL=https://anifoxwatch-api.anya-bot.workers.dev npx tsx testing/test-10-anime-streaming.ts
 *
 * Env:
 *   ANIME_COUNT=10 (max)
 *   TRY_STREAM_WATCH=1 — also GET /api/stream/watch (slow; use for single-anime checks)
 */

const BASE = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const LIMIT = Math.min(10, Math.max(1, Number(process.env.ANIME_COUNT ?? 10)));
/** Default off so 10 titles finish in ~1–2 min; set TRY_STREAM_WATCH=1 to assert m3u8 per title. */
const TRY_WATCH = process.env.TRY_STREAM_WATCH === '1';
const WATCH_MS = Number(process.env.STREAM_WATCH_MS ?? 35_000);
const MS_DETAIL = Number(process.env.TIMEOUT_DETAIL ?? 40_000);
const MS_EPISODES = Number(process.env.TIMEOUT_EPISODES ?? 50_000);
const MS_SERVERS = Number(process.env.TIMEOUT_SERVERS ?? 45_000);

async function fetchJSON(path: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function run(): Promise<void> {
  console.log(`\n10-anime streaming probe`);
  console.log(`API: ${BASE} | count: ${LIMIT} | TRY_STREAM_WATCH=${TRY_WATCH}\n`);

  const trending = (await fetchJSON(`/api/anime/trending?page=1`, 45_000)) as {
    results?: Array<{ id?: string; title?: string }>;
  };
  const picks = (trending.results ?? []).filter((r) => r?.id).slice(0, LIMIT);
  if (picks.length === 0) throw new Error('No trending results');

  let okEpisodes = 0;
  let okServers = 0;
  let okWatch = 0;

  for (const t of picks) {
    const animeId = String(t.id);
    const title = String(t.title ?? animeId);

    let line = '';
    let servers = 0;
    let watchSources = 0;

    try {
      const meta = (await fetchJSON(`/api/anime?id=${encodeURIComponent(animeId)}`, MS_DETAIL)) as { id?: string };
      if (!meta?.id) {
        console.log(`❌ ${title.slice(0, 50)} | getAnime returned no id`);
        continue;
      }

      const epsData = (await fetchJSON(`/api/anime/episodes?id=${encodeURIComponent(animeId)}`, MS_EPISODES)) as {
        episodes?: Array<{ id?: string; number?: number }>;
      };
      const eps = epsData.episodes ?? [];
      const ep = eps.find((e) => e.number === 1) || eps[0];
      if (!ep?.id) {
        console.log(`❌ ${title.slice(0, 50)} | no episode id (${eps.length} eps)`);
        continue;
      }
      okEpisodes++;

      const srv = (await fetchJSON(`/api/stream/servers/${encodeURIComponent(ep.id)}`, MS_SERVERS)) as {
        servers?: unknown[];
      };
      servers = srv.servers?.length ?? 0;
      if (servers === 0) {
        console.log(`❌ ${title.slice(0, 50)} | stream servers: 0`);
        continue;
      }
      okServers++;

      if (TRY_WATCH) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), WATCH_MS);
        try {
          const path = `/api/stream/watch/${encodeURIComponent(ep.id)}?category=sub`;
          const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
          const data = (await res.json()) as { sources?: unknown[]; error?: string };
          watchSources = res.ok && Array.isArray(data.sources) ? data.sources.length : 0;
        } finally {
          clearTimeout(timer);
        }
        if (watchSources > 0) {
          okWatch++;
          line = `✅ servers=${servers} watchSrc=${watchSources}`;
        } else {
          line = `⚠️ servers=${servers} watch: no sources (OK if CDN blocks datacenter)`;
        }
      } else {
        line = `✅ servers=${servers} (watch skipped)`;
      }

      console.log(`${line.padEnd(56)} | ${title.slice(0, 55)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`❌ ${title.slice(0, 50)} | ${msg}`);
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  Episodes resolved: ${okEpisodes}/${picks.length}`);
  console.log(`  Stream servers > 0: ${okServers}/${picks.length}`);
  if (TRY_WATCH) console.log(`  Watch had sources: ${okWatch}/${picks.length}`);

  if (okServers < picks.length) {
    console.error('\nExit 1: not all titles had stream servers.');
    process.exit(1);
  }
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
