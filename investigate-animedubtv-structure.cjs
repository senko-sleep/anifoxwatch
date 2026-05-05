const https = require('https');

// Investigate the actual structure of AnimeDubTV to fix search extraction
async function investigateAnimeDubTVStructure() {
  console.log('🔍 INVESTIGATING ANIMEDUBTV STRUCTURE');
  console.log('=====================================\n');
  
  function fetchUrl(url) {
    return new Promise((resolve) => {
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        timeout: 15000
      };

      const req = https.get(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        });
      });

      req.on('error', (e) => resolve({ error: e.message }));
      req.on('timeout', () => resolve({ error: 'Timeout' }));
      req.end();
    });
  }

  // Test homepage structure
  console.log('1. Testing homepage structure...');
  const homepageResult = await fetchUrl('https://animedub.tv');
  
  if (homepageResult.error || homepageResult.status !== 200) {
    console.log(`❌ Homepage failed: ${homepageResult.error || homepageResult.status}`);
    return;
  }
  
  console.log(`✅ Homepage loaded (${homepageResult.data.length} bytes)`);
  
  // Look for anime links on homepage
  const homepagePatterns = [
    { name: 'Anime links', pattern: /href="\/([^"]*anime[^"]*)"/gi },
    { name: 'Episode links', pattern: /href="\/([^"]*episode[^"]*)"/gi },
    { name: 'Watch links', pattern: /href="\/([^"]*watch[^"]*)"/gi },
    { name: 'All links', pattern: /href="\/([^"]+)"/gi },
    { name: 'Anchor tags', pattern: /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi }
  ];
  
  console.log('\n2. Analyzing homepage links...');
  for (const { name, pattern } of homepagePatterns) {
    const matches = [...homepageResult.data.matchAll(pattern)];
    if (matches.length > 0) {
      console.log(`✅ Found ${matches.length} ${name}:`);
      matches.slice(0, 5).forEach((match, i) => {
        if (name === 'Anchor tags') {
          console.log(`   ${i + 1}. ${match[2]} -> ${match[1]}`);
        } else {
          console.log(`   ${i + 1}. ${match[1]}`);
        }
      });
      if (matches.length > 5) {
        console.log(`   ... and ${matches.length - 5} more`);
      }
    }
  }
  
  // Test search structure
  console.log('\n3. Testing search structure...');
  const searchQueries = ['attack on titan', 'demon slayer', 'one piece'];
  
  for (const query of searchQueries) {
    console.log(`\n--- Testing search for "${query}" ---`);
    
    const searchUrl = `https://animedub.tv/search?keyword=${encodeURIComponent(query)}`;
    console.log(`URL: ${searchUrl}`);
    
    const searchResult = await fetchUrl(searchUrl);
    
    if (searchResult.error) {
      console.log(`❌ Search error: ${searchResult.error}`);
      continue;
    }
    
    if (searchResult.status !== 200) {
      console.log(`⚠️  Search returned status: ${searchResult.status}`);
      continue;
    }
    
    console.log(`✅ Search successful (${searchResult.data.length} bytes)`);
    
    // Look for search result patterns
    const searchPatterns = [
      { name: 'Anime links', pattern: /href="\/([^"]*anime[^"]*)"/gi },
      { name: 'Episode links', pattern: /href="\/([^"]*episode[^"]*)"/gi },
      { name: 'Watch links', pattern: /href="\/([^"]*watch[^"]*)"/gi },
      { name: 'All links', pattern: /href="\/([^"]+)"/gi },
      { name: 'Anchor tags', pattern: /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi },
      { name: 'Div items', pattern: /<div[^>]*>([^<]*)<\/div>/gi },
      { name: 'List items', pattern: /<li[^>]*>([^<]*)<\/li>/gi }
    ];
    
    for (const { name, pattern } of searchPatterns) {
      const matches = [...searchResult.data.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} ${name}:`);
        matches.slice(0, 3).forEach((match, i) => {
          if (name === 'Anchor tags') {
            console.log(`   ${i + 1}. ${match[2]} -> ${match[1]}`);
          } else if (name === 'Div items' || name === 'List items') {
            console.log(`   ${i + 1}. ${match[1]}`);
          } else {
            console.log(`   ${i + 1}. ${match[1]}`);
          }
        });
        if (matches.length > 3) {
          console.log(`   ... and ${matches.length - 3} more`);
        }
      }
    }
    
    // Look for specific anime titles
    const titlePatterns = [
      /attack/gi,
      /demon/gi,
      /slayer/gi,
      /one piece/gi,
      /death note/gi,
      /my hero/gi
    ];
    
    for (const pattern of titlePatterns) {
      const matches = searchResult.data.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`✅ Found ${matches.length} matches for "${pattern.source}"`);
      }
    }
    
    // Show a snippet of the search page for manual inspection
    console.log(`\nSearch page snippet (first 500 chars):`);
    console.log(searchResult.data.substring(0, 500));
  }
  
  // Test a direct anime page if we can find one
  console.log('\n4. Testing direct anime page access...');
  
  // Try some common anime URLs
  const commonAnimeUrls = [
    'https://animedub.tv/anime/attack-on-titan',
    'https://animedub.tv/anime/demon-slayer',
    'https://animedub.tv/anime/one-piece',
    'https://animedub.tv/attack-on-titan',
    'https://animedub.tv/demon-slayer',
    'https://animedub.tv/one-piece'
  ];
  
  for (const url of commonAnimeUrls) {
    console.log(`\n--- Testing: ${url} ---`);
    
    const animeResult = await fetchUrl(url);
    
    if (animeResult.error) {
      console.log(`❌ Error: ${animeResult.error}`);
      continue;
    }
    
    if (animeResult.status === 200) {
      console.log(`✅ Anime page accessible (${animeResult.data.length} bytes)`);
      
      // Look for episode links
      const epMatches = [...animeResult.data.matchAll(/href="\/([^"]*episode[^"]*)"/gi)];
      if (epMatches.length > 0) {
        console.log(`✅ Found ${epMatches.length} episode links`);
        epMatches.slice(0, 3).forEach((match, i) => {
          console.log(`   ${i + 1}. ${match[1]}`);
        });
      }
      
      // Look for video sources
      const videoMatches = [...animeResult.data.matchAll(/src="([^"]*\.m3u8[^"]*)"/gi)];
      if (videoMatches.length > 0) {
        console.log(`✅ Found ${videoMatches.length} video sources`);
        videoMatches.forEach((match, i) => {
          console.log(`   ${i + 1}. ${match[1]}`);
        });
      }
      
      break; // Stop after finding first working anime page
    } else {
      console.log(`⚠️  Status: ${animeResult.status}`);
    }
  }

  console.log('\n=====================================');
  console.log('INVESTIGATION COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 FINDINGS:');
  console.log('1. Check the link patterns that actually work');
  console.log('2. Update AnimeDubTV source with correct extraction');
  console.log('3. Test the updated extraction patterns');
  console.log('4. Verify dub content is actually accessible');
}

investigateAnimeDubTVStructure();
