const https = require('https');

// Test direct access to known dub sources
async function testDirectDubSources() {
  console.log('=== Testing Direct Dub Sources ===\n');
  
  // Test 1: Check if 9anime (if it exists) has dubs
  console.log('1. Testing 9anime domain availability...');
  try {
    const response = await fetch('https://9anime.to', {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(`   9anime.to: ${response.status}`);
  } catch (e) {
    console.log(`   9anime.to: Error - ${e.message}`);
  }
  
  // Test 2: Check Gogoanime for actual dub content
  console.log('\n2. Testing Gogoanime for actual dub anime...');
  const knownDubAnime = [
    'attack-on-titan-dub',
    'one-piece-dub', 
    'my-hero-academia-dub',
    'death-note-dub',
    'mob-psycho-100-dub'
  ];
  
  for (const animeSlug of knownDubAnime) {
    try {
      const response = await fetch(`https://anitaku.to/category/${animeSlug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const text = await response.text();
      
      if (response.status === 200) {
        // Look for episode links
        const epMatches = text.match(/href="\/([^"]*episode-\d+)"/g) || [];
        console.log(`   ${animeSlug}: ${response.status} (${epMatches.length} episodes)`);
        
        if (epMatches.length > 0) {
          const firstEp = epMatches[0].match(/href="\/([^"]+)"/)[1];
          console.log(`     First episode: ${firstEp}`);
          
          // Check if episode page has video
          try {
            const epResponse = await fetch(`https://anitaku.to/${firstEp}`, {
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const epText = await epResponse.text();
            
            const hasVideo = epText.includes('data-video') || epText.includes('iframe');
            const videoCount = (epText.match(/data-video=/g) || []).length;
            console.log(`     Has video: ${hasVideo} (${videoCount} sources)`);
            
            if (hasVideo && videoCount > 0) {
              console.log(`     ✅ WORKING DUB FOUND: ${animeSlug}`);
              return animeSlug;
            }
          } catch (e) {
            console.log(`     Episode check failed: ${e.message}`);
          }
        }
      } else {
        console.log(`   ${animeSlug}: ${response.status}`);
      }
    } catch (e) {
      console.log(`   ${animeSlug}: Error - ${e.message}`);
    }
  }
  
  // Test 3: Check other potential dub sources
  console.log('\n3. Testing other dub sources...');
  const otherSources = [
    'https://animixplay.to',
    'https://zoro.to',
    'https://animedao.to'
  ];
  
  for (const source of otherSources) {
    try {
      const response = await fetch(source, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      console.log(`   ${source}: ${response.status}`);
    } catch (e) {
      console.log(`   ${source}: Error - ${e.message}`);
    }
  }
  
  console.log('\n=== Summary ===');
  console.log('If any anime showed "WORKING DUB FOUND", that source has actual dubs');
  console.log('Otherwise, we need to implement a different approach');
}

// Polyfill fetch for Node.js
global.fetch = async (url, options = {}) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          text: () => Promise.resolve(data),
          ok: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
};

testDirectDubSources();
