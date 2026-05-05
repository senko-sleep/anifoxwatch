const http = require('http');

// Debug Gogoanime dub streams with proper URL encoding
async function debugGogoanimeDubFixed() {
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
  const searchData = await makeRequest('/api/anime/search?q=attack%20on%20titan&source=Gogoanime');
  
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

  console.log('\n6. Testing cross-source fallback...');
  const fallbackData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=dub`);
  
  if (fallbackData.error) {
    console.log(`❌ Fallback failed: ${fallbackData.error}`);
  } else if (!fallbackData.sources || fallbackData.sources.length === 0) {
    console.log('❌ No sources found in fallback');
  } else {
    console.log('✅ Fallback found sources:');
    const source = fallbackData.sources[0];
    console.log(`   Source: ${fallbackData.source}`);
    console.log(`   Category: ${fallbackData.category}`);
    console.log(`   Audio: ${fallbackData.audioLanguage}`);
    console.log(`   URL: ${source.url.substring(0, 60)}...`);
    
    if (source.url.includes('data:text/html')) {
      console.log('❌ Fallback also returns HTML placeholder');
    } else if (source.url.includes('m3u8')) {
      console.log('✅ Fallback has real m3u8 stream!');
      console.log('🎉 REAL DUB STREAM FOUND IN FALLBACK!');
    }
  }

  console.log('\n=====================================');
  console.log('DEBUG COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 ANALYSIS:');
  console.log('If SUB works but DUB is HTML placeholder:');
  console.log('- Need to fix Gogoanime dub extraction logic');
  console.log('- Check dub-specific extraction methods');
  console.log('');
  console.log('If both SUB and DUB are HTML placeholders:');
  console.log('- Need to fix Gogoanime extraction entirely');
  console.log('- Check vibeplayer extraction');
  console.log('');
  console.log('If fallback has real streams:');
  console.log('- Use fallback sources for dub content');
  console.log('- Prioritize working sources');
}

debugGogoanimeDubFixed();
