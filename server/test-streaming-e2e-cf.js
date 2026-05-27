/**
 * AniStream Hub — End-to-End STREAMING Test (CF Worker)
 *
 * Full pipeline for each anime:
 *   1. Search  → get anime ID
 *   2. Episodes → get episode list + pick first episode ID
 *   3. Servers  → list available servers
 *   4. Stream   → get final HLS / embed URL
 *   5. Proxy    → verify proxy can reach the stream URL
 *
 * Tests both normal anime (Aniwaves) and hentai (WatchHentai).
 */

const BASE    = process.env.BASE_URL || 'http://127.0.0.1:8787';
const TIMEOUT = 45_000; // generous — stream extraction takes time

const pass = [], fail = [];

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchJ(url, opts = {}) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res  = await fetch(url, { signal: ctrl.signal, ...opts });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(id);
  }
}

function log(icon, label, status, elapsed, detail) {
  const row = { icon, label, status, elapsed: `${elapsed}ms`, detail };
  icon === '✅' ? pass.push(row) : fail.push(row);
  console.log(`${icon} [${status}] ${label} (${elapsed}ms) — ${detail}`);
  return row;
}

async function step(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    log('✅', label, result.status ?? 200, Date.now() - t0, result.detail ?? '');
    return result.data;
  } catch (e) {
    log('❌', label, e.status ?? 'ERR', Date.now() - t0, e.message ?? String(e));
    return null;
  }
}

function err(msg, status) { const e = new Error(msg); e.status = status; throw e; }

// ─── individual pipeline steps ────────────────────────────────────────────────

async function search(q, mode) {
  const modeQ = mode ? `&mode=${mode}` : '';
  const { ok, status, body } = await fetchJ(`${BASE}/api/anime/search?q=${encodeURIComponent(q)}${modeQ}`);
  if (!ok) err(`Search failed: ${body?.error}`, status);
  const results = body?.results ?? [];
  if (!results.length) err('Search returned 0 results', 0);
  return { status, detail: `${results.length} results  first="${results[0]?.title}"`, data: results[0] };
}

async function getEpisodes(animeId) {
  const { ok, status, body } = await fetchJ(`${BASE}/api/anime/episodes?id=${encodeURIComponent(animeId)}`);
  if (!ok) err(`Episodes failed: ${body?.error}`, status);
  const eps = body?.episodes ?? [];
  if (!eps.length) err('No episodes returned', 0);
  return { status, detail: `${eps.length} eps  first="${eps[0]?.id}"`, data: eps[0] };
}

async function getServers(episodeId) {
  const { ok, status, body } = await fetchJ(`${BASE}/api/stream/servers/${encodeURIComponent(episodeId)}`);
  // Servers can be empty (embed-only sources) — that's OK
  const servers = body?.servers ?? [];
  return { status, detail: `${servers.length} server(s)  ${servers.map(s => s.name).join(', ') || 'none (will use default)'}`, data: servers };
}

async function getStream(episodeId, server) {
  const sq = server ? `?server=${encodeURIComponent(server)}` : '';
  const { ok, status, body } = await fetchJ(`${BASE}/api/stream/watch/${encodeURIComponent(episodeId)}${sq}`);
  const sources = body?.sources ?? [];
  if (!sources.length) err(`No stream sources returned (status=${status})`, status);
  const first = sources[0];
  return {
    status,
    detail: `${sources.length} source(s)  url="${first?.url?.slice(0, 80)}..."  isM3U8=${first?.isM3U8}`,
    data: { sources, first }
  };
}

async function probeProxy(streamUrl) {
  // Just hit the proxy endpoint and check we get a non-5xx
  const proxyUrl = `${BASE}/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`;
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(proxyUrl, { signal: ctrl.signal });
    // 200 or even 206 (partial) = good. 4xx from upstream = content issue, not proxy issue
    const ok  = res.status < 500;
    return { status: res.status, detail: `proxy→upstream ${res.status} ct=${res.headers.get('content-type')}`, data: ok };
  } catch (e) {
    return { status: 'TIMEOUT', detail: `proxy probe: ${e.message}`, data: false };
  } finally {
    clearTimeout(id);
  }
}

// ─── full pipeline ─────────────────────────────────────────────────────────────

async function pipeline(title, query, mode) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  🎬 Pipeline: "${query}" ${mode ? `(mode=${mode})` : ''}`);
  console.log('─'.repeat(60));

  // 1. Search
  const anime = await step(`Search "${query}"`, () => search(query, mode));
  if (!anime) return;

  // 2. Episodes
  const episode = await step(`Episodes for ${anime.id}`, () => getEpisodes(anime.id));
  if (!episode) return;

  // 3. Servers
  const servers = await step(`Servers for ${episode.id}`, () => getServers(episode.id));
  const firstServer = servers?.[0]?.name;

  // 4. Stream link
  const stream = await step(`Stream watch/${episode.id}`, () => getStream(episode.id, firstServer));
  if (!stream) return;

  // 5. Proxy probe (only if we have a real URL)
  const streamUrl = stream.first?.url;
  if (streamUrl && streamUrl.startsWith('http') && !streamUrl.includes('127.0.0.1')) {
    const probe = await probeProxy(streamUrl);
    log(
      probe.data ? '✅' : '⚠️',
      `Proxy probe (${streamUrl.slice(0, 50)}...)`,
      probe.status,
      0,
      probe.detail
    );
  } else if (streamUrl) {
    console.log(`  ⚠️  Skipping proxy probe — URL is embed/local: ${streamUrl.slice(0, 80)}`);
  }
}

// ─── run ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('='.repeat(70));
  console.log('  ANISTREAM HUB — END-TO-END STREAMING TEST (CF Worker)');
  console.log(`  Target : ${BASE}`);
  console.log(`  Time   : ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  // ── Normal anime ────────────────────────────────────────────────────────────
  console.log('\n\n══ NORMAL ANIME STREAMING ══');
  await pipeline('Naruto',           'naruto',           undefined);
  await pipeline('One Piece',        'one piece',        undefined);
  await pipeline('Witch Hat Atelier','witch hat atelier',undefined);

  // ── Hentai / Adult content ──────────────────────────────────────────────────
  console.log('\n\n══ HENTAI / ADULT STREAMING ══');
  await pipeline('Hentai (generic)', 'hentai',           'adult');
  await pipeline('Redo of Healer',   'redo healer',      'adult');

  // ── AniList deep link (known working: 147105 = Witch Hat Atelier) ───────────
  console.log('\n\n══ ANILIST ID → STREAM ══');
  await (async () => {
    const ANILIST_ID = 'anilist-147105';
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  🎬 AniList deep-link: ${ANILIST_ID}`);
    console.log('─'.repeat(60));

    // Resolve AniList ID → streaming ID
    const resolveT0 = Date.now();
    const { ok: rOk, status: rStatus, body: rBody } =
      await fetchJ(`${BASE}/api/anime/resolve?id=${ANILIST_ID}`);
    const resolveElapsed = Date.now() - resolveT0;

    if (!rOk || !rBody?.streamingId) {
      log('❌', `Resolve ${ANILIST_ID}`, rStatus, resolveElapsed, rBody?.error ?? 'No streamingId');
      return;
    }
    log('✅', `Resolve ${ANILIST_ID}`, rStatus, resolveElapsed, `streamingId="${rBody.streamingId}"`);

    // Get episodes for streaming ID
    const eps = await step(`Episodes for ${rBody.streamingId}`, () => getEpisodes(rBody.streamingId));
    if (!eps) return;

    // Stream
    const stream = await step(`Stream watch/${eps.id}`, () => getStream(eps.id));
    if (!stream) return;

    // Proxy probe
    const url = stream.first?.url;
    if (url && url.startsWith('http') && !url.includes('127.0.0.1')) {
      const probe = await probeProxy(url);
      log(probe.data ? '✅' : '⚠️', `Proxy probe`, probe.status, 0, probe.detail);
    }
  })();

  // ── Summary ─────────────────────────────────────────────────────────────────
  const total   = pass.length + fail.length;
  const pct     = total > 0 ? Math.round((pass.length / total) * 100) : 0;

  console.log('\n' + '='.repeat(70));
  console.log(`  RESULTS: ${pass.length}/${total} passed (${pct}%)  |  ${fail.length} failed`);
  console.log('='.repeat(70));

  if (fail.length > 0) {
    console.log('\n  ❌ FAILURES:');
    fail.forEach(r => console.log(`    • ${r.label} [${r.status}] ${r.elapsed} — ${r.detail}`));
  }

  console.log('\n  All steps:');
  [...pass, ...fail].forEach(r =>
    console.log(`    ${r.icon}  ${r.label.padEnd(52)} [${String(r.status).padEnd(3)}] ${r.elapsed.padEnd(8)} ${(r.detail || '').slice(0, 100)}`)
  );
  console.log('');
}

run().catch(console.error);
