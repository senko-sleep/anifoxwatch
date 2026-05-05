const http = require('http');

// Test the improved Gogoanime dub extraction
async function testImprovedGogoanimeDub() {
  console.log('🎬 TESTING IMPROVED GOGOANIME DUB EXTRACTION');
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

  // Test anime with known dub indicators
  const testAnime = [
    { id: 'gogoanime-attack-on-titan-episode-1', name: 'Attack on Titan Ep 1' },
    { id: 'gogoanime-one-piece-episode-1', name: 'One Piece Ep 1' },
    { id: 'gogoanime-demon-slayer-episode-1', name: 'Demon Slayer Ep 1' }
  ];

  for (const anime of testAnime) {
    console.log(`\n========== ${anime.name} ==========`);
    
    // Test dub extraction
    console.log('1. Testing dub extraction...');
    const dubData = await makeRequest(`/api/stream/watch/${encodeURIComponent(anime.id)}?category=dub&source=gogoanime`);
    
    if (dubData.error) {
      console.log(`❌ Dub request failed: ${dubData.error}`);
    } else if (!dubData.sources || dubData.sources.length === 0) {
      console.log(`⚠️  No dub sources found`);
      console.log(`   dubFallback: ${dubData.dubFallback}`);
      console.log(`   dubUnavailable: ${dubData.dubUnavailable}`);
      console.log(`   category: ${dubData.category}`);
    } else {
      const source = dubData.sources[0];
      console.log(`✅ DUB STREAM FOUND!`);
      console.log(`   Category: ${dubData.category}`);
      console.log(`   Source: ${dubData.source}`);
      console.log(`   Quality: ${source.quality || 'unknown'}`);
      console.log(`   Audio Language: ${dubData.audioLanguage || 'not specified'}`);
      console.log(`   dubFallback: ${dubData.dubFallback || false}`);
      console.log(`   dubUnavailable: ${dubData.dubUnavailable || false}`);
      console.log(`   URL: ${source.url?.substring(0, 60)}...`);
      
      // Check if it's actually a verified dub
      if (dubData.category === 'dub' && dubData.audioLanguage === 'en' && !dubData.dubFallback) {
        console.log(`🎉 VERIFIED ENGLISH DUB STREAM!`);
      } else {
        console.log(`⚠️  Stream found but may not be verified dub`);
      }
    }
    
    // Compare with sub extraction
    console.log('\n2. Comparing with sub extraction...');
    const subData = await makeRequest(`/api/stream/watch/${encodeURIComponent(anime.id)}?category=sub&source=gogoanime`);
    
    if (subData.error) {
      console.log(`❌ Sub request failed: ${subData.error}`);
    } else if (!subData.sources || subData.sources.length === 0) {
      console.log(`⚠️  No sub sources found`);
    } else {
      console.log(`✅ Sub stream found: ${subData.sources.length} sources`);
      console.log(`   Category: ${subData.category}`);
      
      // Compare URLs to see if they're different
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
  
  // Test cross-source fallback for dub
  console.log('Testing cross-source dub fallback for Attack on Titan...');
  const fallbackData = await makeRequest('/api/stream/watch/gogoanime-attack-on-titan-episode-1?category=dub');
  
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
  console.log('IMPROVED GOGOANIME DUB TEST COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 SUMMARY:');
  console.log('1. If "VERIFIED ENGLISH DUB STREAM!" appears - working!');
  console.log('2. If dub and sub URLs are different - good sign');
  console.log('3. If category is "dub" and audioLanguage is "en" - proper metadata');
  console.log('4. Test in browser: http://localhost:8080/watch?id=anilist-16498');
}

testImprovedGogoanimeDub();
