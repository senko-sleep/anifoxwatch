/**
 * AniStream Hub — Search, Browse & Hentai Test Suite
 * Targets the local Wrangler dev server at http://127.0.0.1:8787
 *
 * Tests:
 *   1. Health
 *   2. Home page data (trending, latest, top-rated, seasonal)
 *   3. Search — normal anime
 *   4. Search — adult/hentai (mode=adult)
 *   5. Browse — no filters (safe)
 *   6. Browse — with genre filters
 *   7. Browse — adult mode
 *   8. Genre endpoint
 *   9. Genres/types/statuses/seasons/years static metadata
 */

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const TIMEOUT_MS = 30_000;

const results = [];

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, ...opts });
  } finally {
    clearTimeout(id);
  }
}

async function test(name, url, validate, method = 'GET', body = null) {
  const start = Date.now();
  try {
    const opts = { method };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetchWithTimeout(url, opts);
    const elapsed = Date.now() - start;
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();

    let passed = res.ok;
    let detail = '';

    if (validate) {
      const v = validate(data, res);
      passed = v.passed;
      detail = v.detail || '';
    }

    results.push({ name, status: res.status, passed, elapsed: `${elapsed}ms`, detail });
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} [${res.status}] ${name} (${elapsed}ms) — ${detail}`);
    return data;
  } catch (err) {
    const elapsed = Date.now() - start;
    const isTimeout = err.name === 'AbortError';
    const detail = isTimeout ? `TIMEOUT after ${TIMEOUT_MS}ms` : err.message;
    results.push({ name, status: 'ERROR', passed: false, elapsed: `${elapsed}ms`, detail });
    console.log(`❌ [ERR] ${name} (${elapsed}ms) — ${detail}`);
    return null;
  }
}

function arrayResult(field = 'results') {
  return (body) => ({
    passed: Array.isArray(body?.[field]) && body[field].length > 0,
    detail: `count=${body?.[field]?.length ?? 0} source=${body?.source || body?.sourceUsed || '?'} first="${body?.[field]?.[0]?.title || body?.[field]?.[0]?.name || '?'}"`,
  });
}

// ─── test runner ─────────────────────────────────────────────────────────────

async function runTests() {
  console.log('='.repeat(70));
  console.log('  ANISTREAM HUB — SEARCH / BROWSE / HENTAI TEST');
  console.log(`  Target : ${BASE}`);
  console.log(`  Time   : ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  // ── 1. Health ──────────────────────────────────────────────────────────────
  console.log('\n── 1. Health ──');

  await test('GET /health', `${BASE}/health`, (b) => ({
    passed: b?.status === 'healthy',
    detail: `status=${b?.status} env=${b?.environment}`,
  }));

  // ── 2. Home Page Data ──────────────────────────────────────────────────────
  console.log('\n── 2. Home Page Data ──');

  await test('GET /api/anime/trending', `${BASE}/api/anime/trending?page=1`, arrayResult());
  await test('GET /api/anime/latest',   `${BASE}/api/anime/latest?page=1`,   arrayResult());
  await test('GET /api/anime/top-rated',`${BASE}/api/anime/top-rated?page=1&limit=10`, arrayResult());
  await test('GET /api/anime/seasonal', `${BASE}/api/anime/seasonal?page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} season=${b?.seasonInfo?.season} year=${b?.seasonInfo?.year}`,
  }));
  await test('GET /api/anime/leaderboard (trending)', `${BASE}/api/anime/leaderboard?type=trending`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} type=${b?.type}`,
  }));
  await test('GET /api/anime/leaderboard (top-rated)', `${BASE}/api/anime/leaderboard?type=top-rated`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} type=${b?.type}`,
  }));

  // ── 3. Normal Anime Search ─────────────────────────────────────────────────
  console.log('\n── 3. Normal Anime Search ──');

  await test('Search: naruto', `${BASE}/api/anime/search?q=naruto`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} first="${b?.results?.[0]?.title}"`,
  }));

  await test('Search: one piece', `${BASE}/api/anime/search?q=one+piece`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} first="${b?.results?.[0]?.title}"`,
  }));

  await test('Search: attack on titan', `${BASE}/api/anime/search?q=attack+on+titan`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} first="${b?.results?.[0]?.title}"`,
  }));

  await test('Search: demon slayer', `${BASE}/api/anime/search?q=demon+slayer`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} first="${b?.results?.[0]?.title}"`,
  }));

  await test('Search: empty q → 400', `${BASE}/api/anime/search`, (b, res) => ({
    passed: res.status === 400 && !!b?.error,
    detail: `status=${res.status} error="${b?.error}"`,
  }));

  // ── 4. Hentai / Adult Search ───────────────────────────────────────────────
  console.log('\n── 4. Hentai / Adult Search ──');

  await test('Search: mode=adult (generic)', `${BASE}/api/anime/search?q=hentai&mode=adult`, (b) => ({
    passed: Array.isArray(b?.results),  // even empty array is ok — provider may be limited
    detail: `count=${b?.results?.length ?? 0} source=${b?.source || b?.sourceUsed || '?'}`,
  }));

  await test('Search: mode=adult (redo no healer)', `${BASE}/api/anime/search?q=redo+healer&mode=adult`, (b) => ({
    passed: Array.isArray(b?.results),
    detail: `count=${b?.results?.length ?? 0} first="${b?.results?.[0]?.title || 'none'}"`,
  }));

  await test('Search: mode=mixed', `${BASE}/api/anime/search?q=ecchi&mode=mixed`, (b) => ({
    passed: Array.isArray(b?.results),
    detail: `count=${b?.results?.length ?? 0} first="${b?.results?.[0]?.title || 'none'}"`,
  }));

  // ── 5. Browse — No Filters (safe) ─────────────────────────────────────────
  console.log('\n── 5. Browse — No Filters ──');

  await test('Browse: no filters', `${BASE}/api/anime/browse?page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} source=${b?.source || '?'}`,
  }));

  // ── 6. Browse — With Filters ──────────────────────────────────────────────
  console.log('\n── 6. Browse — With Genre Filters ──');

  await test('Browse: genre=Action', `${BASE}/api/anime/browse?genre=Action&page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} first="${b?.results?.[0]?.title}"`,
  }));

  await test('Browse: genre=Romance', `${BASE}/api/anime/browse?genre=Romance&page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} first="${b?.results?.[0]?.title}"`,
  }));

  await test('Browse: genre=Fantasy&status=FINISHED', `${BASE}/api/anime/browse?genre=Fantasy&status=FINISHED&page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length}`,
  }));

  await test('Browse: type=MOVIE', `${BASE}/api/anime/browse?type=MOVIE&page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} first="${b?.results?.[0]?.title}"`,
  }));

  await test('Browse: year=2024&sort=SCORE_DESC', `${BASE}/api/anime/browse?year=2024&sort=SCORE_DESC&page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length} first="${b?.results?.[0]?.title}"`,
  }));

  // ── 7. Browse — Adult Mode ────────────────────────────────────────────────
  console.log('\n── 7. Browse — Adult Mode ──');

  await test('Browse: mode=adult', `${BASE}/api/anime/browse?mode=adult&page=1`, (b) => ({
    passed: Array.isArray(b?.results),   // empty is acceptable — provider routing
    detail: `count=${b?.results?.length ?? 0} source=${b?.source || '?'}`,
  }));

  await test('Browse: genre=Ecchi&mode=mixed', `${BASE}/api/anime/browse?genre=Ecchi&mode=mixed&page=1`, (b) => ({
    passed: Array.isArray(b?.results),
    detail: `count=${b?.results?.length ?? 0} first="${b?.results?.[0]?.title || 'none'}"`,
  }));

  // ── 8. Genre AniList route ────────────────────────────────────────────────
  console.log('\n── 8. Genre (AniList) ──');

  await test('Genre-anilist: Action', `${BASE}/api/anime/genre-anilist/Action?page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length}`,
  }));

  await test('Genre-anilist: Romance', `${BASE}/api/anime/genre-anilist/Romance?page=1`, (b) => ({
    passed: Array.isArray(b?.results) && b.results.length > 0,
    detail: `count=${b?.results?.length}`,
  }));

  // ── 9. Random Anime ───────────────────────────────────────────────────────
  console.log('\n── 9. Random ──');

  await test('GET /api/anime/random', `${BASE}/api/anime/random`, (b) => ({
    passed: !!b?.id || !!b?.title,
    detail: `id=${b?.id} title="${b?.title}"`,
  }));

  // ── 10. Static Metadata ───────────────────────────────────────────────────
  console.log('\n── 10. Static Metadata ──');

  await test('GET /api/anime/genres', `${BASE}/api/anime/genres`, (b) => ({
    passed: Array.isArray(b?.genres) && b.genres.length > 20,
    detail: `count=${b?.genres?.length} sample="${b?.genres?.slice(0,3).join(', ')}"`,
  }));

  await test('GET /api/anime/types',    `${BASE}/api/anime/types`,    (b) => ({ passed: Array.isArray(b?.types) && b.types.length > 0, detail: `count=${b?.types?.length}` }));
  await test('GET /api/anime/statuses', `${BASE}/api/anime/statuses`, (b) => ({ passed: Array.isArray(b?.statuses) && b.statuses.length > 0, detail: `count=${b?.statuses?.length}` }));
  await test('GET /api/anime/seasons',  `${BASE}/api/anime/seasons`,  (b) => ({ passed: Array.isArray(b?.seasons) && b.seasons.length === 4, detail: `count=${b?.seasons?.length}` }));
  await test('GET /api/anime/years',    `${BASE}/api/anime/years`,    (b) => ({ passed: Array.isArray(b?.years) && b.years.length > 50, detail: `count=${b?.years?.length}` }));

  // ── 11. Sources ───────────────────────────────────────────────────────────
  console.log('\n── 11. Sources ──');

  await test('GET /api/sources', `${BASE}/api/sources`, (b) => ({
    passed: Array.isArray(b?.sources),
    detail: `sources=[${b?.sources?.join(', ')}]`,
  }));

  await test('GET /api/sources/health', `${BASE}/api/sources/health`, (b) => ({
    passed: Array.isArray(b?.sources),
    detail: b?.sources?.map(s => `${s.name}:${s.status}`).join(', '),
  }));

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed).length;
  const total   = results.length;
  const pct     = Math.round((passed / total) * 100);

  console.log('\n' + '='.repeat(70));
  console.log(`  RESULTS: ${passed}/${total} passed (${pct}%)  |  ${failed} failed`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\n  ❌ FAILURES:');
    results.filter(r => !r.passed).forEach(r =>
      console.log(`    • ${r.name}  [${r.status}] ${r.elapsed} — ${r.detail}`)
    );
  }

  console.log('\n  Full results:');
  results.forEach(r =>
    console.log(`    ${r.passed ? '✅' : '❌'}  ${r.name.padEnd(55)} [${String(r.status).padEnd(3)}] ${r.elapsed.padEnd(8)} ${r.detail?.slice(0, 100) || ''}`)
  );
  console.log('');
}

runTests().catch(console.error);
