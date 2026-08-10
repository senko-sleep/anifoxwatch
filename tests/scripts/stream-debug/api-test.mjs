/**
 * Backend API endpoint diagnostic for stream resolution.
 *
 * Tests the actual HTTP API endpoints that the frontend calls.
 * Measures response times and identifies timeout issues.
 *
 * Usage:
 *   node tests/scripts/stream-debug/api-test.mjs [anilistId] [episodeNum]
 *   node tests/scripts/stream-debug/api-test.mjs 1639 2
 */

const API_BASE = 'http://localhost:3001';

async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    clearTimeout(tid);
    const data = await res.json();
    return { status: res.status, data };
  } catch (e) {
    clearTimeout(tid);
    return { status: 0, error: e.message };
  }
}

async function testStreamEndpoint(anilistId, episodeNum = 2) {
  const episodeId = `anilist-${anilistId}?ep=${episodeNum}`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`API TEST: ${episodeId}`);
  console.log('='.repeat(60));

  const t0 = Date.now();
  const url = `${API_BASE}/api/stream/watch/${encodeURIComponent(`anilist-${anilistId}`)}?ep=${episodeNum}&category=sub&ep_num=${episodeNum}&anilist_id=${anilistId}`;

  console.log(`  URL: ${url}`);
  console.log('  Sending request (timeout: 60s)...');

  const result = await fetchWithTimeout(url, 60000);
  const elapsed = Date.now() - t0;

  console.log(`  Response: ${result.status || 'timeout/error'} (${elapsed}ms)`);

  if (result.error) {
    console.log(`  Error: ${result.error}`);
    return { success: false, error: result.error, elapsed };
  }

  if (result.data.error) {
    console.log(`  API Error: ${result.data.error}`);
    console.log(`  Suggestion: ${result.data.suggestion || 'none'}`);
    console.log(`  Last error: ${result.data.lastError || 'none'}`);
    return { success: false, error: result.data.error, elapsed };
  }

  console.log(`  Source: ${result.data.source || 'none'}`);
  console.log(`  Sources: ${result.data.sources?.length || 0}`);
  if (result.data.sources?.length > 0) {
    result.data.sources.forEach((s, i) => {
      console.log(`    [${i}] ${s.quality} m3u8=${s.isM3U8} embed=${s.isEmbed} direct=${s.isDirect}`);
      const url = s.url || s.originalUrl || '';
      console.log(`        ${url.slice(0, 100)}${url.length > 100 ? '...' : ''}`);
    });
  }
  console.log(`  Subtitles: ${result.data.subtitles?.length || 0}`);
  console.log(`  Dub fallback: ${result.data.dubFallback || false}`);

  return { success: true, elapsed, data: result.data };
}

async function run() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.log('Usage: node api-test.mjs [anilistId] [episodeNum]');
    console.log('Example: node api-test.mjs 1639 2');
    process.exit(1);
  }

  const results = [];
  for (const id of ids) {
    const ep = process.argv[process.argv.indexOf(id) + 1];
    const epNum = ep && /^\d+$/.test(ep) ? parseInt(ep, 10) : 2;
    const result = await testStreamEndpoint(id, epNum);
    results.push(result);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  results.forEach(r => {
    console.log(`  anilist-${r.anilistId || '?'}: ${r.success ? `OK (${r.elapsed}ms)` : `FAIL: ${r.error}`}`);
  });

  const okResults = results.filter(r => r.success);
  if (okResults.length > 0) {
    const avgTime = okResults.reduce((sum, r) => sum + r.elapsed, 0) / okResults.length;
    console.log(`\n  Avg API response time: ${Math.round(avgTime)}ms`);
    console.log(`  Frontend timeout:      10000ms (10s) — ${avgTime > 10000 ? '⚠️  TOO SHORT' : '✓ OK'}`);
    console.log(`  Backend global timeout:10000ms (10s) — ${avgTime > 10000 ? '⚠️  TOO SHORT' : '✓ OK'}`);
  }

  process.exit(0);
}

run();
