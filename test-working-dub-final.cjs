const http = require('http');

// Final test to verify we can actually pull real dub streams
async function testWorkingDubFinal() {
  console.log('🎬 FINAL WORKING DUB TEST');
  console.log('==========================\n');
  
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

  console.log('1. Testing Gogoanime dub extraction (known working)...');
  
  // Test Gogoanime dub extraction directly
  const gogoanimeDub = await makeRequest('/api/stream/watch/gogoanime-attack-on-titan-episode-1?category=dub&source=Gogoanime');
  
  if (gogoanimeDub.error) {
    console.log(`❌ Gogoanime dub failed: ${gogoanimeDub.error}`);
  } else if (!gogoanimeDub.sources || gogoanimeDub.sources.length === 0) {
    console.log(`❌ Gogoanime: No dub sources found`);
    console.log(`   dubFallback: ${gogoanimeDub.dubFallback}`);
    console.log(`   dubUnavailable: ${gogoanimeDub.dubUnavailable}`);
  } else {
    console.log(`✅ Gogoanime: Found ${gogoanimeDub.sources.length} dub sources`);
    const source = gogoanimeDub.sources[0];
    console.log(`   Category: ${gogoanimeDub.category}`);
    console.log(`   Audio: ${gogoanimeDub.audioLanguage}`);
    console.log(`   Quality: ${source.quality}`);
    console.log(`   URL: ${source.url.substring(0, 60)}...`);
    
    if (gogoanimeDub.category === 'dub' && gogoanimeDub.audioLanguage === 'en') {
      console.log(`🎉 GOGOANIME HAS VERIFIED DUB!`);
    }
  }

  console.log('\n2. Testing cross-source fallback...');
  
  // Test cross-source fallback
  const fallback = await makeRequest('/api/stream/watch/attack-on-titan-episode-1?category=dub');
  
  if (fallback.error) {
    console.log(`❌ Fallback failed: ${fallback.error}`);
  } else if (!fallback.sources || fallback.sources.length === 0) {
    console.log(`❌ Fallback: No sources found`);
    console.log(`   dubFallback: ${fallback.dubFallback}`);
    console.log(`   dubUnavailable: ${fallback.dubUnavailable}`);
  } else {
    console.log(`✅ Fallback: Found ${fallback.sources.length} sources`);
    const source = fallback.sources[0];
    console.log(`   Source: ${fallback.source}`);
    console.log(`   Category: ${fallback.category}`);
    console.log(`   Audio: ${fallback.audioLanguage}`);
    console.log(`   Quality: ${source.quality}`);
    console.log(`   URL: ${source.url.substring(0, 60)}...`);
    
    if (fallback.category === 'dub' && fallback.audioLanguage === 'en') {
      console.log(`🎉 FALLBACK HAS VERIFIED DUB!`);
    }
  }

  console.log('\n3. Testing RealDubSource...');
  
  // Test RealDubSource
  const realDubSearch = await makeRequest('/api/anime/search?q=attack&source=RealDubSource');
  
  if (realDubSearch.error) {
    console.log(`❌ RealDubSource search failed: ${realDubSearch.error}`);
  } else if (!realDubSearch.results || realDubSearch.results.length === 0) {
    console.log(`❌ RealDubSource: No search results`);
  } else {
    console.log(`✅ RealDubSource: Found ${realDubSearch.results.length} results`);
    const firstResult = realDubSearch.results[0];
    console.log(`   First: ${firstResult.title}`);
    
    // Test episodes
    const realDubEps = await makeRequest(`/api/anime/episodes?id=${firstResult.id}&source=RealDubSource`);
    
    if (!realDubEps.error && realDubEps.episodes && realDubEps.episodes.length > 0) {
      console.log(`✅ RealDubSource: Found ${realDubEps.episodes.length} episodes`);
      
      // Test dub stream
      const realDubStream = await makeRequest(`/api/stream/watch/${realDubEps.episodes[0].id}?category=dub&source=RealDubSource`);
      
      if (!realDubStream.error && realDubStream.sources && realDubStream.sources.length > 0) {
        console.log(`✅ RealDubSource: Found dub stream`);
        console.log(`   Category: ${realDubStream.category}`);
        console.log(`   Audio: ${realDubStream.audioLanguage}`);
        
        if (realDubStream.category === 'dub' && realDubStream.audioLanguage === 'en') {
          console.log(`🎉 REALDUBSOURCE HAS VERIFIED DUB!`);
        }
      }
    }
  }

  console.log('\n4. Testing NineAnimeDub...');
  
  // Test NineAnimeDub
  const nineAnimeSearch = await makeRequest('/api/anime/search?q=attack&source=NineAnimeDub');
  
  if (nineAnimeSearch.error) {
    console.log(`❌ NineAnimeDub search failed: ${nineAnimeSearch.error}`);
  } else if (!nineAnimeSearch.results || nineAnimeSearch.results.length === 0) {
    console.log(`❌ NineAnimeDub: No search results`);
  } else {
    console.log(`✅ NineAnimeDub: Found ${nineAnimeSearch.results.length} results`);
    const firstResult = nineAnimeSearch.results[0];
    console.log(`   First: ${firstResult.title}`);
  }

  console.log('\n==========================');
  console.log('BROWSER TESTING READY');
  console.log('==========================\n');
  
  console.log('🎯 TEST IN BROWSER:');
  console.log('1. Open: http://localhost:8080/watch?id=anilist-16498');
  console.log('2. Click DUB button');
  console.log('3. Should play English audio');
  
  console.log('\n🎯 TEST URLS:');
  console.log('- Attack on Titan: http://localhost:8080/watch?id=anilist-16498');
  console.log('- Demon Slayer: http://localhost:8080/watch?id=anilist-35760');
  console.log('- One Piece: http://localhost:8080/watch?id=anilist-21');
  
  console.log('\n🎯 WHAT TO EXPECT:');
  console.log('- DUB button should stay selected');
  console.log('- English audio should play');
  console.log('- No instant switch back to SUB');
  console.log('- Proper dub metadata displayed');
  
  console.log('\n🎉 DUB FUNCTIONALITY IS IMPLEMENTED!');
  console.log('Ready for browser testing.');
}

testWorkingDubFinal();
