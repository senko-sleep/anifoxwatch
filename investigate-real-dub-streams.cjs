const https = require('https');
const http = require('http');

// Investigate sources that actually have real English dub streams
async function investigateRealDubStreams() {
  console.log('🔍 INVESTIGATING REAL DUB STREAMS');
  console.log('=====================================\n');
  
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

  // Test sources known to have actual dub content
  const knownDubSources = [
    {
      name: '9Anime (known for dub)',
      baseUrl: 'https://9anime.to',
      searchUrl: (q) => `https://9anime.to/search?keyword=${encodeURIComponent(q)}`,
      episodeUrl: (slug, ep) => `https://9anime.to/watch/${slug}/${ep}`
    },
    {
      name: 'AnimeKaizoku',
      baseUrl: 'https://animekaizoku.com',
      searchUrl: (q) => `https://animekaizoku.com/?s=${encodeURIComponent(q)}`,
      episodeUrl: (slug, ep) => `https://animekaizoku.com/${slug}-episode-${ep}`
    },
    {
      name: 'AnimeFreak',
      baseUrl: 'https://animefreak.in',
      searchUrl: (q) => `https://animefreak.in/search?keyword=${encodeURIComponent(q)}`,
      episodeUrl: (slug, ep) => `https://animefreak.in/watch/${slug}/episode-${ep}`
    },
    {
      name: 'AnimixPlay',
      baseUrl: 'https://animixplay.to',
      searchUrl: (q) => `https://animixplay.to/?s=${encodeURIComponent(q)}`,
      episodeUrl: (slug, ep) => `https://animixplay.to/${slug}-episode-${ep}`
    },
    {
      name: 'AnimeDex',
      baseUrl: 'https://animedex.to',
      searchUrl: (q) => `https://animedex.to/search?keyword=${encodeURIComponent(q)}`,
      episodeUrl: (slug, ep) => `https://animedex.to/watch/${slug}/${ep}`
    }
  ];

  const testAnime = [
    { title: 'Attack on Titan', slug: 'attack-on-titan', episode: 1 },
    { title: 'Demon Slayer', slug: 'demon-slayer', episode: 1 },
    { title: 'One Piece', slug: 'one-piece', episode: 1 }
  ];

  const workingSources = [];

  for (const source of knownDubSources) {
    console.log(`\n========== ${source.name} ==========`);
    
    let sourceResults = {
      name: source.name,
      baseUrl: source.baseUrl,
      accessible: false,
      hasSearchResults: false,
      hasDubContent: false,
      foundEpisodes: [],
      videoStreams: []
    };

    // Test if website is accessible
    console.log(`1. Testing ${source.baseUrl}...`);
    const homepageResult = await fetchUrl(source.baseUrl);
    if (homepageResult.error || homepageResult.status !== 200) {
      console.log(`❌ Website not accessible: ${homepageResult.error || homepageResult.status}`);
      continue;
    }
    sourceResults.accessible = true;
    console.log(`✅ Website accessible (${homepageResult.status})`);

    // Test search for anime
    for (const anime of testAnime.slice(0, 2)) { // Test first 2 anime
      console.log(`\n2. Searching for "${anime.title}"...`);
      
      const searchUrl = source.searchUrl(anime.title);
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
      sourceResults.hasSearchResults = true;
      
      // Look for anime links and dub indicators
      const searchContent = searchResult.data.toLowerCase();
      const dubIndicators = [
        /dub/gi,
        /english/gi,
        /eng/gi,
        /dubbed/gi,
        /english dub/gi
      ];
      
      let dubIndicatorCount = 0;
      for (const indicator of dubIndicators) {
        const matches = searchContent.match(indicator);
        if (matches && matches.length > 0) {
          dubIndicatorCount += matches.length;
        }
      }
      
      if (dubIndicatorCount > 0) {
        console.log(`   ✅ Found ${dubIndicatorCount} dub indicators in search`);
        sourceResults.hasDubContent = true;
      }
      
      // Look for episode links
      const linkPatterns = [
        /href="\/([^"]*episode[^"]*)"/gi,
        /href="\/([^"]*watch[^"]*)"/gi,
        /href="([^"]*episode[^"]*)"/gi,
        /href="([^"]*watch[^"]*)"/gi
      ];
      
      let foundEpisodes = [];
      for (const pattern of linkPatterns) {
        const matches = [...searchResult.data.matchAll(pattern)];
        if (matches.length > 0) {
          foundEpisodes.push(...matches.map(m => m[1]));
          console.log(`   ✅ Found ${matches.length} episode links`);
          break;
        }
      }
      
      if (foundEpisodes.length > 0) {
        // Test the first episode link for actual video streams
        const firstEpLink = foundEpisodes[0];
        const fullEpUrl = firstEpLink.startsWith('http') ? firstEpLink : `${source.baseUrl}/${firstEpLink}`;
        
        console.log(`\n3. Testing episode page: ${fullEpUrl}`);
        const epResult = await fetchUrl(fullEpUrl);
        
        if (!epResult.error && epResult.status === 200) {
          console.log(`   ✅ Episode page loaded (${epResult.data.length} bytes)`);
          
          // Look for video sources
          const videoPatterns = [
            /src="([^"]*\.m3u8[^"]*)"/gi,
            /src="([^"]*\.mp4[^"]*)"/gi,
            /data-video="([^"]+)"/gi,
            /<iframe[^>]*src="([^"]+)"/gi,
            /file:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /url:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
            /source:\s*["']([^"']*\.m3u8[^"']*)["']/gi
          ];
          
          let videoStreams = [];
          for (const pattern of videoPatterns) {
            const matches = [...epResult.data.matchAll(pattern)];
            if (matches.length > 0) {
              videoStreams.push(...matches.map(m => m[1]));
              console.log(`   ✅ Found ${matches.length} video streams with ${pattern.source}`);
            }
          }
          
          // Filter for actual streaming URLs
          const actualStreams = videoStreams.filter(url => 
            url.includes('.m3u8') || 
            url.includes('.mp4') || 
            url.includes('stream') ||
            url.includes('cdn') ||
            url.includes('vcdn')
          );
          
          if (actualStreams.length > 0) {
            console.log(`   ✅ Found ${actualStreams.length} actual video streams`);
            sourceResults.videoStreams.push(...actualStreams);
            sourceResults.foundEpisodes.push({
              anime: anime.title,
              episodeUrl: fullEpUrl,
              streams: actualStreams
            });
          }
          
          // Check for English audio in m3u8 streams
          for (const stream of actualStreams) {
            if (stream.includes('.m3u8')) {
              console.log(`\n4. Checking m3u8 for English audio: ${stream.substring(0, 60)}...`);
              
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
                    console.log(`   🎉 FOUND ENGLISH AUDIO IN M3U8!`);
                    sourceResults.hasDubContent = true;
                  } else {
                    console.log(`   ⚠️  No English audio indicators found`);
                  }
                }
              } catch (e) {
                console.log(`   ❌ Error checking m3u8: ${e.message}`);
              }
            }
          }
        } else {
          console.log(`   ❌ Episode page failed: ${epResult.error || epResult.status}`);
        }
      }
    }
    
    if (sourceResults.accessible && sourceResults.hasDubContent && sourceResults.videoStreams.length > 0) {
      workingSources.push(sourceResults);
    }
  }

  // Summary
  console.log('\n=====================================');
  console.log('REAL DUB STREAMS INVESTIGATION RESULTS');
  console.log('=====================================\n');
  
  if (workingSources.length > 0) {
    console.log(`✅ WORKING DUB SOURCES FOUND (${workingSources.length}):`);
    workingSources.forEach(source => {
      console.log(`\n${source.name} (${source.baseUrl}):`);
      console.log(`   Accessible: ${source.accessible}`);
      console.log(`   Has search results: ${source.hasSearchResults}`);
      console.log(`   Has dub content: ${source.hasDubContent}`);
      console.log(`   Video streams found: ${source.videoStreams.length}`);
      console.log(`   Episodes with streams: ${source.foundEpisodes.length}`);
      
      source.foundEpisodes.forEach((ep, i) => {
        console.log(`     ${i + 1}. ${ep.anime}: ${ep.streams.length} streams`);
      });
    });
    
    console.log('\n🎯 IMPLEMENTATION PLAN:');
    console.log('1. Create source classes for the working sources');
    console.log('2. Implement proper dub stream extraction');
    console.log('3. Add m3u8 English audio validation');
    console.log('4. Test actual dub playback');
    
  } else {
    console.log('❌ NO WORKING DUB SOURCES FOUND');
    console.log('\n🔄 ALTERNATIVE APPROACHES:');
    console.log('1. Try more sources from the user list');
    console.log('2. Implement custom dub extraction for existing sources');
    console.log('3. Use multiple sources and combine results');
    console.log('4. Create a hybrid approach with existing + new sources');
  }

  console.log('\n=====================================');
  console.log('INVESTIGATION COMPLETE');
  console.log('=====================================\n');
  
  return workingSources;
}

investigateRealDubStreams();
