const https = require('https');
const http = require('http');
const axios = require('axios');

// Test sources from user's list that are likely to have working dub content
async function testDubSourcesList() {
  console.log('🔍 TESTING DUB SOURCES FROM USER LIST');
  console.log('=====================================\n');
  
  // Prioritize sources known for dub content
  const prioritySources = [
    { name: 'AnimeDao', baseUrl: 'https://animedao.to', dubPattern: (slug, ep) => `https://animedao.to/${slug}-episode-${ep}` },
    { name: 'AnimeFreak', baseUrl: 'https://www.animefreak.tv', dubPattern: (slug, ep) => `https://www.animefreak.tv/watch/${slug}/episode-${ep}` },
    { name: 'DubbedAnime', baseUrl: 'https://dubbedanime.net', dubPattern: (slug, ep) => `https://dubbedanime.net/${slug}-episode-${ep}` },
    { name: '4Anime', baseUrl: 'https://4anime.to', dubPattern: (slug, ep) => `https://4anime.to/${slug}-episode-${ep}` },
    { name: 'AnimeHeaven', baseUrl: 'https://animeheaven.ru', dubPattern: (slug, ep) => `https://animeheaven.ru/${slug}-episode-${ep}` },
    { name: 'YugenAnime', baseUrl: 'https://yugenanime.tv', dubPattern: (slug, ep) => `https://yugenanime.tv/watch/${slug}/${ep}` },
    { name: 'AnimeKai', baseUrl: 'https://animekai.to', dubPattern: (slug, ep) => `https://animekai.to/${slug}-episode-${ep}` },
    { name: 'Kaido', baseUrl: 'https://kaido.to', dubPattern: (slug, ep) => `https://kaido.to/${slug}-episode-${ep}` },
    { name: 'AllAnime', baseUrl: 'https://allanime.site', dubPattern: (slug, ep) => `https://allanime.site/${slug}-episode-${ep}` },
    { name: 'AnimeFlix', baseUrl: 'https://animeflix.io', dubPattern: (slug, ep) => `https://animeflix.io/${slug}-episode-${ep}` },
    { name: 'AnimeWorld', baseUrl: 'https://animeworld.so', dubPattern: (slug, ep) => `https://animeworld.so/${slug}-episode-${ep}` },
    { name: 'AnimeShow', baseUrl: 'https://animeshow.tv', dubPattern: (slug, ep) => `https://animeshow.tv/${slug}-episode-${ep}` },
    { name: 'OtakuStream', baseUrl: 'https://otakustream.tv', dubPattern: (slug, ep) => `https://otakustream.tv/${slug}-episode-${ep}` },
    { name: 'AnimeHeros', baseUrl: 'https://animeheros.com', dubPattern: (slug, ep) => `https://animeheros.com/${slug}-episode-${ep}` },
    { name: 'Wcofun', baseUrl: 'https://wcofun.org', dubPattern: (slug, ep) => `https://wcofun.org/${slug}-episode-${ep}` }
  ];

  const testAnime = [
    { slug: 'attack-on-titan', ep: '1', title: 'Attack on Titan' },
    { slug: 'demon-slayer', ep: '1', title: 'Demon Slayer' },
    { slug: 'one-piece', ep: '1', title: 'One Piece' }
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

  const workingSources = [];

  for (const source of prioritySources) {
    console.log(`\n========== ${source.name} ==========`);
    
    let sourceResults = {
      name: source.name,
      baseUrl: source.baseUrl,
      accessible: false,
      hasDubContent: false,
      workingEpisodes: []
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

    // Test dub episodes for each anime
    for (const anime of testAnime.slice(0, 2)) { // Test first 2 anime
      console.log(`\n2. Testing ${anime.title} episode ${anime.ep}...`);
      
      const dubUrl = source.dubPattern(anime.slug, anime.ep);
      console.log(`   URL: ${dubUrl}`);
      
      const epResult = await fetchUrl(dubUrl);
      
      let episodeResult = {
        anime: anime.title,
        url: dubUrl,
        status: epResult.status,
        hasVideoSources: false,
        dubIndicators: [],
        episodeLinks: []
      };

      if (epResult.error) {
        console.log(`   ❌ Error: ${epResult.error}`);
        episodeResult.status = 'ERROR';
      } else if (epResult.status === 200) {
        console.log(`   ✅ Episode page loaded (${epResult.data.length} bytes)`);
        
        // Look for dub indicators
        const dubIndicators = [
          { name: 'Dub text', pattern: /dub/gi },
          { name: 'English text', pattern: /english/gi },
          { name: 'Eng text', pattern: /eng/gi },
          { name: 'Audio English', pattern: /audio[^>]*english/gi },
          { name: 'Dub class', pattern: /class="[^"]*dub[^"]*"/gi },
          { name: 'Dub data', pattern: /data-dub="([^"]+)"/gi },
          { name: 'Type dub', pattern: /data-type="dub"/gi },
          { name: 'Dub option', pattern: /<option[^>]*dub[^>]*>/gi },
          { name: 'Dub button', pattern: /<button[^>]*dub[^>]*>/gi }
        ];
        
        for (const { name, pattern } of dubIndicators) {
          const matches = epResult.data.match(pattern);
          if (matches && matches.length > 0) {
            episodeResult.dubIndicators.push({ name, count: matches.length });
            console.log(`   ✅ Found ${matches.length} ${name} indicators`);
          }
        }
        
        // Look for video sources/embeds
        const videoPatterns = [
          { name: 'Data-video', pattern: /data-video="([^"]+)"/gi },
          { name: 'M3U8 links', pattern: /href="([^"]*\.m3u8[^"]*)"/gi },
          { name: 'MP4 links', pattern: /href="([^"]*\.mp4[^"]*)"/gi },
          { name: 'Iframes', pattern: /<iframe[^>]*src="([^"]+)"/gi },
          { name: 'Video sources', pattern: /<source[^>]*src="([^"]+)"/gi },
          { name: 'Stream URLs', pattern: /stream.*url["']?\s*[:=]\s*["']([^"']+)["']/gi }
        ];
        
        for (const { name, pattern } of videoPatterns) {
          const matches = [...epResult.data.matchAll(pattern)];
          if (matches.length > 0) {
            episodeResult.hasVideoSources = true;
            console.log(`   ✅ Found ${matches.length} ${name}`);
            
            // Check if any URLs look like actual video streams
            const videoUrls = matches.map(m => m[1]).filter(url => 
              url.includes('.m3u8') || 
              url.includes('.mp4') || 
              url.includes('stream') ||
              url.includes('vcdn') ||
              url.includes('cdn')
            );
            
            if (videoUrls.length > 0) {
              console.log(`   ✅ Found ${videoUrls.length} potential video URLs`);
              sourceResults.hasDubContent = true;
            }
          }
        }
        
        // Look for episode lists (indicates series structure)
        const epListPatterns = [
          /class="[^"]*episode[^"]*"/gi,
          /class="[^"]*ep[^"]*"/gi,
          /href="[^"]*episode-[^"]*"/gi,
          /data-episode="([^"]+)"/gi
        ];
        
        for (const pattern of epListPatterns) {
          const matches = [...epResult.data.matchAll(pattern)];
          if (matches.length > 0) {
            episodeResult.episodeLinks = matches.map(m => m[1] || m[0]);
            console.log(`   ✅ Found ${matches.length} episode links`);
            break;
          }
        }
        
        // If we found dub indicators AND video sources, this is promising
        if (episodeResult.dubIndicators.length > 0 && episodeResult.hasVideoSources) {
          console.log(`🎉 PROMISING DUB SOURCE!`);
          sourceResults.workingEpisodes.push({
            anime: anime.title,
            dubIndicators: episodeResult.dubIndicators.length,
            videoSources: episodeResult.hasVideoSources
          });
        }
        
      } else {
        console.log(`   ⚠️  Episode not found (${episodeResult.status})`);
      }
    }
    
    if (sourceResults.accessible && sourceResults.hasDubContent) {
      workingSources.push(sourceResults);
    }
  }

  // Summary
  console.log('\n=====================================');
  console.log('DUB SOURCES TEST RESULTS');
  console.log('=====================================\n');
  
  if (workingSources.length > 0) {
    console.log(`✅ WORKING DUB SOURCES FOUND (${workingSources.length}):`);
    workingSources.forEach(source => {
      console.log(`\n${source.name} (${source.baseUrl}):`);
      console.log(`   Accessible: ${source.accessible}`);
      console.log(`   Has dub content: ${source.hasDubContent}`);
      console.log(`   Working episodes: ${source.workingEpisodes.length}`);
      source.workingEpisodes.forEach(ep => {
        console.log(`     - ${ep.anime}: ${ep.dubIndicators} dub indicators, video sources: ${ep.videoSources}`);
      });
    });
    
    console.log('\n🎯 RECOMMENDATION:');
    console.log('Implement these sources in order of priority:');
    workingSources.forEach((source, i) => {
      console.log(`${i + 1}. ${source.name} - Add to source manager with dub extraction`);
    });
    
  } else {
    console.log('❌ NO WORKING DUB SOURCES FOUND');
    console.log('\n🔄 ALTERNATIVE APPROACHES:');
    console.log('1. Test more sources from the list');
    console.log('2. Look for specialized dub-only sites');
    console.log('3. Implement custom dub extraction for existing sources');
    console.log('4. Use multiple sources and combine results');
  }

  console.log('\n=====================================');
  console.log('TEST COMPLETE');
  console.log('=====================================');
  
  return workingSources;
}

testDubSourcesList();
