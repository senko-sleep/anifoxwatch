const http = require('http');

// Test the WorkingDubSource specifically
async function testWorkingDubSource() {
  console.log('🎬 TESTING WORKING DUB SOURCE');
  console.log('=====================================\n');
  
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

  console.log('1. Testing WorkingDubSource search...');
  const searchData = await makeRequest('/api/anime/search?q=attack%20on%20titan&source=WorkingDubSource');
  
  if (searchData.error) {
    console.log(`❌ Search failed: ${searchData.error}`);
  } else {
    console.log(`✅ Search successful: Found ${searchData.results?.length || 0} results`);
    if (searchData.results?.length > 0) {
      const firstResult = searchData.results[0];
      console.log(`   First result: ${firstResult.title}`);
      console.log(`   ID: ${firstResult.id}`);
      console.log(`   Dub count: ${firstResult.dubCount}`);
    }
  }

  console.log('\n2. Testing WorkingDubSource episodes...');
  if (searchData.results?.length > 0) {
    const animeId = searchData.results[0].id;
    const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(animeId)}`);
    
    if (epData.error) {
      console.log(`❌ Episodes failed: ${epData.error}`);
    } else {
      console.log(`✅ Episodes successful: Found ${epData.episodes?.length || 0} episodes`);
      if (epData.episodes?.length > 0) {
        const firstEp = epData.episodes[0];
        console.log(`   First episode: ${firstEp.title}`);
        console.log(`   Episode ID: ${firstEp.id}`);
        console.log(`   Has dub: ${firstEp.hasDub}`);
        
        console.log('\n3. Testing WorkingDubSource dub stream...');
        const streamData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&source=WorkingDubSource&ep_num=1`);
        
        if (streamData.error) {
          console.log(`❌ Stream failed: ${streamData.error}`);
        } else if (!streamData.sources || streamData.sources.length === 0) {
          console.log(`⚠️  No sources found`);
          console.log(`   dubUnavailable: ${streamData.dubUnavailable}`);
          console.log(`   dubFallback: ${streamData.dubFallback}`);
        } else {
          const source = streamData.sources[0];
          console.log(`✅ DUB STREAM FOUND!`);
          console.log(`   Category: ${streamData.category}`);
          console.log(`   Source: ${source.server || streamData.source}`);
          console.log(`   Quality: ${source.quality || 'unknown'}`);
          console.log(`   Audio Language: ${streamData.audioLanguage || 'not specified'}`);
          console.log(`   dubFallback: ${streamData.dubFallback || false}`);
          console.log(`   dubUnavailable: ${streamData.dubUnavailable || false}`);
          console.log(`   URL: ${source.url?.substring(0, 60)}...`);
          
          // Check if it's actually a dub
          if (streamData.category === 'dub' && !streamData.dubFallback) {
            console.log(`🎉 ACTUAL WORKING DUB STREAM!`);
          } else {
            console.log(`⚠️  Stream found but may not be actual dub`);
          }
        }
      }
    }
  }

  console.log('\n4. Testing trending dub anime...');
  const trendingData = await makeRequest('/api/anime/trending?page=1&source=WorkingDubSource');
  
  if (trendingData.error) {
    console.log(`❌ Trending failed: ${trendingData.error}`);
  } else if (Array.isArray(trendingData)) {
    console.log(`✅ Trending successful: Found ${trendingData.length || 0} anime`);
    trendingData.slice(0, 3).forEach((anime, i) => {
      console.log(`   ${i + 1}. ${anime.title} (dubCount: ${anime.dubCount})`);
    });
  } else {
    console.log(`✅ Trending response received (not an array): ${typeof trendingData}`);
  }

  console.log('\n=====================================');
  console.log('WORKING DUB SOURCE TEST COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 NEXT STEPS:');
  console.log('1. If tests pass, the WorkingDubSource is functional');
  console.log('2. Test dub playback in browser at http://localhost:8080');
  console.log('3. Search for dub anime and try playing episodes');
  console.log('4. Verify the DUB button works and plays actual dub content');
}

testWorkingDubSource();
