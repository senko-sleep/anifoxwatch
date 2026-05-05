const http = require('http');

// Debug Gogoanime dub streams to find real video URLs
async function debugGogoanimeDubStreams() {
  console.log('🔍 DEBUGGING GOGOANIME DUB STREAMS');
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

  console.log('1. Testing Gogoanime search for Attack on Titan...');
  const searchData = await makeRequest('/api/anime/search?q=attack on titan&source=Gogoanime');
  
  if (searchData.error) {
    console.log(`❌ Search failed: ${searchData.error}`);
    return;
  }
  
  if (!searchData.results || searchData.results.length === 0) {
    console.log('❌ No search results found');
    return;
  }
  
  console.log(`✅ Found ${searchData.results.length} results`);
  const attackOnTitan = searchData.results.find(r => r.title.includes('Attack on Titan'));
  
  if (!attackOnTitan) {
    console.log('❌ Attack on Titan not found');
    return;
  }
  
  console.log(`✅ Found: ${attackOnTitan.title} (${attackOnTitan.id})`);
  console.log(`   Episodes: ${attackOnTitan.episodes}`);
  console.log(`   Dub count: ${attackOnTitan.dubCount}`);

  console.log('\n2. Testing episodes...');
  const epData = await makeRequest(`/api/anime/episodes?id=${attackOnTitan.id}&source=Gogoanime`);
  
  if (epData.error || !epData.episodes || epData.episodes.length === 0) {
    console.log('❌ Episodes failed');
    return;
  }
  
  console.log(`✅ Found ${epData.episodes.length} episodes`);
  const firstEp = epData.episodes[0];
  console.log(`   First episode: ${firstEp.title} (${firstEp.id})`);
  console.log(`   Has dub: ${firstEp.hasDub}`);

  console.log('\n3. Testing SUB stream (should work)...');
  const subData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=sub&source=Gogoanime`);
  
  if (subData.error) {
    console.log(`❌ Sub stream failed: ${subData.error}`);
  } else if (!subData.sources || subData.sources.length === 0) {
    console.log('❌ No sub sources found');
  } else {
    const subSource = subData.sources[0];
    console.log('✅ SUB STREAM FOUND:');
    console.log(`   Category: ${subData.category}`);
    console.log(`   Audio: ${subData.audioLanguage}`);
    console.log(`   Quality: ${subSource.quality}`);
    console.log(`   URL: ${subSource.url.substring(0, 80)}...`);
    
    if (subSource.url.includes('data:text/html')) {
      console.log('❌ SUB is also HTML placeholder - Gogoanime extraction broken');
    } else if (subSource.url.includes('m3u8')) {
      console.log('✅ SUB has m3u8 stream - Gogoanime working for sub');
    } else {
      console.log(`⚠️  SUB has unknown format: ${subSource.url.substring(0, 40)}...`);
    }
  }

  console.log('\n4. Testing DUB stream (current issue)...');
  const dubData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=dub&source=Gogoanime`);
  
  if (dubData.error) {
    console.log(`❌ Dub stream failed: ${dubData.error}`);
  } else if (!dubData.sources || dubData.sources.length === 0) {
    console.log('❌ No dub sources found');
    console.log(`   dubFallback: ${dubData.dubFallback}`);
    console.log(`   dubUnavailable: ${dubData.dubUnavailable}`);
  } else {
    const dubSource = dubData.sources[0];
    console.log('✅ DUB STREAM FOUND:');
    console.log(`   Category: ${dubData.category}`);
    console.log(`   Audio: ${dubData.audioLanguage}`);
    console.log(`   Quality: ${dubSource.quality}`);
    console.log(`   dubFallback: ${dubData.dubFallback}`);
    console.log(`   dubUnavailable: ${dubData.dubUnavailable}`);
    console.log(`   URL: ${dubSource.url.substring(0, 80)}...`);
    
    if (dubSource.url.includes('data:text/html')) {
      console.log('❌ DUB is HTML placeholder - need to fix extraction');
      
      // Let's examine what the HTML placeholder contains
      console.log('\n5. Examining HTML placeholder content...');
      try {
        const htmlResponse = await makeRequest(`/api/stream/proxy?url=${encodeURIComponent(dubSource.url)}`);
        if (htmlResponse.raw) {
          console.log('HTML placeholder content (first 500 chars):');
          console.log(htmlResponse.raw.substring(0, 500));
          
          // Look for any video URLs in the HTML
          const urlMatches = htmlResponse.raw.match(/https?:\/\/[^\s"']+\.(?:m3u8|mp4)[^\s"']*/gi);
          if (urlMatches && urlMatches.length > 0) {
            console.log('\n✅ Found potential video URLs in HTML:');
            urlMatches.forEach((url, i) => {
              console.log(`   ${i + 1}. ${url}`);
            });
          } else {
            console.log('\n❌ No video URLs found in HTML placeholder');
          }
        }
      } catch (e) {
        console.log(`❌ Error examining HTML: ${e.message}`);
      }
    } else if (dubSource.url.includes('m3u8')) {
      console.log('✅ DUB has m3u8 stream - real content!');
      console.log('🎉 REAL DUB STREAM FOUND!');
    } else {
      console.log(`⚠️  DUB has unknown format: ${dubSource.url.substring(0, 40)}...`);
    }
  }

  console.log('\n6. Testing other episodes for dub...');
  if (epData.episodes.length > 1) {
    const secondEp = epData.episodes[1];
    console.log(`\n--- Testing ${secondEp.title} ---`);
    
    const secondDubData = await makeRequest(`/api/stream/watch/${secondEp.id}?category=dub&source=Gogoanime`);
    
    if (secondDubData.sources && secondDubData.sources.length > 0) {
      const source = secondDubData.sources[0];
      if (!source.url.includes('data:text/html')) {
        console.log('✅ Second episode has real dub stream!');
        console.log(`   URL: ${source.url.substring(0, 60)}...`);
      } else {
        console.log('❌ Second episode also has HTML placeholder');
      }
    } else {
      console.log('❌ Second episode no dub sources');
    }
  }

  console.log('\n=====================================');
  console.log('DEBUG COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 NEXT STEPS:');
  console.log('1. If SUB streams work but DUB streams are HTML placeholders:');
  console.log('   - Fix Gogoanime dub extraction logic');
  console.log('   - Check dub-specific extraction methods');
  console.log('2. If both SUB and DUB are HTML placeholders:');
  console.log('   - Fix Gogoanime extraction entirely');
  console.log('   - Check vibeplayer extraction');
  console.log('3. If real m3u8 streams found:');
  console.log('   - Extract and use those URLs directly');
  console.log('   - Validate English audio in m3u8');
}

debugGogoanimeDubStreams();
