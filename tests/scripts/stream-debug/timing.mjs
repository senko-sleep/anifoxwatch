/**
 * Backend stream resolution timing diagnostic.
 *
 * Measures how long each stage of stream resolution takes for anilist- IDs.
 * Helps identify timeout mismatches between frontend and backend.
 *
 * Usage:
 *   node tests/scripts/stream-debug/timing.mjs [anilistId] [episodeNum]
 *   node tests/scripts/stream-debug/timing.mjs 1639 2
 */

import { sourceManager } from '../../server/dist/services/source-manager.js';

const DEFAULT_TIMEOUT = 60000;

async function measureStream(anilistId, episodeNum = 2) {
  const episodeId = `anilist-${anilistId}?ep=${episodeNum}`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STREAM RESOLUTION: ${episodeId}`);
  console.log('='.repeat(60));

  const t0 = Date.now();

  try {
    console.log('  [1/4] Calling sourceManager.getStreamingLinks...');
    const streamStart = Date.now();
    const result = await Promise.race([
      sourceManager.getStreamingLinks(episodeId, undefined, 'sub', episodeNum, parseInt(anilistId, 10)),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${DEFAULT_TIMEOUT}ms`)), DEFAULT_TIMEOUT)),
    ]);
    const elapsed = Date.now() - streamStart;

    console.log(`  [RESULT] Completed in ${elapsed}ms`);
    console.log(`    Source: ${result.source || 'none'}`);
    console.log(`    Sources count: ${result.sources?.length || 0}`);
    if (result.sources?.length > 0) {
      result.sources.forEach((s, i) => {
        console.log(`      [${i}] quality=${s.quality} isM3U8=${s.isM3U8} isEmbed=${s.isEmbed}`);
        console.log(`          url: ${(s.url || s.originalUrl || '').slice(0, 100)}`);
      });
    }
    console.log(`    Subtitles: ${result.subtitles?.length || 0}`);
    console.log(`    Dub fallback: ${result.dubFallback || false}`);

    return { success: true, elapsed, result };
  } catch (e) {
    console.log(`  [FAILED] ${e.message} (${Date.now() - t0}ms total)`);
    return { success: false, error: e.message, elapsed: Date.now() - t0 };
  }
}

async function run() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.log('Usage: node timing.mjs [anilistId] [episodeNum]');
    console.log('Example: node timing.mjs 1639 2');
    process.exit(1);
  }

  const results = [];
  for (const id of ids) {
    const ep = process.argv[process.argv.indexOf(id) + 1];
    const epNum = ep && /^\d+$/.test(ep) ? parseInt(ep, 10) : 2;
    const result = await measureStream(id, epNum);
    results.push(result);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  results.forEach(r => {
    console.log(`  anilist-${r.episodeId?.split('?')[0] || '?'}: ${r.success ? `OK (${r.elapsed}ms)` : `FAIL: ${r.error}`}`);
  });

  const avgTime = results.filter(r => r.success).reduce((sum, r) => sum + r.elapsed, 0) / results.filter(r => r.success).length;
  console.log(`\n  Avg resolution time: ${Math.round(avgTime)}ms`);
  console.log(`  Frontend timeout:   10000ms (10s) — ${avgTime > 10000 ? '⚠️  TOO SHORT' : '✓ OK'}`);
  console.log(`  Backend timeout:    10000ms (10s) — ${avgTime > 10000 ? '⚠️  TOO SHORT' : '✓ OK'}`);

  process.exit(0);
}

run();
