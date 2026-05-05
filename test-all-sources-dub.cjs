const http = require('http');

// Test each source for dub availability
const sources = [
  { name: 'Gogoanime', id: 'gogoanime' },
  { name: 'AllAnime', id: 'allanime' },
  { name: 'AnimeKai', id: 'animekai' },
  { name: 'AnimePahe', id: 'animepahe' }
];

const animeList = [
  { id: 20958, name: "Demon Slayer" },
  { id: 16498, name: "Attack on Titan" },
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

async function testSourceForDub(source, anime) {
  console.log(`\n--- Testing ${source.name} for ${anime.name} ---`);
  
  // Resolve anime
  const resolveData = await makeRequest(`/api/anime/resolve?id=anilist-${anime.id}`);
  if (!resolveData || !resolveData.streamingId) {
    console.log(`❌ Resolve failed`);
    return null;
  }
  console.log(`✅ Resolved: ${resolveData.streamingId}`);

  // Get episodes
  const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(resolveData.streamingId)}`);
  if (!epData || !epData.episodes || epData.episodes.length === 0) {
    console.log(`❌ No episodes`);
    return null;
  }
  const firstEp = epData.episodes[0];
  console.log(`✅ Found ${epData.episodes.length} episodes`);

  // Test specific source for dub
  const streamData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&server=${source.id}&ep_num=1&anilist_id=${anime.id}`);
  
  if (streamData.error) {
    console.log(`❌ Stream error: ${streamData.error}`);
    return { source: source.name, success: false, error: streamData.error };
  }

  if (!streamData.sources || streamData.sources.length === 0) {
    console.log(`⚠️  No dub sources`);
    console.log(`   dubUnavailable: ${streamData.dubUnavailable}`);
    console.log(`   dubFallback: ${streamData.dubFallback}`);
    return { source: source.name, success: false, noDub: true };
  }

  const sourceInfo = streamData.sources[0];
  console.log(`✅ DUB FOUND!`);
  console.log(`   Source: ${sourceInfo.server || streamData.server}`);
  console.log(`   Quality: ${sourceInfo.quality || 'unknown'}`);
  console.log(`   Category: ${streamData.category}`);
  console.log(`   Audio: ${streamData.audioLanguage || 'not specified'}`);
  console.log(`   URL: ${sourceInfo.url?.substring(0, 60)}...`);

  return {
    source: source.name,
    success: true,
    server: sourceInfo.server || streamData.server,
    quality: sourceInfo.quality,
    audioLanguage: streamData.audioLanguage,
    category: streamData.category
  };
}

async function testAllSources() {
  console.log('🎬 Testing all sources for DUB streams...\n');
  
  const results = [];
  
  for (const anime of animeList) {
    console.log(`\n========================================`);
    console.log(`Testing: ${anime.name}`);
    console.log(`========================================`);
    
    const animeResults = [];
    for (const source of sources) {
      const result = await testSourceForDub(source, anime);
      if (result) {
        animeResults.push(result);
      }
    }
    
    results.push({ anime: anime.name, results: animeResults });
  }

  console.log('\n========================================');
  console.log('FINAL RESULTS');
  console.log('========================================');
  
  results.forEach(({ anime, results: animeResults }) => {
    console.log(`\n${anime}:`);
    const successful = animeResults.filter(r => r.success);
    const failed = animeResults.filter(r => !r.success && !r.noDub);
    const noDub = animeResults.filter(r => r.noDub);
    
    if (successful.length > 0) {
      console.log(`  ✅ Working dubs:`);
      successful.forEach(r => console.log(`     - ${r.source} (${r.server}, audio: ${r.audioLanguage})`));
    }
    
    if (noDub.length > 0) {
      console.log(`  ⚠️  No dub available:`);
      noDub.forEach(r => console.log(`     - ${r.source}`));
    }
    
    if (failed.length > 0) {
      console.log(`  ❌ Errors:`);
      failed.forEach(r => console.log(`     - ${r.source} (${r.error})`));
    }
  });

  // Summary
  const allSuccessful = results.flatMap(r => r.results).filter(r => r.success);
  console.log(`\n========================================`);
  console.log(`SUMMARY: ${allSuccessful.length} working dub streams found`);
  console.log('========================================');
}

testAllSources();
