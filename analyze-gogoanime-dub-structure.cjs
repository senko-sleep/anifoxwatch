const https = require('https');

// Deep analysis of Gogoanime dub page structure
async function analyzeGogoanimeDubStructure() {
  console.log('🔍 ANALYZING GOGOANIME DUB STRUCTURE');
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

  const testAnime = [
    { title: "Attack on Titan", slug: "attack-on-titan", expectedEp: 1 },
    { title: "Demon Slayer", slug: "demon-slayer", expectedEp: 1 },
    { title: "One Piece", slug: "one-piece", expectedEp: 1 }
  ];

  for (const anime of testAnime) {
    console.log(`\n========== ${anime.title} ==========`);
    
    // Test dub category page
    const dubCategoryUrl = `https://anitaku.to/category/${anime.slug}-dub`;
    console.log(`1. Analyzing dub category page: ${dubCategoryUrl}`);
    
    const categoryResult = await fetchUrl(dubCategoryUrl);
    if (categoryResult.error || categoryResult.status !== 200) {
      console.log(`❌ Category page failed: ${categoryResult.error || categoryResult.status}`);
      continue;
    }
    
    console.log(`✅ Category page loaded (${categoryResult.data.length} bytes)`);
    
    // Look for different episode link patterns
    const episodePatterns = [
      { name: "Standard episode links", pattern: /href="\/([^"]*episode-\d+)"/gi },
      { name: "ID-based episodes", pattern: /href="\/([^"]*\$ep=\d+)"/gi },
      { name: "Slug episodes", pattern: /href="\/([^"]*-${anime.expectedEp})"/gi },
      { name: "Data-episode", pattern: /data-episode="([^"]+)"/gi },
      { name: "Episode items", pattern: /class="episode-item"[^>]*href="([^"]+)"/gi },
      { name: "Anime items", pattern: /class="anime-item"[^>]*href="([^"]+)"/gi }
    ];
    
    let foundEpisodes = [];
    for (const { name, pattern } of episodePatterns) {
      const matches = [...categoryResult.data.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`✅ ${name}: Found ${matches.length} potential episodes`);
        foundEpisodes.push(...matches.map(m => m[1]));
      }
    }
    
    // Look for dub indicators
    const dubIndicators = [
      { name: "Dub text", pattern: /dub/gi },
      { name: "English text", pattern: /english/gi },
      { name: "Eng text", pattern: /eng/gi },
      { name: "Audio English", pattern: /audio[^>]*english/gi },
      { name: "Dub class", pattern: /class="[^"]*dub[^"]*"/gi },
      { name: "Dub data", pattern: /data-dub="([^"]+)"/gi },
      { name: "Type dub", pattern: /data-type="dub"/gi }
    ];
    
    console.log(`\n2. Checking for dub indicators...`);
    for (const { name, pattern } of dubIndicators) {
      const matches = categoryResult.data.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`✅ Found ${matches.length} ${name} indicators`);
      }
    }
    
    // Look for video sources/embeds
    const videoPatterns = [
      { name: "Data-video", pattern: /data-video="([^"]+)"/gi },
      { name: "M3U8 links", pattern: /href="([^"]*\.m3u8[^"]*)"/gi },
      { name: "MP4 links", pattern: /href="([^"]*\.mp4[^"]*)"/gi },
      { name: "Iframes", pattern: /<iframe[^>]*src="([^"]+)"/gi },
      { name: "Video sources", pattern: /<source[^>]*src="([^"]+)"/gi }
    ];
    
    console.log(`\n3. Checking for video sources...`);
    for (const { name, pattern } of videoPatterns) {
      const matches = [...categoryResult.data.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} ${name}`);
      }
    }
    
    // Look for pagination or episode list structure
    console.log(`\n4. Analyzing page structure...`);
    
    // Check if there's an episode list
    const hasEpisodeList = /class="[^"]*episode[^"]*"/gi.test(categoryResult.data);
    const hasListItems = /<li/gi.test(categoryResult.data);
    const hasPagination = /class="[^"]*pagi[^"]*"/gi.test(categoryResult.data);
    
    console.log(`   Has episode list: ${hasEpisodeList}`);
    console.log(`   Has list items: ${hasListItems}`);
    console.log(`   Has pagination: ${hasPagination}`);
    
    // If we found episodes, test the first one
    if (foundEpisodes.length > 0) {
      console.log(`\n5. Testing first episode: ${foundEpisodes[0]}`);
      const episodeUrl = `https://anitaku.to/${foundEpisodes[0]}`;
      console.log(`   URL: ${episodeUrl}`);
      
      const episodeResult = await fetchUrl(episodeUrl);
      if (!episodeResult.error && episodeResult.status === 200) {
        console.log(`✅ Episode page loaded (${episodeResult.data.length} bytes)`);
        
        // Check for video sources in episode page
        let hasVideo = false;
        for (const { name, pattern } of videoPatterns) {
          const matches = [...episodeResult.data.matchAll(pattern)];
          if (matches.length > 0) {
            console.log(`✅ Episode has ${matches.length} ${name}`);
            hasVideo = true;
          }
        }
        
        if (!hasVideo) {
          console.log(`⚠️  Episode page has no video sources`);
          
          // Look for player containers or scripts
          const playerPatterns = [
            /class="[^"]*player[^"]*"/gi,
            /id="[^"]*player[^"]*"/gi,
            /<script/gi,
            /vibeplayer/gi
          ];
          
          for (const pattern of playerPatterns) {
            const matches = episodeResult.data.match(pattern);
            if (matches && matches.length > 0) {
              console.log(`✅ Found ${matches.length} player indicators: ${pattern.source}`);
            }
          }
        }
      } else {
        console.log(`❌ Episode page failed: ${episodeResult.error || episodeResult.status}`);
      }
    } else {
      console.log(`\n5. No episodes found, checking alternative patterns...`);
      
      // Look for alternative dub content patterns
      const alternativePatterns = [
        { name: "Dub tabs", pattern: /<[^>]*dub[^>]*>/gi },
        { name: "Audio options", pattern: /<[^>]*audio[^>]*>/gi },
        { name: "Language options", pattern: /<[^>]*lang[^>]*>/gi },
        { name: "Server lists", pattern: /class="[^"]*server[^"]*"/gi }
      ];
      
      for (const { name, pattern } of alternativePatterns) {
        const matches = [...categoryResult.data.matchAll(pattern)];
        if (matches.length > 0) {
          console.log(`✅ Found ${matches.length} ${name}`);
        }
      }
    }
    
    // Show a snippet of the page content for manual inspection
    console.log(`\n6. Page content snippet (first 1000 chars):`);
    console.log(categoryResult.data.substring(0, 1000));
  }

  console.log('\n=====================================');
  console.log('ANALYSIS COMPLETE');
  console.log('=====================================\n');
  
  console.log('🎯 KEY FINDINGS:');
  console.log('1. Gogoanime dub pages exist but may not have episodes');
  console.log('2. Need to check if dub content is embedded differently');
  console.log('3. May need to look for dub indicators in regular pages');
  console.log('4. Could be using JavaScript to load dub content');
}

analyzeGogoanimeDubStructure();
