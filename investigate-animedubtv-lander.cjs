const https = require('https');

// Investigate AnimeDubTV lander pages to understand the real structure
async function investigateAnimeDubTVLander() {
  console.log('🔍 INVESTIGATING ANIMEDUBTV LANDER PAGES');
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

  // Test lander pages
  const searchQueries = ['attack on titan', 'demon slayer', 'one piece'];
  
  for (const query of searchQueries) {
    console.log(`\n========== Testing: ${query} ==========`);
    
    const landerUrl = `https://animedub.tv/lander?keyword=${encodeURIComponent(query)}`;
    console.log(`URL: ${landerUrl}`);
    
    const landerResult = await fetchUrl(landerUrl);
    
    if (landerResult.error) {
      console.log(`❌ Lander error: ${landerResult.error}`);
      continue;
    }
    
    if (landerResult.status !== 200) {
      console.log(`⚠️  Lander returned status: ${landerResult.status}`);
      continue;
    }
    
    console.log(`✅ Lander successful (${landerResult.data.length} bytes)`);
    
    // Look for various patterns in lander page
    const patterns = [
      { name: 'Anime links', pattern: /href="\/([^"]*)"/gi },
      { name: 'Full URLs', pattern: /href="(https?:\/\/[^"]*)"/gi },
      { name: 'Anime titles', pattern: />([^<]*(?:attack|demon|slayer|one piece|death note|my hero)[^<]*)</gi },
      { name: 'Episode links', pattern: /episode/gi },
      { name: 'Watch links', pattern: /watch/gi },
      { name: 'Data attributes', pattern: /data-[^=]*="([^"]*)"/gi },
      { name: 'Script content', pattern: /<script[^>]*>([^<]*)<\/script>/gi },
      { name: 'Div classes', pattern: /class="([^"]*)"/gi }
    ];
    
    console.log('\n2. Analyzing lander content...');
    for (const { name, pattern } of patterns) {
      const matches = [...landerResult.data.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} ${name}:`);
        matches.slice(0, 5).forEach((match, i) => {
          if (name === 'Anime titles') {
            console.log(`   ${i + 1}. ${match[1]}`);
          } else if (name === 'Script content') {
            console.log(`   ${i + 1}. ${match[1].substring(0, 100)}...`);
          } else {
            console.log(`   ${i + 1}. ${match[1]}`);
          }
        });
        if (matches.length > 5) {
          console.log(`   ... and ${matches.length - 5} more`);
        }
      }
    }
    
    // Look for specific anime-related content
    const animePatterns = [
      /attack on titan/gi,
      /demon slayer/gi,
      /one piece/gi,
      /death note/gi,
      /my hero academia/gi
    ];
    
    console.log('\n3. Checking for specific anime content...');
    for (const pattern of animePatterns) {
      const matches = landerResult.data.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`✅ Found ${matches.length} matches for "${pattern.source}"`);
      }
    }
    
    // Show the full lander content for manual inspection
    console.log(`\n4. Full lander content:`);
    console.log(landerResult.data);
  }

  console.log('\n=====================================');
  console.log('LANDER INVESTIGATION COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 NEXT STEPS:');
  console.log('1. Analyze the lander page structure');
  console.log('2. Update AnimeDubTV source to handle lander redirects');
  console.log('3. Extract actual anime links from lander content');
  console.log('4. Test the updated extraction');
}

investigateAnimeDubTVLander();
