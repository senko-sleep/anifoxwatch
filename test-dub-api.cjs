const http = require('http');

// Comprehensive API test for dub streaming functionality
async function testDubAPI() {
  console.log('🎬 COMPREHENSIVE DUB API TEST');
  console.log('=====================================\n');
  
  // Test anime known to have good dub availability
  const testAnime = [
    { id: 16498, name: "Attack on Titan", expectedDub: true },
    { id: 21, name: "One Piece", expectedDub: true },
    { id: 20958, name: "Demon Slayer", expectedDub: true },
    { id: 31964, name: "My Hero Academia", expectedDub: true },
    { id: 30, name: "Mob Psycho 100", expectedDub: true },
    { id: 994, name: "Death Note", expectedDub: true },
    { id: 1535, name: "Death Parade", expectedDub: true },
    { id: 1735, name: "Mob Psycho 100 II", expectedDub: true },
    { id: 285, name: "Naruto", expectedDub: true },
    { id: 20, name: "Naruto Shippuden", expectedDub: true }
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
            resolve({ error: e.message, raw: data });
          }
        });
      });

      req.on('error', (e) => resolve({ error: e.message }));
      req.end();
    });
  }

  const results = [];
  
  for (const anime of testAnime) {
    console.log(`\n========== ${anime.name} (ID: ${anime.id}) ==========`);
    
    let animeResult = {
      name: anime.name,
      id: anime.id,
      expectedDub: anime.expectedDub,
      resolveSuccess: false,
      episodesFound: false,
      dubTestResults: []
    };

    // Step 1: Resolve anime
    console.log('1. Resolving anime...');
    const resolveData = await makeRequest(`/api/anime/resolve?id=anilist-${anime.id}`);
    
    if (!resolveData || resolveData.error || !resolveData.streamingId) {
      console.log(`❌ Resolve failed: ${resolveData?.error || 'No streaming ID'}`);
      results.push(animeResult);
      continue;
    }
    
    animeResult.resolveSuccess = true;
    console.log(`✅ Resolved: ${resolveData.streamingId}`);

    // Step 2: Get episodes
    console.log('2. Getting episodes...');
    const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(resolveData.streamingId)}`);
    
    if (!epData || epData.error || !epData.episodes || epData.episodes.length === 0) {
      console.log(`❌ No episodes found: ${epData?.error || 'No episodes'}`);
      results.push(animeResult);
      continue;
    }
    
    animeResult.episodesFound = true;
    const firstEp = epData.episodes[0];
    console.log(`✅ Found ${epData.episodes.length} episodes`);
    console.log(`   Episode 1: ${firstEp.id}`);
    console.log(`   hasDub: ${firstEp.hasDub}`);

    // Step 3: Test different sources for dub
    const sources = ['9anime', 'gogoanime', 'allanime', 'animekai', 'animepahe'];
    
    for (const source of sources) {
      console.log(`\n3.${sources.indexOf(source) + 1} Testing ${source} for DUB...`);
      
      const streamData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&server=${source}&ep_num=1&anilist_id=${anime.id}`);
      
      let sourceResult = {
        source: source,
        success: false,
        error: null,
        category: null,
        server: null,
        quality: null,
        audioLanguage: null,
        dubFallback: null,
        dubUnavailable: null,
        url: null,
        isActualDub: false
      };

      if (streamData.error) {
        sourceResult.error = streamData.error;
        console.log(`❌ Error: ${streamData.error}`);
      } else if (!streamData.sources || streamData.sources.length === 0) {
        sourceResult.dubUnavailable = streamData.dubUnavailable;
        sourceResult.dubFallback = streamData.dubFallback;
        console.log(`⚠️  No sources (dubUnavailable: ${streamData.dubUnavailable}, dubFallback: ${streamData.dubFallback})`);
      } else {
        const sourceInfo = streamData.sources[0];
        sourceResult.success = true;
        sourceResult.category = streamData.category;
        sourceResult.server = sourceInfo.server || streamData.server;
        sourceResult.quality = sourceInfo.quality || 'unknown';
        sourceResult.audioLanguage = streamData.audioLanguage || 'not specified';
        sourceResult.dubFallback = streamData.dubFallback || false;
        sourceResult.dubUnavailable = streamData.dubUnavailable || false;
        sourceResult.url = sourceInfo.url?.substring(0, 60) + '...';
        
        // Check if it's actually a dub
        sourceResult.isActualDub = streamData.category === 'dub' && !streamData.dubFallback;
        
        console.log(`✅ Stream found!`);
        console.log(`   Category: ${streamData.category}`);
        console.log(`   Server: ${sourceResult.server}`);
        console.log(`   Quality: ${sourceResult.quality}`);
        console.log(`   Audio: ${sourceResult.audioLanguage}`);
        console.log(`   dubFallback: ${sourceResult.dubFallback}`);
        console.log(`   dubUnavailable: ${sourceResult.dubUnavailable}`);
        console.log(`   Actual Dub: ${sourceResult.isActualDub ? '✅ YES' : '❌ NO'}`);
        console.log(`   URL: ${sourceResult.url}`);
      }
      
      animeResult.dubTestResults.push(sourceResult);
    }
    
    results.push(animeResult);
  }

  // Summary
  console.log('\n=====================================');
  console.log('COMPREHENSIVE DUB API TEST RESULTS');
  console.log('=====================================\n');
  
  const actualDubStreams = [];
  const noDubStreams = [];
  const errors = [];
  
  results.forEach(result => {
    const workingDubs = result.dubTestResults.filter(r => r.isActualDub);
    const noDubs = result.dubTestResults.filter(r => !r.isActualDub && r.success);
    const sourceErrors = result.dubTestResults.filter(r => r.error);
    
    if (workingDubs.length > 0) {
      actualDubStreams.push({
        anime: result.name,
        sources: workingDubs.map(w => `${w.source} (${w.server})`)
      });
    }
    
    if (noDubs.length > 0 && sourceErrors.length === 0) {
      noDubStreams.push({
        anime: result.name,
        sources: noDubs.map(n => `${n.source} (${n.category})`)
      });
    }
    
    if (sourceErrors.length > 0 || !result.resolveSuccess || !result.episodesFound) {
      errors.push({
        anime: result.name,
        issues: [
          !result.resolveSuccess ? 'resolve failed' : null,
          !result.episodesFound ? 'no episodes' : null,
          ...sourceErrors.map(e => `${e.source}: ${e.error}`)
        ].filter(Boolean)
      });
    }
  });

  console.log(`✅ ACTUAL DUB STREAMS FOUND (${actualDubStreams.length}):`);
  actualDubStreams.forEach(item => {
    console.log(`   ${item.anime}:`);
    item.sources.forEach(source => console.log(`     - ${source}`));
  });

  if (noDubStreams.length > 0) {
    console.log(`\n⚠️  NO DUB STREAMS (${noDubStreams.length}):`);
    noDubStreams.forEach(item => {
      console.log(`   ${item.anime}:`);
      item.sources.forEach(source => console.log(`     - ${source}`));
    });
  }

  if (errors.length > 0) {
    console.log(`\n❌ ERRORS (${errors.length}):`);
    errors.forEach(item => {
      console.log(`   ${item.anime}:`);
      item.issues.forEach(issue => console.log(`     - ${issue}`));
    });
  }

  console.log('\n=====================================');
  console.log('SCRAPING RECOMMENDATIONS:');
  console.log('=====================================');
  
  if (actualDubStreams.length > 0) {
    console.log('\n✅ WORKING DUB SOURCES FOUND:');
    console.log('These sources can be used for dub anime scraping:');
    actualDubStreams.forEach(item => {
      console.log(`- ${item.anime}: ${item.sources.join(', ')}`);
    });
    
    console.log('\n🎯 To scrape and play dub anime:');
    console.log('1. Use the sources listed above');
    console.log('2. Test with the anime that have working dubs');
    console.log('3. Implement proper dub detection in your scraper');
    console.log('4. Use the API endpoints that return actual dub streams');
  } else {
    console.log('\n❌ NO WORKING DUB SOURCES FOUND');
    console.log('Recommendations:');
    console.log('1. Find a new source that has actual dub content');
    console.log('2. Implement custom dub extraction');
    console.log('3. Use external APIs that provide dub streams');
    console.log('4. Consider user-uploaded dub content');
  }

  console.log('\n=====================================');
  console.log('API TEST COMPLETE');
  console.log('=====================================');
}

testDubAPI();
