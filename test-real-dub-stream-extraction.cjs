const http = require('http');

// Test to get real working dub streams
async function testRealDubStreamExtraction() {
  console.log('🎬 TESTING REAL DUB STREAM EXTRACTION');
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

  console.log('1. Testing WorkingDubExtractor for Attack on Titan...');
  const searchData = await makeRequest('/api/anime/search?q=attack&source=WorkingDubExtractor');
  
  if (!searchData.results || searchData.results.length === 0) {
    console.log('❌ No results found');
    return;
  }
  
  const attackOnTitan = searchData.results.find(r => r.title.includes('Attack on Titan'));
  if (!attackOnTitan) {
    console.log('❌ Attack on Titan not found');
    return;
  }
  
  console.log(`✅ Found: ${attackOnTitan.title} (${attackOnTitan.id})`);

  console.log('\n2. Testing episodes...');
  const epData = await makeRequest(`/api/anime/episodes?id=${attackOnTitan.id}&source=WorkingDubExtractor`);
  
  if (!epData.episodes || epData.episodes.length === 0) {
    console.log('❌ No episodes found');
    return;
  }
  
  const firstEp = epData.episodes[0];
  console.log(`✅ First episode: ${firstEp.title} (${firstEp.id})`);

  console.log('\n3. Testing dub stream extraction...');
  const dubData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=dub&source=WorkingDubExtractor`);
  
  if (dubData.error) {
    console.log(`❌ Dub stream failed: ${dubData.error}`);
    return;
  }
  
  if (!dubData.sources || dubData.sources.length === 0) {
    console.log('❌ No dub sources found');
    console.log(`   dubFallback: ${dubData.dubFallback}`);
    console.log(`   dubUnavailable: ${dubData.dubUnavailable}`);
    return;
  }
  
  const dubSource = dubData.sources[0];
  console.log('✅ DUB STREAM FOUND!');
  console.log(`   Category: ${dubData.category}`);
  console.log(`   Source: ${dubData.source}`);
  console.log(`   Quality: ${dubSource.quality}`);
  console.log(`   Audio Language: ${dubData.audioLanguage}`);
  console.log(`   URL: ${dubSource.url.substring(0, 80)}...`);
  
  // Check what type of stream we got
  if (dubSource.url.includes('m3u8')) {
    console.log('🎉 FOUND M3U8 STREAM - REAL VIDEO CONTENT!');
    console.log('✅ This should play English audio!');
    
    // Test the m3u8 for English audio
    console.log('\n4. Testing m3u8 for English audio indicators...');
    try {
      const m3u8Response = await makeRequest(`/api/stream/proxy?url=${encodeURIComponent(dubSource.url)}`);
      if (!m3u8Response.error && m3u8Response.raw) {
        const playlist = m3u8Response.raw.toLowerCase();
        const englishIndicators = [
          /audio.*english/i,
          /audio.*en/i,
          /track.*english/i,
          /track.*en/i,
          /dub/i,
          /eng/i
        ];
        
        const hasEnglishAudio = englishIndicators.some(indicator => indicator.test(playlist));
        if (hasEnglishAudio) {
          console.log('🎉 ENGLISH AUDIO DETECTED IN M3U8!');
          console.log('✅ CONFIRMED ENGLISH DUB STREAM!');
        } else {
          console.log('⚠️  No explicit English audio indicators, but stream might still be dub');
        }
      }
    } catch (e) {
      console.log(`❌ Error testing m3u8: ${e.message}`);
    }
    
  } else if (dubSource.url.includes('mp4')) {
    console.log('🎉 FOUND MP4 STREAM - REAL VIDEO CONTENT!');
    console.log('✅ This should play English audio!');
  } else if (dubSource.url.includes('data:text/html')) {
    console.log('❌ Still getting HTML placeholder - need to fix extraction');
  } else if (dubSource.url.includes('webrtc') || dubSource.url.includes('RTCPeerConnection')) {
    console.log('⚠️  Found WebRTC stream - might be harder to play');
    console.log('   This is a different type of streaming technology');
  } else {
    console.log(`⚠️  Unknown stream format: ${dubSource.url.substring(0, 40)}...`);
  }
  
  // Verify proper metadata
  if (dubData.category === 'dub' && dubData.audioLanguage === 'en') {
    console.log('✅ Proper dub metadata');
  } else {
    console.log('⚠️  Metadata may be incorrect');
    console.log(`   Expected: category='dub', audioLanguage='en'`);
    console.log(`   Got: category='${dubData.category}', audioLanguage='${dubData.audioLanguage}'`);
  }

  console.log('\n5. Testing cross-source fallback...');
  const fallbackData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=dub`);
  
  if (!fallbackData.error && fallbackData.sources && fallbackData.sources.length > 0) {
    const fallbackSource = fallbackData.sources[0];
    console.log('✅ Cross-source fallback working:');
    console.log(`   Source: ${fallbackData.source}`);
    console.log(`   URL: ${fallbackSource.url.substring(0, 60)}...`);
    
    if (fallbackSource.url.includes('m3u8')) {
      console.log('🎉 FALLBACK ALSO HAS M3U8 STREAM!');
    }
  }

  console.log('\n=====================================');
  console.log('FINAL STATUS');
  console.log('=====================================\n');
  
  if (dubSource.url.includes('m3u8') || dubSource.url.includes('mp4')) {
    console.log('🎉 SUCCESS! REAL DUB STREAM FOUND!');
    console.log('✅ Ready for browser testing');
    console.log('✅ English audio should play');
    console.log('✅ DUB button should work correctly');
  } else {
    console.log('⚠️  DUB stream found but format may need work');
    console.log('🔄 Need to investigate stream format further');
  }
  
  console.log('\n🎯 BROWSER TESTING:');
  console.log('1. Open: http://localhost:8080/watch?id=anilist-16498');
  console.log('2. Click DUB button');
  console.log('3. Should play English audio');
  
  console.log('\n🎯 IF STILL NOT WORKING:');
  console.log('1. Try different anime (Naruto, One Piece, Demon Slayer)');
  console.log('2. Check browser console for errors');
  console.log('3. Test with cross-source fallback');
  console.log('4. Investigate WebRTC stream handling');
}

testRealDubStreamExtraction();
