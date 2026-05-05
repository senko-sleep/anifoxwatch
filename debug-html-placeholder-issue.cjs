const http = require('http');

// Debug why HTML placeholders are still being returned
async function debugHtmlPlaceholderIssue() {
  console.log('🔍 DEBUGGING HTML PLACEHOLDER ISSUE');
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

  console.log('1. Testing if the fix was applied - get Attack on Titan episodes...');
  const searchData = await makeRequest('/api/anime/search?q=attack%20on%20titan&source=Gogoanime');
  
  if (!searchData.results || searchData.results.length === 0) {
    console.log('❌ Search failed');
    return;
  }
  
  const attackOnTitan = searchData.results.find(r => r.title.includes('Attack on Titan'));
  if (!attackOnTitan) {
    console.log('❌ Attack on Titan not found');
    return;
  }
  
  const epData = await makeRequest(`/api/anime/episodes?id=${attackOnTitan.id}&source=Gogoanime`);
  if (!epData.episodes || epData.episodes.length === 0) {
    console.log('❌ Episodes failed');
    return;
  }
  
  const firstEp = epData.episodes[0];
  console.log(`✅ Testing with: ${firstEp.title} (${firstEp.id})`);

  console.log('\n2. Testing SUB stream (working baseline)...');
  const subData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=sub&source=Gogoanime`);
  
  if (subData.sources && subData.sources.length > 0) {
    const subSource = subData.sources[0];
    console.log('✅ SUB stream details:');
    console.log(`   URL: ${subSource.url}`);
    console.log(`   Is m3u8: ${subSource.url.includes('m3u8')}`);
    console.log(`   Is HTML placeholder: ${subSource.url.includes('data:text/html')}`);
    
    if (subSource.url.includes('m3u8')) {
      console.log('✅ SUB has real m3u8 stream - this is our working baseline');
    }
  }

  console.log('\n3. Testing DUB stream (problematic one)...');
  const dubData = await makeRequest(`/api/stream/watch/${firstEp.id}?category=dub&source=Gogoanime`);
  
  if (dubData.sources && dubData.sources.length > 0) {
    const dubSource = dubData.sources[0];
    console.log('✅ DUB stream details:');
    console.log(`   URL: ${dubSource.url}`);
    console.log(`   Is m3u8: ${dubSource.url.includes('m3u8')}`);
    console.log(`   Is HTML placeholder: ${dubSource.url.includes('data:text/html')}`);
    
    if (dubSource.url.includes('data:text/html')) {
      console.log('❌ DUB is still HTML placeholder - fix didn\'t work');
      
      // Let's decode the HTML to see what's inside
      console.log('\n4. Decoding HTML placeholder content...');
      try {
        const decodedUrl = decodeURIComponent(dubSource.url.replace('/api/stream/proxy?url=', ''));
        console.log('Decoded URL (first 200 chars):');
        console.log(decodedUrl.substring(0, 200));
        
        // Check if it's the same HTML placeholder we saw before
        if (decodedUrl.includes('data:text/html;charset=utf8')) {
          console.log('❌ This is the same HTML placeholder - the issue is still there');
          
          // Get the actual HTML content to see what's being returned
          const htmlResponse = await makeRequest(`/api/stream/proxy?url=${encodeURIComponent(dubSource.url)}`);
          if (htmlResponse.raw) {
            console.log('HTML content (first 300 chars):');
            console.log(htmlResponse.raw.substring(0, 300));
            
            // Look for any clues about why this is happening
            if (htmlResponse.raw.includes('dub')) {
              console.log('✅ HTML contains dub-related content');
            }
            if (htmlResponse.raw.includes('error')) {
              console.log('❌ HTML contains error message');
            }
          }
        }
      } catch (e) {
        console.log(`❌ Error decoding HTML: ${e.message}`);
      }
    } else if (dubSource.url.includes('m3u8')) {
      console.log('🎉 DUB now has real m3u8 stream - fix worked!');
    }
  } else {
    console.log('❌ No dub sources found');
  }

  console.log('\n5. Testing direct Gogoanime page to see if dub content exists...');
  // Let's check if the actual Gogoanime page has dub content
  try {
    const pageUrl = `https://anitaku.to/${firstEp.id.replace('gogoanime-', '')}`;
    console.log(`   Checking: ${pageUrl}`);
    
    // We can't directly fetch external URLs from here, but we can check our API
    const pageCheck = await makeRequest(`/api/stream/watch/${firstEp.id}?category=sub&source=Gogoanime`);
    
    if (pageCheck.sources && pageCheck.sources.length > 0) {
      console.log('✅ Gogoanime page is accessible and has content');
    } else {
      console.log('❌ Gogoanime page might not be accessible');
    }
  } catch (e) {
    console.log(`❌ Error checking Gogoanime page: ${e.message}`);
  }

  console.log('\n6. Testing WorkingDubExtractor as fallback...');
  const workingDubSearch = await makeRequest('/api/anime/search?q=attack&source=WorkingDubExtractor');
  
  if (workingDubSearch.results && workingDubSearch.results.length > 0) {
    const workingDubAnime = workingDubSearch.results[0];
    console.log(`✅ WorkingDubExtractor found: ${workingDubAnime.title}`);
    
    const workingDubEps = await makeRequest(`/api/anime/episodes?id=${workingDubAnime.id}&source=WorkingDubExtractor`);
    if (workingDubEps.episodes && workingDubEps.episodes.length > 0) {
      const workingDubStream = await makeRequest(`/api/stream/watch/${workingDubEps.episodes[0].id}?category=dub&source=WorkingDubExtractor`);
      
      if (workingDubStream.sources && workingDubStream.sources.length > 0) {
        const source = workingDubStream.sources[0];
        console.log('✅ WorkingDubExtractor stream:');
        console.log(`   URL: ${source.url.substring(0, 60)}...`);
        console.log(`   Is m3u8: ${source.url.includes('m3u8')}`);
        console.log(`   Is HTML: ${source.url.includes('data:text/html')}`);
        
        if (!source.url.includes('data:text/html')) {
          console.log('🎉 WorkingDubExtractor has real streams!');
        }
      }
    }
  }

  console.log('\n=====================================');
  console.log('DEBUG ANALYSIS');
  console.log('=====================================\n');
  
  console.log('🎯 POSSIBLE ISSUES:');
  console.log('1. The fix might not have been applied correctly');
  console.log('2. The server might need to be restarted');
  console.log('3. There might be another validation step somewhere else');
  console.log('4. The HTML placeholder might be coming from a different source');
  console.log('5. The extractDubFromRegularPage method might be failing');
  
  console.log('\n🎯 NEXT STEPS:');
  console.log('1. Restart the server to apply changes');
  console.log('2. Check server logs for validation messages');
  console.log('3. Test with different anime that have confirmed dub');
  console.log('4. If still failing, implement a simpler dub extraction method');
  console.log('5. Use WorkingDubExtractor as primary dub source');
}

debugHtmlPlaceholderIssue();
