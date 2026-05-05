const http = require('http');

// Anime known to have good dub availability
const knownDubAnime = [
  { id: 16498, name: "Attack on Titan" },
  { id: 21, name: "One Piece" },
  { id: 31964, name: "My Hero Academia" },
  { id: 30, name: "Mob Psycho 100" },
  { id: 994, name: "Death Note" },
  { id: 1535, name: "Death Parade" },
  { id: 1735, name: "Mob Psycho 100 II" },
  { id: 20958, name: "Demon Slayer" }
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

async function testKnownDubAnime(anime) {
  console.log(`\n========== ${anime.name} ==========`);
  
  // Step 1: Resolve AniList ID
  const resolveData = await makeRequest(`/api/anime/resolve?id=anilist-${anime.id}`);
  if (!resolveData || !resolveData.streamingId) {
    console.log(`❌ Resolve failed`);
    return { name: anime.name, success: false, error: 'resolve' };
  }
  console.log(`✅ Resolved: ${resolveData.streamingId}`);

  // Step 2: Get episodes
  const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(resolveData.streamingId)}`);
  if (!epData || !epData.episodes || epData.episodes.length === 0) {
    console.log(`❌ No episodes`);
    return { name: anime.name, success: false, error: 'episodes' };
  }
  const firstEp = epData.episodes[0];
  console.log(`✅ Found ${epData.episodes.length} episodes`);

  // Step 3: Try different sources for dub
  const sources = ['AnimeKai', 'AllAnime', 'AnimePahe', 'Gogoanime'];
  let foundDub = false;
  
  for (const source of sources) {
    console.log(`\n--- Testing ${source} ---`);
    const streamData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&server=${source.toLowerCase()}&ep_num=1&anilist_id=${anime.id}`);
    
    if (streamData.error) {
      console.log(`❌ Error: ${streamData.error}`);
      continue;
    }

    if (!streamData.sources || streamData.sources.length === 0) {
      console.log(`⚠️  No sources (dubUnavailable: ${streamData.dubUnavailable})`);
      continue;
    }

    const sourceInfo = streamData.sources[0];
    console.log(`✅ DUB FOUND!`);
    console.log(`   Category: ${streamData.category}`);
    console.log(`   Source: ${sourceInfo.server || streamData.server}`);
    console.log(`   Quality: ${sourceInfo.quality || 'unknown'}`);
    console.log(`   Audio: ${streamData.audioLanguage || 'not specified'}`);
    console.log(`   dubFallback: ${streamData.dubFallback || false}`);
    
    // Check if it's actually a dub
    if (streamData.category === 'dub') {
      foundDub = true;
      return {
        name: anime.name,
        success: true,
        source: source,
        server: sourceInfo.server || streamData.server,
        category: streamData.category,
        audioLanguage: streamData.audioLanguage,
        quality: sourceInfo.quality
      };
    } else {
      console.log(`⚠️  Returned as sub, not dub`);
    }
  }

  if (!foundDub) {
    console.log(`❌ No working dub found for any source`);
    return { name: anime.name, success: false, noDub: true };
  }
}

async function findRealDubs() {
  console.log('🔍 Finding anime with ACTUAL working dub streams...\n');
  
  const results = [];
  for (const anime of knownDubAnime) {
    const result = await testKnownDubAnime(anime);
    results.push(result);
  }

  console.log('\n========================================');
  console.log('RESULTS - ACTUAL WORKING DUBS');
  console.log('========================================');
  
  const working = results.filter(r => r.success);
  const noDub = results.filter(r => r.noDub);
  const failed = results.filter(r => !r.success && !r.noDub);

  if (working.length > 0) {
    console.log(`\n✅ WORKING DUB STREAMS (${working.length}):`);
    working.forEach(r => console.log(`   - ${r.name} (${r.source} -> ${r.server})`));
  }

  if (noDub.length > 0) {
    console.log(`\n⚠️  NO DUB AVAILABLE (${noDub.length}):`);
    noDub.forEach(r => console.log(`   - ${r.name}`));
  }

  if (failed.length > 0) {
    console.log(`\n❌ ERRORS (${failed.length}):`);
    failed.forEach(r => console.log(`   - ${r.name} (${r.error})`));
  }

  console.log('\n========================================');
  console.log(`SUMMARY: ${working.length} out of ${results.length} anime have working dub streams`);
  console.log('========================================');
  
  if (working.length > 0) {
    console.log('\n🎬 Test these anime in your browser:');
    working.forEach(r => console.log(`   http://localhost:8080/watch?id=anilist-${r.id}`));
  }
}

findRealDubs();
