/**
 * Run: node server/testing/test-naruto-stream.js
 * 1. Search "Naruto"
 * 2. For each of the first N results: get episodes, then try stream for first episode
 * 3. Stop when one stream returns sources (no assumptions - keeps testing until it works)
 *
 * Server must be running (npm run dev from server/). Tries ports 3001, 3002, 3003, 3004.
 */
const API_BASES = (process.env.API_BASE || process.env.API_URL || 'http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004').split(',').map((s) => s.trim());
const MAX_RESULTS_TO_TRY = 8;

async function resolveApiBase() {
  for (const base of API_BASES) {
    try {
      const r = await fetch(`${base.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return base.replace(/\/$/, '');
    } catch (_) {}
  }
  throw new Error(`No API server found. Tried: ${API_BASES.join(', ')}. Start with: cd server && npm run dev`);
}

async function main() {
  const API = await resolveApiBase();
  console.log('API base:', API);
  console.log('');

  // 1) Search
  console.log('1) GET /api/anime/search?q=Naruto&page=1');
  const searchRes = await fetch(`${API}/api/anime/search?q=Naruto&page=1`);
  if (!searchRes.ok) {
    console.log('Search failed:', searchRes.status, await searchRes.text());
    process.exit(1);
  }
  const searchData = await searchRes.json();
  const results = searchData.results || [];
  if (results.length === 0) {
    console.log('No search results');
    process.exit(1);
  }
  console.log(`   Got ${results.length} results. Will try streaming for up to ${MAX_RESULTS_TO_TRY} anime.\n`);

  for (let i = 0; i < Math.min(MAX_RESULTS_TO_TRY, results.length); i++) {
    const anime = results[i];
    const animeId = anime.id;
    console.log(`--- [${i + 1}/${Math.min(MAX_RESULTS_TO_TRY, results.length)}] ${anime.title} (${anime.source}) id=${animeId}`);

    // 2) Episodes
    const epRes = await fetch(`${API}/api/anime/episodes?id=${encodeURIComponent(animeId)}`);
    if (!epRes.ok) {
      console.log('   Episodes failed:', epRes.status);
      continue;
    }
    const epData = await epRes.json();
    const episodes = epData.episodes || [];
    if (episodes.length === 0) {
      console.log('   No episodes');
      continue;
    }
    const firstEp = episodes[0];
    const episodeId = firstEp.id;
    console.log(`   Episode: ${firstEp.number} "${firstEp.title}" id=${episodeId}`);

    // 3) Stream
    const watchUrl = `${API}/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub`;
    try {
      const streamRes = await fetch(watchUrl);
      const streamData = await streamRes.json().catch(() => ({}));
      const sources = streamData.sources || [];

      if (streamRes.ok && sources.length > 0) {
        console.log(`   SUCCESS: server=${streamData.server} sources=${sources.length}`);
        console.log(`   First URL: ${sources[0].url?.slice(0, 70)}...`);
        console.log('\nStreaming is working.');
        process.exit(0);
      }
      console.log(`   No sources (${streamRes.status})`);
    } catch (e) {
      console.log('   Request error:', e.message);
    }
  }

  console.log('\nNo streaming source found after trying', Math.min(MAX_RESULTS_TO_TRY, results.length), 'anime.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
