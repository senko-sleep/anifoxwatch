const https = require('https');
const axios = require('axios');

// Test alternative dub sources and approaches
async function testAlternativeDubSources() {
  console.log('🔍 TESTING ALTERNATIVE DUB SOURCES');
  console.log('=====================================\n');
  
  // Test different dub source websites
  const dubSources = [
    {
      name: "AnimeFreak",
      baseUrl: "https://www.animefreak.tv",
      searchUrl: (query) => `https://www.animefreak.tv/search?keyword=${encodeURIComponent(query)}`,
      dubIndicator: /dub/gi
    },
    {
      name: "JustDubs",
      baseUrl: "https://justdubs.online",
      searchUrl: (query) => `https://justdubs.online/search/${encodeURIComponent(query)}`,
      dubIndicator: /dub/gi
    },
    {
      name: "DubbedAnime",
      baseUrl: "https://dubbedanime.net",
      searchUrl: (query) => `https://dubbedanime.net/search?q=${encodeURIComponent(query)}`,
      dubIndicator: /dub/gi
    },
    {
      name: "AnimeDao",
      baseUrl: "https://animedao.to",
      searchUrl: (query) => `https://animedao.to/search?keyword=${encodeURIComponent(query)}`,
      dubIndicator: /dub/gi
    },
    {
      name: "MonosChinos",
      baseUrl: "https://monoschinos2.com",
      searchUrl: (query) => `https://monoschinos2.com/search?q=${encodeURIComponent(query)}`,
      dubIndicator: /dub/gi
    }
  ];

  const testAnime = ["Attack on Titan", "Demon Slayer", "One Piece"];

  for (const source of dubSources) {
    console.log(`\n========== ${source.name} ==========`);
    
    try {
      // Test if website is accessible
      console.log(`1. Testing ${source.baseUrl}...`);
      const homepageResponse = await axios.get(source.baseUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (homepageResponse.status === 200) {
        console.log(`✅ Website accessible`);
        
        // Test search for anime
        for (const anime of testAnime.slice(0, 2)) { // Test first 2 anime
          console.log(`\n2. Searching for "${anime}"...`);
          
          try {
            const searchResponse = await axios.get(source.searchUrl(anime), {
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (searchResponse.status === 200) {
              console.log(`✅ Search successful (${searchResponse.data.length} bytes)`);
              
              // Look for dub indicators
              const dubMatches = searchResponse.data.match(source.dubIndicator);
              if (dubMatches && dubMatches.length > 0) {
                console.log(`✅ Found ${dubMatches.length} dub indicators`);
              }
              
              // Look for anime links
              const linkPatterns = [
                /href="\/([^"]*attack[^"]*)"/gi,
                /href="\/([^"]*demon[^"]*)"/gi,
                /href="\/([^"]*one[^"]*)"/gi,
                /href="([^"]*episode[^"]*)"/gi
              ];
              
              let foundLinks = [];
              for (const pattern of linkPatterns) {
                const matches = [...searchResponse.data.matchAll(pattern)];
                if (matches.length > 0) {
                  foundLinks.push(...matches.map(m => m[1]));
                  console.log(`✅ Found ${matches.length} anime links`);
                }
              }
              
              // Test first anime link
              if (foundLinks.length > 0) {
                const firstLink = foundLinks[0];
                const fullUrl = firstLink.startsWith('http') ? firstLink : `${source.baseUrl}${firstLink}`;
                
                console.log(`\n3. Testing anime page: ${firstLink}`);
                
                try {
                  const animeResponse = await axios.get(fullUrl, {
                    timeout: 10000,
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                  });
                  
                  if (animeResponse.status === 200) {
                    console.log(`✅ Anime page loaded (${animeResponse.data.length} bytes)`);
                    
                    // Look for episode links
                    const epPatterns = [
                      /href="([^"]*episode[^"]*)"/gi,
                      /href="([^"]*ep[^"]*\d+)"/gi,
                      /data-episode="([^"]+)"/gi
                    ];
                    
                    let episodeLinks = [];
                    for (const pattern of epPatterns) {
                      const matches = [...animeResponse.data.matchAll(pattern)];
                      if (matches.length > 0) {
                        episodeLinks.push(...matches.map(m => m[1]));
                        console.log(`✅ Found ${matches.length} episode links`);
                      }
                    }
                    
                    // Look for video sources
                    const videoPatterns = [
                      /src="([^"]*\.m3u8[^"]*)"/gi,
                      /src="([^"]*\.mp4[^"]*)"/gi,
                      /data-video="([^"]+)"/gi,
                      /<iframe[^>]*src="([^"]+)"/gi
                    ];
                    
                    let videoSources = [];
                    for (const pattern of videoPatterns) {
                      const matches = [...animeResponse.data.matchAll(pattern)];
                      if (matches.length > 0) {
                        videoSources.push(...matches.map(m => m[1]));
                        console.log(`✅ Found ${matches.length} video sources`);
                      }
                    }
                    
                    if (episodeLinks.length > 0 && videoSources.length > 0) {
                      console.log(`🎉 POTENTIAL WORKING DUB SOURCE!`);
                      console.log(`   Episodes: ${episodeLinks.length}`);
                      console.log(`   Video sources: ${videoSources.length}`);
                    }
                  }
                } catch (e) {
                  console.log(`❌ Anime page error: ${e.message}`);
                }
              }
            }
          } catch (e) {
            console.log(`❌ Search error: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.log(`❌ Website error: ${e.message}`);
    }
  }

  console.log('\n=====================================');
  console.log('TESTING GOGOANIME REGULAR PAGES FOR DUB');
  console.log('=====================================\n');
  
  // Test if regular Gogoanime pages have dub options
  console.log('Testing regular Gogoanime pages for dub indicators...');
  
  const regularAnime = [
    'https://anitaku.to/category/attack-on-titan',
    'https://anitaku.to/category/demon-slayer',
    'https://anitaku.to/category/one-piece'
  ];
  
  for (const url of regularAnime) {
    console.log(`\n--- Testing ${url} ---`);
    
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.status === 200) {
        console.log(`✅ Page loaded (${response.data.length} bytes)`);
        
        // Look for dub indicators in regular pages
        const dubPatterns = [
          /dub/gi,
          /english/gi,
          /audio[^>]*english/gi,
          /data-dub="([^"]+)"/gi,
          /class="[^"]*dub[^"]*"/gi,
          /<option[^>]*dub[^>]*>/gi,
          /<button[^>]*dub[^>]*>/gi
        ];
        
        let foundIndicators = [];
        for (const pattern of dubPatterns) {
          const matches = response.data.match(pattern);
          if (matches && matches.length > 0) {
            foundIndicators.push({ pattern: pattern.source, count: matches.length });
          }
        }
        
        if (foundIndicators.length > 0) {
          console.log(`✅ Found dub indicators:`);
          foundIndicators.forEach(ind => console.log(`   ${ind.pattern}: ${ind.count} matches`));
        } else {
          console.log(`⚠️  No dub indicators found`);
        }
        
        // Look for episode links
        const epMatches = [...response.data.matchAll(/href="\/([^"]*episode-\d+)"/gi)];
        if (epMatches.length > 0) {
          console.log(`✅ Found ${epMatches.length} episode links`);
          
          // Test first episode for dub content
          const firstEp = epMatches[0][1];
          const epUrl = `https://anitaku.to/${firstEp}`;
          
          console.log(`Testing episode: ${epUrl}`);
          
          try {
            const epResponse = await axios.get(epUrl, {
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (epResponse.status === 200) {
              // Look for dub options in episode page
              const epDubPatterns = [
                /dub/gi,
                /english/gi,
                /audio[^>]*english/gi,
                /data-audio="([^"]*)"/gi,
                /<option[^>]*english[^>]*>/gi
              ];
              
              let epDubIndicators = [];
              for (const pattern of epDubPatterns) {
                const matches = epResponse.data.match(pattern);
                if (matches && matches.length > 0) {
                  epDubIndicators.push({ pattern: pattern.source, count: matches.length });
                }
              }
              
              if (epDubIndicators.length > 0) {
                console.log(`✅ Episode has dub indicators:`);
                epDubIndicators.forEach(ind => console.log(`   ${ind.pattern}: ${ind.count} matches`));
              }
              
              // Look for video sources
              const videoMatches = [...epResponse.data.matchAll(/data-video="([^"]+)"/gi)];
              if (videoMatches.length > 0) {
                console.log(`✅ Found ${videoMatches.length} video sources`);
              }
            }
          } catch (e) {
            console.log(`❌ Episode error: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.log(`❌ Page error: ${e.message}`);
    }
  }

  console.log('\n=====================================');
  console.log('ALTERNATIVE DUB SOURCE TEST COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 RECOMMENDATIONS:');
  console.log('1. Check if any alternative sources work');
  console.log('2. Look for dub options in regular Gogoanime pages');
  console.log('3. Implement dub detection based on findings');
  console.log('4. Consider scraping from multiple sources for dub content');
}

testAlternativeDubSources();
