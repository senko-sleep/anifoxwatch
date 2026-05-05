const http = require('http');

// Debug WorkingDubExtractor search functionality
async function debugWorkingDubExtractor() {
  console.log('🔍 DEBUGGING WORKING DUB EXTRACTOR');
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

  // Test search with different queries
  const testQueries = ['attack', 'demon', 'one', 'naruto', 'bleach'];
  
  for (const query of testQueries) {
    console.log(`\n--- Testing search for "${query}" ---`);
    
    const searchData = await makeRequest(`/api/anime/search?q=${query}&source=WorkingDubExtractor`);
    
    console.log('Search response:');
    if (searchData.error) {
      console.log(`❌ Error: ${searchData.error}`);
    } else {
      console.log(`✅ Success: ${JSON.stringify(searchData, null, 2)}`);
    }
  }

  // Test if WorkingDubExtractor is actually registered
  console.log('\n--- Testing source registration ---');
  const sourcesData = await makeRequest('/api/sources');
  
  if (sourcesData.sources) {
    console.log('Available sources:');
    sourcesData.sources.forEach((source, i) => {
      console.log(`   ${i + 1}. ${source.name} (dub: ${source.supportsDub}, sub: ${source.supportsSub})`);
    });
  } else {
    console.log('No sources data available');
  }

  // Test trending
  console.log('\n--- Testing trending ---');
  const trendingData = await makeRequest('/api/anime/trending?source=WorkingDubExtractor');
  
  if (trendingData.error) {
    console.log(`❌ Trending failed: ${trendingData.error}`);
  } else if (trendingData.length && trendingData.length > 0) {
    console.log(`✅ Trending found ${trendingData.length} anime`);
    trendingData.slice(0, 3).forEach((anime, i) => {
      console.log(`   ${i + 1}. ${anime.title}`);
    });
  } else {
    console.log('No trending anime found');
    console.log('Response:', JSON.stringify(trendingData, null, 2));
  }

  console.log('\n=====================================');
  console.log('DEBUG COMPLETE');
  console.log('=====================================\n');
}

debugWorkingDubExtractor();
