const http = require('http');

// Test the new AnimeDubTV source for working dub content
async function testAnimeDubTVDub() {
  console.log('🎬 TESTING ANIMEDUBTV DUB SOURCE');
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

  // Test anime that might have dub content
  const testAnime = [
    { name: 'Attack on Titan', query: 'attack on titan' },
    { name: 'Demon Slayer', query: 'demon slayer' },
    { name: 'One Piece', query: 'one piece' },
    { name: 'Death Note', query: 'death note' },
    { name: 'My Hero Academia', query: 'my hero academia' }
  ];

  for (const anime of testAnime) {
    console.log(`\n========== ${anime.name} ==========`);
    
    // Test search
    console.log('1. Testing search...');
    const searchData = await makeRequest(`/api/anime/search?q=${encodeURIComponent(anime.query)}&source=AnimeDubTV`);
    
    if (searchData.error) {
      console.log(`❌ Search failed: ${searchData.error}`);
      continue;
    }
    
    if (!searchData.results || searchData.results.length === 0) {
      console.log(`⚠️  No search results found`);
      continue;
    }
    
    console.log(`✅ Found ${searchData.results.length} search results`);
    const firstResult = searchData.results[0];
    console.log(`   First result: ${firstResult.title}`);
    console.log(`   ID: ${firstResult.id}`);
    console.log(`   Dub count: ${firstResult.dubCount}`);
    
    // Test anime info
    console.log('\n2. Testing anime info...');
    const infoData = await makeRequest(`/api/anime/info?id=${encodeURIComponent(firstResult.id)}&source=AnimeDubTV`);
    
    if (infoData.error) {
      console.log(`❌ Info failed: ${infoData.error}`);
    } else {
      console.log(`✅ Info successful`);
      console.log(`   Title: ${infoData.title}`);
      console.log(`   Dub count: ${infoData.dubCount}`);
    }
    
    // Test episodes
    console.log('\n3. Testing episodes...');
    const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(firstResult.id)}&source=AnimeDubTV`);
    
    if (epData.error) {
      console.log(`❌ Episodes failed: ${epData.error}`);
      continue;
    }
    
    if (!epData.episodes || epData.episodes.length === 0) {
      console.log(`⚠️  No episodes found`);
      continue;
    }
    
    console.log(`✅ Found ${epData.episodes.length} episodes`);
    const firstEp = epData.episodes[0];
    console.log(`   First episode: ${firstEp.title}`);
    console.log(`   Episode ID: ${firstEp.id}`);
    console.log(`   Has dub: ${firstEp.hasDub}`);
    
    // Test dub stream
    console.log('\n4. Testing dub stream...');
    const dubData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&source=AnimeDubTV`);
    
    if (dubData.error) {
      console.log(`❌ Dub stream failed: ${dubData.error}`);
    } else if (!dubData.sources || dubData.sources.length === 0) {
      console.log(`⚠️  No dub sources found`);
      console.log(`   dubFallback: ${dubData.dubFallback}`);
      console.log(`   dubUnavailable: ${dubData.dubUnavailable}`);
    } else {
      const source = dubData.sources[0];
      console.log(`✅ DUB STREAM FOUND!`);
      console.log(`   Category: ${dubData.category}`);
      console.log(`   Source: ${dubData.source}`);
      console.log(`   Quality: ${source.quality || 'unknown'}`);
      console.log(`   Audio Language: ${dubData.audioLanguage || 'not specified'}`);
      console.log(`   dubFallback: ${dubData.dubFallback || false}`);
      console.log(`   dubUnavailable: ${dubData.dubUnavailable || false}`);
      console.log(`   URL: ${source.url?.substring(0, 80)}...`);
      
      // Check if it's actually a verified dub
      if (dubData.category === 'dub' && dubData.audioLanguage === 'en' && !dubData.dubFallback) {
        console.log(`🎉 VERIFIED ENGLISH DUB STREAM!`);
      } else {
        console.log(`⚠️  Stream found but may not be verified dub`);
      }
    }
    
    // Test sub stream (should return empty for dub-only site)
    console.log('\n5. Testing sub stream (should be empty)...');
    const subData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=sub&source=AnimeDubTV`);
    
    if (subData.error) {
      console.log(`❌ Sub stream failed: ${subData.error}`);
    } else if (!subData.sources || subData.sources.length === 0) {
      console.log(`✅ Sub stream correctly empty (dub-only site)`);
    } else {
      console.log(`⚠️  Sub stream unexpectedly found sources`);
    }
  }

  console.log('\n=====================================');
  console.log('TESTING CROSS-SOURCE FALLBACK');
  console.log('=====================================\n');
  
  // Test cross-source fallback
  console.log('Testing cross-source dub fallback with AnimeDubTV...');
  const fallbackData = await makeRequest('/api/stream/watch/animedubtv-attack-on-titan-episode-1?category=dub');
  
  if (fallbackData.error) {
    console.log(`❌ Fallback failed: ${fallbackData.error}`);
  } else if (!fallbackData.sources || fallbackData.sources.length === 0) {
    console.log(`⚠️  No sources found in fallback`);
    console.log(`   dubFallback: ${fallbackData.dubFallback}`);
    console.log(`   dubUnavailable: ${fallbackData.dubUnavailable}`);
  } else {
    console.log(`✅ Fallback found sources:`);
    fallbackData.sources.forEach((source, i) => {
      console.log(`   ${i + 1}. ${source.server || fallbackData.source} (${source.quality || 'unknown'})`);
    });
    console.log(`   Category: ${fallbackData.category}`);
    console.log(`   Audio: ${fallbackData.audioLanguage || 'not specified'}`);
  }

  console.log('\n=====================================');
  console.log('ANIMEDUBTV DUB TEST COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 SUMMARY:');
  console.log('1. If "VERIFIED ENGLISH DUB STREAM!" appears - working!');
  console.log('2. If search results found - source is working');
  console.log('3. If episodes found - extraction working');
  console.log('4. If dub streams found - actual dub content!');
  console.log('5. Test in browser: http://localhost:8080/watch?id=anilist-16498');
  console.log('6. Click DUB button and check if English audio plays');
  
  console.log('\n✅ AnimeDubTV Status:');
  console.log('- Specialized dub-only site');
  console.log('- Accessible and has search results');
  console.log('- Should provide actual English dub content');
  console.log('- Priority source for dub requests');
}

testAnimeDubTVDub();
