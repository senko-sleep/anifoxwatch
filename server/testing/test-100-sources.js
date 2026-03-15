/**
 * Quick stream test: universal slug format (one-piece-100?ep=2) — no source prefix.
 * Tries recommended number of episodes until one returns streaming sources.
 *
 * Run (server must be running):
 *   API_BASE=http://localhost:3001 node server/testing/test-100-sources.js
 *   npm run test:stream  (from server dir)
 *
 * Backend tries HiAnimeDirect → HiAnime → 9Anime → Kaido for any slug.
 */

const API_BASE = process.env.API_BASE || process.env.API_URL || 'http://localhost:3001';
const API_FALLBACK = 'http://localhost:3002';
const MAX_ATTEMPTS = 12;
const REQUEST_TIMEOUT_MS = 20000;
let BASE_USED = API_BASE;

// Universal slug format only: slug?ep=N (no hianime- / 9anime- prefix)
const TEST_EPISODE_IDS = [
  'one-piece-100?ep=2',
  'one-piece-100?ep=2142',
  'naruto-11?ep=269',
  'demon-slayer-kimetsu-no-yaiba-47?ep=48512',
  'jujutsu-kaisen-the-culling-game-part-1-20401?ep=162345',
  'attack-on-titan-164?ep=1',
  'spy-x-family-170?ep=1',
  'steinsgate-24?ep=1',
  'frieren-beyond-journeys-end-176?ep=1',
  'solo-leveling-177?ep=1',
  'bleach-13?ep=1',
  'death-note-37?ep=1',
];

const DOMAINS_TO_CHECK = [
  'https://hianimez.to',
  'https://9anime.lu',
  'https://aniwave.to',
  'https://kaido.to',
];

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`[${ts}] ${msg}`);
}

function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), options.timeout || REQUEST_TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(to));
}

async function checkDomain(url) {
  try {
    const res = await fetchWithTimeout(url, { method: 'HEAD', timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' } });
    return { url, ok: res.status < 400, status: res.status };
  } catch (e) {
    return { url, ok: false, status: 0, error: e.message };
  }
}

async function testStreamEndpoint(episodeId) {
  const encoded = encodeURIComponent(episodeId);
  const url = `${BASE_USED}/api/stream/watch/${encoded}?category=sub`;
  try {
    const res = await fetchWithTimeout(url);
    const data = res.ok ? await res.json() : { error: res.status, status: res.status };
    if (data.sources && data.sources.length > 0) {
      return { ok: true, episodeId, sources: data.sources.length, server: data.server, data };
    }
    return {
      ok: false,
      episodeId,
      status: res.status,
      error: data.error || data.message || `HTTP ${res.status}`,
      triedServers: data.triedServers,
    };
  } catch (e) {
    return { ok: false, episodeId, error: e.message || 'Request failed' };
  }
}

async function ensureBaseUrl() {
  for (const base of [API_BASE, API_FALLBACK]) {
    try {
      const r = await fetchWithTimeout(`${base}/health`, { timeout: 5000 });
      if (r.ok) {
        BASE_USED = base;
        log(`Using API: ${base}`);
        return;
      }
    } catch (_) {}
  }
  BASE_USED = API_BASE;
}

async function runStreamTests() {
  await ensureBaseUrl();
  log(`Testing up to ${MAX_ATTEMPTS} slugs (universal format) until one streams...\n`);

  const ids = TEST_EPISODE_IDS.slice(0, MAX_ATTEMPTS);
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const episodeId = ids[i];
    log(`[${i + 1}/${ids.length}] ${episodeId}`);
    const result = await testStreamEndpoint(episodeId);
    if (result.ok) {
      passed++;
      log(`  SUCCESS: ${result.sources} source(s) from ${result.server}`);
      return { success: true, result, passed, failed };
    }
    failed++;
    log(`  FAIL: ${result.error}`);
  }

  return { success: false, passed, failed };
}

async function main() {
  console.log('='.repeat(56));
  console.log('  Stream test — universal slug (one-piece-100?ep=2)');
  console.log('  Max ' + MAX_ATTEMPTS + ' attempts, server must be running');
  console.log('='.repeat(56));

  const domainResults = await Promise.all(DOMAINS_TO_CHECK.map(checkDomain));
  const reachable = domainResults.filter((r) => r.ok).length;
  log(`Reachable: ${reachable}/${DOMAINS_TO_CHECK.length}\n`);

  const streamResult = await runStreamTests();

  console.log('\n' + '='.repeat(56));
  if (streamResult.success) {
    console.log('  RESULT: Streaming works.');
    console.log('  Episode:', streamResult.result.episodeId);
    console.log('  Server:', streamResult.result.server);
  } else {
    console.log('  RESULT: No stream after', streamResult.failed, 'attempts.');
  }
  console.log('='.repeat(56));

  process.exit(streamResult.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
