const http = require('http');

// Test the enhanced AnimeHeaven dub functionality
async function testAnimeHeavenDub() {
  console.log('🎬 TESTING ENHANCED ANIMEHEAVEN DUB');
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
    { id: 'animeheaven-attack-on-titan', name: 'Attack on Titan' },
    { id: 'animeheaven-demon-slayer', name: 'Demon Slayer' },
    { id: 'animeheaven-one-piece', name: 'One Piece' },
    { id: 'animeheaven-death-note', name: 'Death Note' },
    { id: 'animeheaven-my-hero-academia', name: 'My Hero Academia' }
  ];

  for (const anime of testAnime) {
    console.log(`\n========== ${anime.name} ==========`);
    
    // Test search first
    console.log('1. Testing search...');
    const searchData = await makeRequest(`/api/anime/search?q=${encodeURIComponent(anime.name)}&source=AnimeHeaven`);
    
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
    
    // Test episodes
    console.log('\n2. Testing episodes...');
    const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(firstResult.id)}&source=AnimeHeaven`);
    
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
    console.log(`   First episode: ${firstEp.title} (hasDub: ${firstEp.hasDub})`);
    
    // Test dub stream
    console.log('\n3. Testing dub stream...');
    const dubData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&source=AnimeHeaven`);
    
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
    
    // Compare with sub stream
    console.log('\n4. Comparing with sub stream...');
    const subData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=sub&source=AnimeHeaven`);
    
    if (subData.error) {
      console.log(`❌ Sub stream failed: ${subData.error}`);
    } else if (!subData.sources || subData.sources.length === 0) {
      console.log(`⚠️  No sub sources found`);
    } else {
      console.log(`✅ Sub stream found: ${subData.sources.length} sources`);
      console.log(`   Category: ${subData.category}`);
      
      // Compare URLs
      if (dubData.sources && dubData.sources.length > 0 && subData.sources && subData.sources.length > 0) {
        const dubUrl = dubData.sources[0].url;
        const subUrl = subData.sources[0].url;
        
        if (dubUrl === subUrl) {
          console.log(`⚠️  Dub and sub URLs are the same - likely not actual dub`);
        } else {
          console.log(`✅ Dub and sub URLs are different - good sign for actual dub`);
        }
      }
    }
  }

  console.log('\n=====================================');
  console.log('TESTING CROSS-SOURCE FALLBACK');
  console.log('=====================================\n');
  
  // Test cross-source fallback
  console.log('Testing cross-source dub fallback...');
  const fallbackData = await makeRequest('/api/stream/watch/animeheaven-attack-on-titan-episode-1?category=dub');
  
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
  console.log('ANIMEHEAVEN DUB TEST COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 SUMMARY:');
  console.log('1. If "VERIFIED ENGLISH DUB STREAM!" appears - working!');
  console.log('2. If dub and sub URLs are different - good sign');
  console.log('3. If category is "dub" and audioLanguage is "en" - proper metadata');
  console.log('4. Test in browser: http://localhost:8080/watch?id=anilist-16498');
  console.log('5. Click DUB button and check if English audio plays');
}

testAnimeHeavenDub();
