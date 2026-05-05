const https = require('https');

// Investigate 9Anime structure for real dub streams
async function investigate9AnimeStructure() {
  console.log('🔍 INVESTIGATING 9ANIME STRUCTURE');
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

  // Test 9Anime homepage structure
  console.log('1. Testing 9Anime homepage...');
  const homepageResult = await fetchUrl('https://9anime.to');
  
  if (homepageResult.error || homepageResult.status !== 200) {
    console.log(`❌ Homepage failed: ${homepageResult.error || homepageResult.status}`);
    return;
  }
  
  console.log(`✅ Homepage loaded (${homepageResult.data.length} bytes)`);
  
  // Look for anime links on homepage
  const homepagePatterns = [
    { name: 'Anime links', pattern: /href="\/([^"]*)"/gi },
    { name: 'Data-href', pattern: /data-href="([^"]*)"/gi },
    { name: 'Data-id', pattern: /data-id="([^"]*)"/gi },
    { name: 'Data-slug', pattern: /data-slug="([^"]*)"/gi }
  ];
  
  console.log('\n2. Analyzing homepage structure...');
  for (const { name, pattern } of homepagePatterns) {
    const matches = [...homepageResult.data.matchAll(pattern)];
    if (matches.length > 0) {
      console.log(`✅ Found ${matches.length} ${name}:`);
      matches.slice(0, 5).forEach((match, i) => {
        console.log(`   ${i + 1}. ${match[1]}`);
      });
      if (matches.length > 5) {
        console.log(`   ... and ${matches.length - 5} more`);
      }
    }
  }
  
  // Test search structure
  console.log('\n3. Testing search structure...');
  const searchQueries = ['attack on titan', 'demon slayer'];
  
  for (const query of searchQueries) {
    console.log(`\n--- Testing search for "${query}" ---`);
    
    const searchUrl = `https://9anime.to/search?keyword=${encodeURIComponent(query)}`;
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
    
    // Look for anime items in search results
    const searchPatterns = [
      { name: 'Anime items', pattern: /<a[^>]*href="\/([^"]*)"[^>]*>([^<]*)<\/a>/gi },
      { name: 'Data-id items', pattern: /data-id="([^"]*)"/gi },
      { name: 'Data-slug items', pattern: /data-slug="([^"]*)"/gi },
      { name: 'Anime titles', pattern: /title="([^"]*)"/gi },
      { name: 'Anime names', pattern: /<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]*)<\/span>/gi }
    ];
    
    let foundAnime = [];
    for (const { name, pattern } of searchPatterns) {
      const matches = [...searchResult.data.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} ${name}:`);
        matches.slice(0, 3).forEach((match, i) => {
          if (name === 'Anime items') {
            console.log(`   ${i + 1}. ${match[2]} -> /${match[1]}`);
          } else if (name === 'Anime titles' || name === 'Anime names') {
            console.log(`   ${i + 1}. ${match[1]}`);
          } else {
            console.log(`   ${i + 1}. ${match[1]}`);
          }
        });
        
        if (name === 'Anime items') {
          foundAnime = matches.map(m => ({ title: m[2], path: m[1] }));
        }
      }
    }
    
    // Look for dub indicators
    const dubIndicators = [
      /dub/gi,
      /english/gi,
      /eng/gi,
      /dubbed/gi
    ];
    
    let dubCount = 0;
    for (const indicator of dubIndicators) {
      const matches = searchResult.data.match(indicator);
      if (matches && matches.length > 0) {
        dubCount += matches.length;
      }
    }
    
    if (dubCount > 0) {
      console.log(`✅ Found ${dubCount} dub indicators`);
    }
    
    // Test first found anime
    if (foundAnime.length > 0) {
      const firstAnime = foundAnime[0];
      console.log(`\n4. Testing anime page: ${firstAnime.title}`);
      
      const animeUrl = `https://9anime.to/${firstAnime.path}`;
      console.log(`URL: ${animeUrl}`);
      
      const animeResult = await fetchUrl(animeUrl);
      
      if (!animeResult.error && animeResult.status === 200) {
        console.log(`✅ Anime page loaded (${animeResult.data.length} bytes)`);
        
        // Look for episode links
        const epPatterns = [
          { name: 'Episode links', pattern: /href="\/([^"]*episode[^"]*)"/gi },
          { name: 'Watch links', pattern: /href="\/([^"]*watch[^"]*)"/gi },
          { name: 'Data-episode', pattern: /data-episode="([^"]*)"/gi },
          { name: 'Episode items', pattern: /<a[^>]*data-episode="([^"]*)"[^>]*>([^<]*)<\/a>/gi }
        ];
        
        let foundEpisodes = [];
        for (const { name, pattern } of epPatterns) {
          const matches = [...animeResult.data.matchAll(pattern)];
          if (matches.length > 0) {
            console.log(`✅ Found ${matches.length} ${name}:`);
            matches.slice(0, 3).forEach((match, i) => {
              if (name === 'Episode items') {
                console.log(`   ${i + 1}. Episode ${match[1]} -> ${match[2]}`);
                foundEpisodes.push({ episode: match[1], path: match[1], title: match[2] });
              } else {
                console.log(`   ${i + 1}. ${match[1]}`);
              }
            });
            break;
          }
        }
        
        // Test first episode
        if (foundEpisodes.length > 0) {
          const firstEp = foundEpisodes[0];
          console.log(`\n5. Testing episode page: ${firstEp.title}`);
          
          const epUrl = `https://9anime.to/watch/${firstAnime.path}/${firstEp.episode}`;
          console.log(`URL: ${epUrl}`);
          
          const epResult = await fetchUrl(epUrl);
          
          if (!epResult.error && epResult.status === 200) {
            console.log(`✅ Episode page loaded (${epResult.data.length} bytes)`);
            
            // Look for video sources
            const videoPatterns = [
              { name: 'M3U8 sources', pattern: /["']([^"']*\.m3u8[^"']*?)["']/gi },
              { name: 'MP4 sources', pattern: /["']([^"']*\.mp4[^"']*?)["']/gi },
              { name: 'Data-video', pattern: /data-video="([^"]*)"/gi },
              { name: 'Data-source', pattern: /data-source="([^"]*)"/gi },
              { name: 'Stream URLs', pattern: /stream.*url["']?\s*[:=]\s*["']([^"']+)["']/gi },
              { name: 'Iframe sources', pattern: /<iframe[^>]*src="([^"]+)"/gi }
            ];
            
            let videoStreams = [];
            for (const { name, pattern } of videoPatterns) {
              const matches = [...epResult.data.matchAll(pattern)];
              if (matches.length > 0) {
                console.log(`✅ Found ${matches.length} ${name}:`);
                matches.slice(0, 3).forEach((match, i) => {
                  console.log(`   ${i + 1}. ${match[1].substring(0, 60)}...`);
                  videoStreams.push(match[1]);
                });
              }
            }
            
            // Look for dub indicators in episode page
            const epDubIndicators = [
              /dub/gi,
              /english/gi,
              /eng/gi,
              /data-dub="([^"]*)"/gi,
              /class="[^"]*dub[^"]*"/gi
            ];
            
            let epDubCount = 0;
            for (const indicator of epDubIndicators) {
              const matches = epResult.data.match(indicator);
              if (matches && matches.length > 0) {
                epDubCount += matches.length;
              }
            }
            
            if (epDubCount > 0) {
              console.log(`✅ Found ${epDubCount} dub indicators in episode page`);
            }
            
            // Test m3u8 streams for English audio
            for (const stream of videoStreams) {
              if (stream.includes('.m3u8')) {
                console.log(`\n6. Testing m3u8 for English audio...`);
                
                try {
                  const m3u8Result = await fetchUrl(stream);
                  if (!m3u8Result.error && m3u8Result.status === 200) {
                    const playlist = m3u8Result.data.toLowerCase();
                    const englishAudioIndicators = [
                      /audio.*english/i,
                      /audio.*en/i,
                      /track.*english/i,
                      /track.*en/i,
                      /dub/i,
                      /eng/i
                    ];
                    
                    const hasEnglishAudio = englishAudioIndicators.some(indicator => indicator.test(playlist));
                    if (hasEnglishAudio) {
                      console.log(`🎉 FOUND ENGLISH AUDIO IN M3U8!`);
                      console.log(`   Stream: ${stream.substring(0, 60)}...`);
                    } else {
                      console.log(`⚠️  No English audio indicators found`);
                    }
                  }
                } catch (e) {
                  console.log(`❌ Error checking m3u8: ${e.message}`);
                }
              }
            }
            
          } else {
            console.log(`❌ Episode page failed: ${epResult.error || epResult.status}`);
          }
        }
        
      } else {
        console.log(`❌ Anime page failed: ${animeResult.error || animeResult.status}`);
      }
    }
  }

  console.log('\n=====================================');
  console.log('9ANIME INVESTIGATION COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 NEXT STEPS:');
  console.log('1. Analyze the found patterns');
  console.log('2. Implement proper 9Anime source extraction');
  console.log('3. Add English audio validation');
  console.log('4. Test actual dub playback');
}

investigate9AnimeStructure();
