const http = require('http');

// Debug RealDubSource search functionality
async function debugRealDubSearch() {
  console.log('🔍 DEBUGGING REALDUB SEARCH');
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

  // Test search with detailed debugging
  console.log('1. Testing search for "attack"...');
  const searchData = await makeRequest('/api/anime/search?q=attack&source=RealDubSource');
  
  console.log('Search response:');
  console.log(JSON.stringify(searchData, null, 2));
  
  // Test trending
  console.log('\n2. Testing trending...');
  const trendingData = await makeRequest('/api/anime/trending?source=RealDubSource');
  
  console.log('Trending response:');
  console.log(JSON.stringify(trendingData, null, 2));
  
  // Test if RealDubSource is actually registered
  console.log('\n3. Testing source availability...');
  const sourcesData = await makeRequest('/api/sources');
  
  console.log('Available sources:');
  if (sourcesData.sources) {
    sourcesData.sources.forEach((source, i) => {
      console.log(`   ${i + 1}. ${source.name} (dub: ${source.supportsDub}, sub: ${source.supportsSub})`);
    });
  } else {
    console.log('No sources data available');
  }

  console.log('\n=====================================');
  console.log('DEBUG COMPLETE');
  console.log('=====================================\n');
}

debugRealDubSearch();
