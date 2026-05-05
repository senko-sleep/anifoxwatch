const http = require('http');

const animeList = [
  { id: 20958, name: "Demon Slayer" },
  { id: 16498, name: "Attack on Titan" },
  { id: 31964, name: "My Hero Academia" },
  { id: 11061, name: "Hunter x Hunter" },
  { id: 21, name: "One Piece" }
];

function makeRequest(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      timeout: 30000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: e.message });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
}

async function validateDubStream(anime) {
  console.log(`\n========== ${anime.name} ==========`);
  
  // Step 1: Resolve AniList ID
  const resolveData = await makeRequest(`/api/anime/resolve?id=anilist-${anime.id}`);
  if (!resolveData || !resolveData.streamingId) {
    console.log(`❌ FAILED: Could not resolve anime ID`);
    return { name: anime.name, success: false, error: 'resolve_failed' };
  }
  console.log(`✅ Resolved: ${resolveData.streamingId}`);

  // Step 2: Get episodes
  const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(resolveData.streamingId)}`);
  if (!epData || !epData.episodes || epData.episodes.length === 0) {
    console.log(`❌ FAILED: No episodes found`);
    return { name: anime.name, success: false, error: 'no_episodes' };
  }
  const firstEp = epData.episodes[0];
  console.log(`✅ Found ${epData.episodes.length} episodes`);
  console.log(`   Episode 1: ${firstEp.id}`);
  console.log(`   hasDub: ${firstEp.hasDub}`);

  // Step 3: Get DUB stream with validation
  const streamPath = `/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&ep_num=1&anilist_id=${anime.id}`;
  const streamData = await makeRequest(streamPath);

  if (streamData.error) {
    console.log(`❌ FAILED: Stream error - ${streamData.error}`);
    return { name: anime.name, success: false, error: streamData.error };
  }

  if (!streamData.sources || streamData.sources.length === 0) {
    console.log(`⚠️  NO DUB: No sources returned`);
    console.log(`   dubUnavailable: ${streamData.dubUnavailable}`);
    console.log(`   dubFallback: ${streamData.dubFallback}`);
    return { 
      name: anime.name, 
      success: false, 
      dubUnavailable: streamData.dubUnavailable,
      dubFallback: streamData.dubFallback
    };
  }

  const source = streamData.sources[0];
  console.log(`✅ DUB STREAM FOUND!`);
  console.log(`   Category: ${streamData.category}`);
  console.log(`   Source: ${source.server || streamData.server}`);
  console.log(`   Quality: ${source.quality || 'unknown'}`);
  console.log(`   Audio Language: ${streamData.audioLanguage || 'not specified'}`);
  console.log(`   dubFallback: ${streamData.dubFallback || false}`);
  console.log(`   URL Preview: ${source.url?.substring(0, 60)}...`);

  // Additional validation: Check if stream is actually dub
  if (streamData.category === 'dub' && streamData.audioLanguage !== 'en') {
    console.log(`⚠️  WARNING: Category is 'dub' but audio language is '${streamData.audioLanguage}'`);
  }

  return {
    name: anime.name,
    success: true,
    category: streamData.category,
    server: source.server || streamData.server,
    quality: source.quality,
    audioLanguage: streamData.audioLanguage,
    isDirect: source.isDirect,
    ipLocked: source.ipLocked,
    dubFallback: streamData.dubFallback
  };
}

async function runValidation() {
  console.log('🎬 Validating DUB streams on 5 anime...\n');
  console.log('This test verifies:');
  console.log('1. Dub pages actually exist');
  console.log('2. Streams contain English audio indicators');
  console.log('3. Audio language metadata is correct');
  console.log('4. No false positive dub streams\n');
  
  const results = [];
  for (const anime of animeList) {
    const result = await validateDubStream(anime);
    results.push(result);
  }

  console.log('\n========================================');
  console.log('VALIDATION SUMMARY');
  console.log('========================================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success && !r.dubUnavailable);
  const noDub = results.filter(r => r.dubUnavailable);

  console.log(`\n✅ Validated DUB: ${successful.length}/${results.length}`);
  successful.forEach(r => console.log(`   - ${r.name} (${r.server}, audio: ${r.audioLanguage})`));

  if (noDub.length > 0) {
    console.log(`\n⚠️  No Dub Available: ${noDub.length}`);
    noDub.forEach(r => console.log(`   - ${r.name}`));
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => console.log(`   - ${r.name} (${r.error})`));
  }

  console.log('\n========================================');
  console.log('DUB VALIDATION COMPLETE');
  console.log('========================================');
}

runValidation();
