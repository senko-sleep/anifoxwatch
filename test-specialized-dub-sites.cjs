const https = require('https');
const http = require('http');

// Test specialized dub-only sites from user's list
async function testSpecializedDubSites() {
  console.log('🔍 TESTING SPECIALIZED DUB-ONLY SITES');
  console.log('=====================================\n');
  
  // Focus on sites specifically known for dub content
  const dubSpecializedSites = [
    { name: 'DubbedAnime', baseUrl: 'https://dubbedanime.net', searchUrl: (q) => `https://dubbedanime.net/search?q=${encodeURIComponent(q)}` },
    { name: 'AnimeDub', baseUrl: 'https://animedub.to', searchUrl: (q) => `https://animedub.to/search?keyword=${encodeURIComponent(q)}` },
    { name: 'DubAnimeOnline', baseUrl: 'https://dubanimeonline.io', searchUrl: (q) => `https://dubanimeonline.io/search/${encodeURIComponent(q)}` },
    { name: 'WatchDub', baseUrl: 'https://watchdub.com', searchUrl: (q) => `https://watchdub.com/search?keyword=${encodeURIComponent(q)}` },
    { name: 'DubStream', baseUrl: 'https://dubstream.tv', searchUrl: (q) => `https://dubstream.tv/search?keyword=${encodeURIComponent(q)}` },
    { name: 'AnimeDubTV', baseUrl: 'https://animedub.tv', searchUrl: (q) => `https://animedub.tv/search?keyword=${encodeURIComponent(q)}` },
    { name: 'DubAnimeZone', baseUrl: 'https://dubanime.zone', searchUrl: (q) => `https://dubanime.zone/search?keyword=${encodeURIComponent(q)}` },
    { name: 'EnglishDubAnime', baseUrl: 'https://englishdubanime.com', searchUrl: (q) => `https://englishdubanime.com/search?keyword=${encodeURIComponent(q)}` },
    { name: 'DubAni', baseUrl: 'https://dubani.me', searchUrl: (q) => `https://dubani.me/search?keyword=${encodeURIComponent(q)}` },
    { name: 'AnimeDubOnline', baseUrl: 'https://animedubonline.net', searchUrl: (q) => `https://animedubonline.net/search?keyword=${encodeURIComponent(q)}` }
  ];

  const testAnime = [
    { name: 'Attack on Titan', slug: 'attack-on-titan' },
    { name: 'Demon Slayer', slug: 'demon-slayer' },
    { name: 'One Piece', slug: 'one-piece' },
    { name: 'Death Note', slug: 'death-note' },
    { name: 'My Hero Academia', slug: 'my-hero-academia' }
  ];

  function fetchUrl(url) {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;
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

      const req = client.get(url, options, (res) => {
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

  const workingDubSites = [];

  for (const site of dubSpecializedSites) {
    console.log(`\n========== ${site.name} ==========`);
    
    let siteResults = {
      name: site.name,
      baseUrl: site.baseUrl,
      accessible: false,
      hasSearchResults: false,
      hasDubContent: false,
      workingAnime: []
    };

    // Test if website is accessible
    console.log(`1. Testing ${site.baseUrl}...`);
    const homepageResult = await fetchUrl(site.baseUrl);
    if (homepageResult.error || homepageResult.status !== 200) {
      console.log(`❌ Website not accessible: ${homepageResult.error || homepageResult.status}`);
      continue;
    }
    siteResults.accessible = true;
    console.log(`✅ Website accessible (${homepageResult.status})`);

    // Check if homepage has dub indicators
    const homepageContent = homepageResult.data.toLowerCase();
    const hasDubIndicators = 
      homepageContent.includes('dub') ||
      homepageContent.includes('english') ||
      homepageContent.includes('dubbed') ||
      homepageContent.includes('english dub');
    
    if (hasDubIndicators) {
      console.log(`✅ Homepage has dub indicators`);
      siteResults.hasDubContent = true;
    }

    // Test search for anime
    for (const anime of testAnime.slice(0, 3)) { // Test first 3 anime
      console.log(`\n2. Searching for "${anime.name}"...`);
      
      const searchUrl = site.searchUrl(anime.name);
      console.log(`   URL: ${searchUrl}`);
      
      const searchResult = await fetchUrl(searchUrl);
      
      if (searchResult.error) {
        console.log(`   ❌ Search error: ${searchResult.error}`);
        continue;
      }
      
      if (searchResult.status !== 200) {
        console.log(`   ⚠️  Search returned status: ${searchResult.status}`);
        continue;
      }
      
      console.log(`   ✅ Search successful (${searchResult.data.length} bytes)`);
      siteResults.hasSearchResults = true;
      
      // Look for anime links
      const linkPatterns = [
        /href="\/([^"]*${anime.slug}[^"]*)"/gi,
        /href="\/([^"]*attack[^"]*)"/gi,
        /href="\/([^"]*demon[^"]*)"/gi,
        /href="\/([^"]*one[^"]*)"/gi,
        /href="\/([^"]*death[^"]*)"/gi,
        /href="\/([^"]*hero[^"]*)"/gi,
        /href="([^"]*episode[^"]*)"/gi,
        /href="([^"]*watch[^"]*)"/gi
      ];
      
      let foundLinks = [];
      for (const pattern of linkPatterns) {
        const matches = [...searchResult.data.matchAll(pattern)];
        if (matches.length > 0) {
          foundLinks.push(...matches.map(m => m[1]));
          console.log(`   ✅ Found ${matches.length} anime links with ${pattern.source}`);
          break;
        }
      }
      
      // Look for dub indicators in search results
      const searchContent = searchResult.data.toLowerCase();
      const searchDubIndicators = [
        /dub/gi,
        /english/gi,
        /eng/gi,
        /dubbed/gi,
        /english dub/gi
      ];
      
      let dubIndicatorCount = 0;
      for (const indicator of searchDubIndicators) {
        const matches = searchContent.match(indicator);
        if (matches && matches.length > 0) {
          dubIndicatorCount += matches.length;
        }
      }
      
      if (dubIndicatorCount > 0) {
        console.log(`   ✅ Found ${dubIndicatorCount} dub indicators in search`);
        siteResults.hasDubContent = true;
      }
      
      // Look for video sources
      const videoPatterns = [
        /src="([^"]*\.m3u8[^"]*)"/gi,
        /src="([^"]*\.mp4[^"]*)"/gi,
        /data-video="([^"]+)"/gi,
        /<iframe[^>]*src="([^"]+)"/gi,
        /stream.*url["']?\s*[:=]\s*["']([^"']+)["']/gi
      ];
      
      let videoSourceCount = 0;
      for (const pattern of videoPatterns) {
        const matches = [...searchResult.data.matchAll(pattern)];
        if (matches.length > 0) {
          videoSourceCount += matches.length;
          console.log(`   ✅ Found ${matches.length} ${pattern.source} sources`);
        }
      }
      
      if (foundLinks.length > 0 && (dubIndicatorCount > 0 || videoSourceCount > 0)) {
        siteResults.workingAnime.push({
          name: anime.name,
          links: foundLinks.length,
          dubIndicators: dubIndicatorCount,
          videoSources: videoSourceCount
        });
        
        console.log(`   🎉 WORKING DUB ANIME FOUND!`);
        console.log(`      Links: ${foundLinks.length}, Dub indicators: ${dubIndicatorCount}, Video sources: ${videoSourceCount}`);
      }
    }
    
    if (siteResults.accessible && siteResults.hasDubContent && siteResults.workingAnime.length > 0) {
      workingDubSites.push(siteResults);
    }
  }

  // Summary
  console.log('\n=====================================');
  console.log('SPECIALIZED DUB SITES TEST RESULTS');
  console.log('=====================================\n');
  
  if (workingDubSites.length > 0) {
    console.log(`✅ WORKING DUB SITES FOUND (${workingDubSites.length}):`);
    workingDubSites.forEach(site => {
      console.log(`\n${site.name} (${site.baseUrl}):`);
      console.log(`   Accessible: ${site.accessible}`);
      console.log(`   Has search results: ${site.hasSearchResults}`);
      console.log(`   Has dub content: ${site.hasDubContent}`);
      console.log(`   Working anime: ${site.workingAnime.length}`);
      site.workingAnime.forEach(anime => {
        console.log(`     - ${anime.name}: ${anime.links} links, ${anime.dubIndicators} dub indicators, ${anime.videoSources} video sources`);
      });
    });
    
    console.log('\n🎯 IMPLEMENTATION PLAN:');
    console.log('1. Create source classes for the working sites');
    console.log('2. Implement proper dub extraction');
    console.log('3. Add to source manager with dub priority');
    console.log('4. Test actual dub playback');
    
  } else {
    console.log('❌ NO WORKING SPECIALIZED DUB SITES FOUND');
    console.log('\n🔄 ALTERNATIVE APPROACHES:');
    console.log('1. Try more sources from the user list');
    console.log('2. Implement custom dub extraction for existing sources');
    console.log('3. Use multiple sources and combine results');
    console.log('4. Create a hybrid approach with existing + new sources');
  }

  console.log('\n=====================================');
  console.log('SPECIALIZED DUB SITES TEST COMPLETE');
  console.log('=====================================\n');
  
  return workingDubSites;
}

testSpecializedDubSites();
