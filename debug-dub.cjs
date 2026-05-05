const http = require('http');
const https = require('https');

function makeRequest(url, isHttps = true) {
  return new Promise((resolve) => {
    const options = {
      hostname: new URL(url).hostname,
      path: new URL(url).pathname + new URL(url).search,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
}

async function testGogoanimeDub() {
  console.log('=== Testing Gogoanime Dub URLs ===\n');
  
  const baseUrl = 'https://anitaku.to';
  
  // Test 1: Check if demon-slayer-dub exists
  console.log('1. Testing demon-slayer-dub page...');
  const dubPage = await makeRequest(`${baseUrl}/category/demon-slayer-dub`);
  console.log(`   Status: ${dubPage.status}`);
  if (dubPage.status === 200) {
    console.log('   ✅ Dub category page exists');
    // Look for episode links
    const epMatches = dubPage.data.match(/href="\/([^"]*episode-\d+)"/g) || [];
    console.log(`   Found ${epMatches.length} episode links`);
    if (epMatches.length > 0) {
      const firstEp = epMatches[0].match(/href="\/([^"]+)"/)[1];
      console.log(`   First episode: ${firstEp}`);
      
      // Test the episode page
      console.log('\n2. Testing first dub episode...');
      const epPage = await makeRequest(`${baseUrl}/${firstEp}`);
      console.log(`   Status: ${epPage.status}`);
      if (epPage.status === 200) {
        // Look for streaming links
        const dataVideoMatches = epPage.data.match(/data-video="([^"]+)"/g) || [];
        console.log(`   Found ${dataVideoMatches.length} data-video links`);
        dataVideoMatches.slice(0, 3).forEach(match => {
          const url = match.match(/data-video="([^"]+)"/)[1];
          console.log(`   - ${url}`);
        });
      }
    }
  } else {
    console.log('   ❌ Dub category page not found');
  }
  
  // Test 2: Search for dub content
  console.log('\n3. Searching for "demon slayer dub"...');
  const searchResult = await makeRequest(`${baseUrl}/search.html?keyword=demon%20slayer%20dub`);
  console.log(`   Status: ${searchResult.status}`);
  if (searchResult.status === 200) {
    const titleMatches = searchResult.data.match(/<a[^>]*title="([^"]*)"[^>]*>[^<]*(?:dub|Dub)[^<]*<\/a>/g) || [];
    console.log(`   Found ${titleMatches.length} dub results`);
    titleMatches.slice(0, 3).forEach(match => {
      const title = match.match(/title="([^"]*)"/)[1];
      console.log(`   - ${title}`);
    });
  }
  
  // Test 3: Check known dub anime
  console.log('\n4. Testing known dub anime (attack-on-titan-dub)...');
  const aotDub = await makeRequest(`${baseUrl}/category/attack-on-titan-dub`);
  console.log(`   Status: ${aotDub.status}`);
  if (aotDub.status === 200) {
    const epMatches = aotDub.data.match(/href="\/([^"]*episode-\d+)"/g) || [];
    console.log(`   Found ${epMatches.length} episodes`);
  } else {
    console.log('   ❌ Attack on Titan dub not found');
  }
  
  // Test 4: Check one-piece-dub
  console.log('\n5. Testing one-piece-dub...');
  const opDub = await makeRequest(`${baseUrl}/category/one-piece-dub`);
  console.log(`   Status: ${opDub.status}`);
  if (opDub.status === 200) {
    const epMatches = opDub.data.match(/href="\/([^"]*episode-\d+)"/g) || [];
    console.log(`   Found ${epMatches.length} episodes`);
  } else {
    console.log('   ❌ One Piece dub not found');
  }
  
  console.log('\n=== Summary ===');
  console.log('Check above to see what dub content is actually available on Gogoanime');
}

testGogoanimeDub();
