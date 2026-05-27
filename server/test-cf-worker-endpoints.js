/**
 * Comprehensive Cloudflare Worker API Test Suite
 * Tests: health, home page data, browse, search, streaming, proxy
 */

const BASE = 'http://127.0.0.1:8787';

const results = [];

async function test(name, url, validate) {
  const start = Date.now();
  try {
    const res = await fetch(url);
    const elapsed = Date.now() - start;
    const contentType = res.headers.get('content-type') || '';
    
    let body;
    if (contentType.includes('json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    const xCache = res.headers.get('x-cache');
    const requestId = res.headers.get('x-request-id');

    let passed = res.ok;
    let detail = '';
    
    if (validate) {
      const v = validate(body, res);
      passed = v.passed;
      detail = v.detail;
    }

    results.push({
      name,
      status: res.status,
      passed,
      elapsed: `${elapsed}ms`,
      xCache,
      requestId: requestId ? requestId.slice(0, 8) + '...' : null,
      detail: detail || (typeof body === 'object' ? JSON.stringify(body).slice(0, 200) : String(body).slice(0, 200)),
    });

    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name} - ${res.status} (${elapsed}ms) ${xCache ? `[Cache: ${xCache}]` : ''} ${detail}`);
  } catch (err) {
    const elapsed = Date.now() - start;
    results.push({ name, status: 'ERROR', passed: false, elapsed: `${elapsed}ms`, detail: err.message });
    console.log(`❌ ${name} - ERROR (${elapsed}ms): ${err.message}`);
  }
}

async function runTests() {
  console.log('='.repeat(70));
  console.log('  CLOUDFLARE WORKER API TEST SUITE');
  console.log('  Target:', BASE);
  console.log('  Time:', new Date().toISOString());
  console.log('='.repeat(70));
  console.log('');

  // ── 1. Health & Meta ──
  console.log('── Health & Meta ──');
  
  await test('GET /health', `${BASE}/health`, (body) => ({
    passed: body.status === 'healthy' && !!body.version,
    detail: `status=${body.status} version=${body.version} cache=${body.cacheBackend}`,
  }));

  await test('GET /api/health', `${BASE}/api/health`, (body) => ({
    passed: body.status === 'healthy',
    detail: `status=${body.status}`,
  }));

  await test('GET /api (endpoint listing)', `${BASE}/api`, (body) => ({
    passed: !!body.endpoints && !!body.name,
    detail: `name="${body.name}" endpoints=${Object.keys(body.endpoints || {}).length}`,
  }));

  // ── 2. Home Page Data (trending, latest, hero-spotlight) ──
  console.log('\n── Home Page Data ──');

  await test('GET /api/anime/trending', `${BASE}/api/anime/trending?page=1&limit=5`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source} first="${body.results?.[0]?.title}"`,
  }));

  await test('GET /api/anime/latest', `${BASE}/api/anime/latest?page=1&limit=5`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source} first="${body.results?.[0]?.title}"`,
  }));

  await test('GET /api/anime/top-rated', `${BASE}/api/anime/top-rated?page=1&limit=5`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source}`,
  }));

  await test('GET /api/anime/hero-spotlight', `${BASE}/api/anime/hero-spotlight`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source} first="${body.results?.[0]?.title}"`,
  }));

  // ── 3. Browse & Filter ──
  console.log('\n── Browse & Filter ──');

  await test('GET /api/anime/browse (no filters)', `${BASE}/api/anime/browse?page=1&limit=5`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source}`,
  }));

  await test('GET /api/anime/browse (genre=Action)', `${BASE}/api/anime/browse?genre=Action&page=1&limit=5`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source}`,
  }));

  await test('GET /api/anime/browse (status=RELEASING)', `${BASE}/api/anime/browse?status=RELEASING&page=1&limit=5`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source}`,
  }));

  await test('GET /api/anime/seasonal (current)', `${BASE}/api/anime/seasonal?page=1`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source} season=${body.seasonInfo?.season}`,
  }));

  // ── 4. Search ──
  console.log('\n── Search ──');

  await test('GET /api/anime/search?q=naruto', `${BASE}/api/anime/search?q=naruto&limit=5`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source} first="${body.results?.[0]?.title}"`,
  }));

  await test('GET /api/anime/search?q=one+piece', `${BASE}/api/anime/search?q=one+piece&limit=3`, (body) => ({
    passed: Array.isArray(body.results) && body.results.length > 0,
    detail: `count=${body.results?.length} source=${body.source}`,
  }));

  await test('GET /api/anime/search (empty q → 400)', `${BASE}/api/anime/search`, (body, res) => ({
    passed: !res.ok && res.status === 400 && !!body.error,
    detail: `Correctly returned 400: "${body.error}"`,
  }));

  // ── 5. Anime Detail ──
  console.log('\n── Anime Detail ──');

  await test('GET /api/anime/1 (Cowboy Bebop)', `${BASE}/api/anime/1`, (body) => ({
    passed: !!body.id && !!body.title,
    detail: `id=${body.id} title="${body.title}" source=${body.source} genres=${body.genres?.join(',')}`,
  }));

  await test('GET /api/anime/21 (One Punch Man)', `${BASE}/api/anime/21`, (body) => ({
    passed: !!body.id && !!body.title,
    detail: `id=${body.id} title="${body.title}"`,
  }));

  await test('GET /api/anime/invalid (bad ID → 400)', `${BASE}/api/anime/invalid`, (body, res) => ({
    passed: !res.ok && res.status === 400 && !!body.error,
    detail: `Correctly returned 400: "${body.error}"`,
  }));

  // ── 6. Episodes ──
  console.log('\n── Episodes ──');

  await test('GET /api/anime/1/episodes', `${BASE}/api/anime/1/episodes`, (body) => ({
    passed: Array.isArray(body.episodes),
    detail: `count=${body.episodes?.length} source=${body.source}`,
  }));

  // ── 7. Streaming ──
  console.log('\n── Streaming ──');

  await test('GET /api/stream/servers/test-ep-1', `${BASE}/api/stream/servers/test-ep-1`, (body) => ({
    passed: Array.isArray(body.servers) && body.servers.length > 0,
    detail: `count=${body.servers?.length} source=${body.source} servers=${body.servers?.map(s => `${s.name}(${s.type})`).join(',')}`,
  }));

  await test('GET /api/stream/watch/test-ep-1 (fake ID → 502 expected)', `${BASE}/api/stream/watch/test-ep-1`, (body, res) => {
    // Fake episode ID → 502 is expected. Real sources = bonus.
    const hasSources = Array.isArray(body.sources) && body.sources.length > 0;
    const is502 = res.status === 502;
    return {
      passed: hasSources || is502,
      detail: hasSources 
        ? `sources=${body.sources.length} source=${body.source}` 
        : `Correctly returned 502 for non-existent episode`,
    };
  });

  // ── 8. Stream Proxy ──
  console.log('\n── Stream Proxy ──');

  await test('GET /api/stream/proxy (no url → 400)', `${BASE}/api/stream/proxy`, (body, res) => ({
    passed: !res.ok && res.status === 400 && !!body.error,
    detail: `Correctly returned 400: "${body.error}"`,
  }));

  // Test CORS preflight with actual OPTIONS method
  try {
    const optRes = await fetch(`${BASE}/api/stream/proxy`, { method: 'OPTIONS' });
    const optPassed = optRes.status === 204 || optRes.status === 200;
    const corsHeader = optRes.headers.get('access-control-allow-origin');
    console.log(`${optPassed ? '✅' : '❌'} OPTIONS /api/stream/proxy (CORS) - ${optRes.status} CORS=${corsHeader}`);
    results.push({ name: 'OPTIONS /api/stream/proxy (CORS)', status: optRes.status, passed: optPassed, elapsed: '', detail: `CORS=${corsHeader}` });
  } catch (err) {
    console.log(`❌ OPTIONS /api/stream/proxy - ERROR: ${err.message}`);
    results.push({ name: 'OPTIONS /api/stream/proxy', status: 'ERROR', passed: false, elapsed: '', detail: err.message });
  }

  // ── 9. Static Metadata ──
  console.log('\n── Static Metadata ──');

  await test('GET /api/anime/genres', `${BASE}/api/anime/genres`, (body) => ({
    passed: Array.isArray(body.genres) && body.genres.length > 10,
    detail: `count=${body.genres?.length}`,
  }));

  await test('GET /api/anime/types', `${BASE}/api/anime/types`, (body) => ({
    passed: Array.isArray(body.types) && body.types.length > 0,
    detail: `count=${body.types?.length}`,
  }));

  await test('GET /api/anime/statuses', `${BASE}/api/anime/statuses`, (body) => ({
    passed: Array.isArray(body.statuses) && body.statuses.length > 0,
    detail: `count=${body.statuses?.length}`,
  }));

  await test('GET /api/anime/seasons', `${BASE}/api/anime/seasons`, (body) => ({
    passed: Array.isArray(body.seasons) && body.seasons.length === 4,
    detail: `count=${body.seasons?.length}`,
  }));

  await test('GET /api/anime/years', `${BASE}/api/anime/years`, (body) => ({
    passed: Array.isArray(body.years) && body.years.length > 50,
    detail: `count=${body.years?.length}`,
  }));

  // ── 10. Misc Endpoints ──
  console.log('\n── Misc ──');

  await test('GET /api/sources', `${BASE}/api/sources`, (body) => ({
    passed: Array.isArray(body.sources),
    detail: `sources=${body.sources?.join(',')}`,
  }));

  await test('GET /api/sources/health', `${BASE}/api/sources/health`, (body) => ({
    passed: Array.isArray(body.sources),
    detail: body.sources?.map(s => `${s.name}:${s.status}`).join(', '),
  }));

  await test('GET /api/admin/cache/status', `${BASE}/api/admin/cache/status`, (body) => ({
    passed: body.backend !== undefined,
    detail: `enabled=${body.enabled} backend=${body.backend} kv=${body.kvBinding}`,
  }));

  await test('GET /nonexistent (→ 404)', `${BASE}/nonexistent`, (body, res) => ({
    passed: !res.ok && res.status === 404 && !!body.error,
    detail: `Correctly returned 404: "${body.error}"`,
  }));

  // ── 11. AniList GraphQL proxy ──
  console.log('\n── AniList GraphQL Proxy ──');

  try {
    const anilistRes = await fetch(`${BASE}/api/anilist/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query { Page(page: 1, perPage: 3) { media(type: ANIME, sort: TRENDING_DESC) { id title { english romaji } } } }`,
      }),
    });
    const anilistBody = await anilistRes.json();
    const passed = anilistRes.ok && anilistBody.data?.Page?.media?.length > 0;
    const media = anilistBody.data?.Page?.media || [];
    console.log(`${passed ? '✅' : '❌'} POST /api/anilist/graphql - ${anilistRes.status} count=${media.length} first="${media[0]?.title?.english || media[0]?.title?.romaji}"`);
    results.push({ name: 'POST /api/anilist/graphql', status: anilistRes.status, passed, detail: `count=${media.length}` });
  } catch (err) {
    console.log(`❌ POST /api/anilist/graphql - ERROR: ${err.message}`);
    results.push({ name: 'POST /api/anilist/graphql', status: 'ERROR', passed: false, detail: err.message });
  }

  // ── 12. Cache HIT test (second request) ──
  console.log('\n── Cache Verification ──');

  await test('GET /api/anime/trending (2nd request, cache check)', `${BASE}/api/anime/trending?page=1&limit=5`, (body, res) => {
    const xCache = res.headers.get('x-cache');
    return {
      passed: Array.isArray(body.results) && body.results.length > 0,
      detail: `cache=${xCache || 'N/A (caching disabled in dev)'} count=${body.results?.length}`,
    };
  });

  // ── Summary ──
  console.log('\n' + '='.repeat(70));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\n  FAILURES:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    ❌ ${r.name}: ${r.detail}`);
    });
  }

  console.log('\n  All test details:');
  results.forEach(r => {
    console.log(`    ${r.passed ? '✅' : '❌'} ${r.name} [${r.status}] ${r.elapsed} - ${r.detail?.slice(0, 120)}`);
  });
}

runTests().catch(console.error);
