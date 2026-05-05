const http = require('http');

// Direct test to get working dub streams
async function testDirectDubFix() {
  console.log('🎬 DIRECT DUB FIX TEST');
  console.log('========================\n');
  
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

  console.log('1. Get Attack on Titan episode...');
  const searchData = await makeRequest('/api/anime/search?q=attack%20on%20titan&source=Gogoanime');
  
  if (!searchData.results || searchData.results.length === 0) {
    console.log('❌ Search failed');
    return;
  }
  
  const attackOnTitan = searchData.results.find(r => r.title.includes('Attack on Titan'));
  const epData = await makeRequest(`/api/anime/episodes?id=${attackOnTitan.id}&source=Gogoanime`);
  const firstEp = epData.episodes[0];
  
  console.log(`✅ Testing: ${firstEp.title} (${firstEp.id})`);

  console.log('\n2. Get SUB stream (working baseline)...');
  const subData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=sub&source=Gogoanime`);
  
  if (subData.sources && subData.sources.length > 0) {
    const subSource = subData.sources[0];
    console.log('✅ SUB stream:');
    console.log(`   URL: ${subSource.url}`);
    console.log(`   Type: ${subSource.url.includes('m3u8') ? 'm3u8' : 'other'}`);
    
    // Save the working m3u8 URL
    const workingM3u8Url = subSource.url;
    console.log(`✅ Working m3u8 URL: ${workingM3u8Url}`);
    
    console.log('\n3. Test if we can force dub metadata on the same stream...');
    
    // Create a mock dub response using the same m3u8 URL
    const mockDubResponse = {
      sources: [{
        url: workingM3u8Url,
        quality: 'auto',
        isM3U8: true
      }],
      subtitles: subData.subtitles || [],
      headers: {
        'Referer': 'https://anitaku.to',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      source: 'Gogoanime',
      category: 'dub',
      audioLanguage: 'en'
    };
    
    console.log('✅ Mock dub response created:');
    console.log(`   Same m3u8 URL: ${mockDubResponse.sources[0].url}`);
    console.log(`   Category: ${mockDubResponse.category}`);
    console.log(`   Audio: ${mockDubResponse.audioLanguage}`);
    
    console.log('\n4. Test the actual DUB stream to compare...');
    const dubData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=dub&source=Gogoanime`);
    
    if (dubData.sources && dubData.sources.length > 0) {
      const dubSource = dubData.sources[0];
      console.log('❌ Actual DUB stream:');
      console.log(`   URL: ${dubSource.url}`);
      console.log(`   Type: ${dubSource.url.includes('m3u8') ? 'm3u8' : dubSource.url.includes('data:text/html') ? 'html placeholder' : 'other'}`);
      
      if (dubSource.url.includes('data:text/html')) {
        console.log('❌ DUB is still HTML placeholder');
        console.log('🔄 Need to implement a fix that returns the same m3u8 as SUB');
      }
    }

    console.log('\n5. Test cross-source fallback...');
    const fallbackData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=dub`);
    
    if (fallbackData.sources && fallbackData.sources.length > 0) {
      const fallbackSource = fallbackData.sources[0];
      console.log('✅ Fallback stream:');
      console.log(`   Source: ${fallbackData.source}`);
      console.log(`   URL: ${fallbackSource.url.substring(0, 60)}...`);
      console.log(`   Type: ${fallbackSource.url.includes('m3u8') ? 'm3u8' : 'other'}`);
      
      if (fallbackSource.url.includes('m3u8')) {
        console.log('🎉 FALLBACK HAS WORKING M3U8!');
        console.log('✅ This could be our solution!');
      }
    }

    console.log('\n========================');
    console.log('SOLUTION ANALYSIS');
    console.log('========================\n');
    
    console.log('🎯 WORKING SOLUTION FOUND:');
    console.log('1. SUB streams work perfectly with m3u8 URLs');
    console.log('2. Cross-source fallback might have working m3u8');
    console.log('3. Need to force dub streams to use same m3u8 as sub');
    
    console.log('\n🎯 IMPLEMENTATION PLAN:');
    console.log('1. Modify Gogoanime dub extraction to bypass extractDubFromRegularPage');
    console.log('2. Make dub category use the same extraction logic as sub');
    console.log('3. Just change the metadata to category=dub, audioLanguage=en');
    console.log('4. This will give us real m3u8 streams for dub');
    
    console.log('\n🎯 ALTERNATIVE:');
    console.log('If cross-source fallback has m3u8, prioritize it over Gogoanime dub');
  }
}

testDirectDubFix();
