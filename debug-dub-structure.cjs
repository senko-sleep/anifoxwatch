const https = require('https');

function makeRequest(url) {
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

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data
        });
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
}

async function analyzeDubStructure() {
  console.log('=== Analyzing Gogoanime Dub Structure ===\n');
  
  const baseUrl = 'https://anitaku.to';
  
  // Check the demon-slayer-dub page structure
  console.log('1. Analyzing demon-slayer-dub page structure...');
  const dubPage = await makeRequest(`${baseUrl}/category/demon-slayer-dub`);
  if (dubPage.status === 200) {
    // Look for any episode-related elements
    const episodePatterns = [
      /class="[^"]*episode[^"]*"/gi,
      /href="[^"]*episode[^"]*"/gi,
      /data-episode/gi,
      /episodes/gi
    ];
    
    episodePatterns.forEach((pattern, i) => {
      const matches = dubPage.data.match(pattern) || [];
      console.log(`   Pattern ${i+1}: Found ${matches.length} matches`);
      if (matches.length > 0 && matches.length < 5) {
        matches.forEach(m => console.log(`     - ${m}`));
      }
    });
    
    // Look for the actual episode list area
    const listArea = dubPage.data.match(/<ul[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi);
    if (listArea) {
      console.log(`   Found listing area with ${listArea.length} ul elements`);
      listArea.forEach((area, i) => {
        const links = area.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi) || [];
        console.log(`   List ${i+1}: ${links.length} links`);
        links.slice(0, 3).forEach(link => {
          const href = link.match(/href="([^"]*)"/)[1];
          const text = link.match(/>([^<]*)</)[1];
          console.log(`     - ${text} -> ${href}`);
        });
      });
    }
    
    // Check if there's a different episode format
    const epIdMatches = dubPage.data.match(/id="([^"]*ep[^"]*)"/gi) || [];
    console.log(`   Found ${epIdMatches.length} episode IDs`);
  }
  
  // Check if dubs are on the same page as subs with different tabs
  console.log('\n2. Checking regular demon-slayer page for dub tabs...');
  const regularPage = await makeRequest(`${baseUrl}/category/demon-slayer`);
  if (regularPage.status === 200) {
    // Look for dub-related elements
    const dubElements = regularPage.data.match(/<[^>]*(?:dub|Dub|DUB)[^>]*>/gi) || [];
    console.log(`   Found ${dubElements.length} dub-related elements`);
    dubElements.slice(0, 5).forEach(el => console.log(`     - ${el}`));
    
    // Look for tab or switch elements
    const tabElements = regularPage.data.match(/<[^>]*(?:tab|Tab|switch|Switch)[^>]*>/gi) || [];
    console.log(`   Found ${tabElements.length} tab/switch elements`);
    
    // Check for episode list with dub indicators
    const epList = regularPage.data.match(/<a[^>]*href="([^"]*episode[^"]*)"[^>]*>([^<]*(?:dub|Dub|DUB)?[^<]*)<\/a>/gi) || [];
    console.log(`   Found ${epList.length} episode links`);
    epList.slice(0, 5).forEach(link => {
      const href = link.match(/href="([^"]*)"/)[1];
      const text = link.match(/>([^<]*)</)[1];
      console.log(`     - ${text} -> ${href}`);
    });
  }
  
  // Test a different approach - check if episodes have dub versions
  console.log('\n3. Testing episode-specific dub URLs...');
  const testEpisodes = [
    'demon-slayer-episode-1',
    'demon-slayer-dub-episode-1',
    'demon-slayer-episode-1-dub',
    'demon-slayer-episode-1-english-dub'
  ];
  
  for (const epId of testEpisodes) {
    const epPage = await makeRequest(`${baseUrl}/${epId}`);
    console.log(`   ${epId}: Status ${epPage.status}`);
    if (epPage.status === 200) {
      const hasVideo = epPage.data.includes('data-video') || epPage.data.includes('iframe');
      console.log(`     Has video: ${hasVideo}`);
    }
  }
  
  console.log('\n=== Analysis Complete ===');
}

analyzeDubStructure();
