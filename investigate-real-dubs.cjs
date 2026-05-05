const https = require('https');
const http = require('http');

// Test direct scraping of actual dub content from websites
async function investigateRealDubSources() {
  console.log('🔍 INVESTIGATING REAL DUB SOURCES');
  console.log('=====================================\n');
  
  // Known anime with good dub availability
  const testAnime = [
    { title: "Attack on Titan", slug: "attack-on-titan" },
    { title: "Demon Slayer", slug: "demon-slayer" },
    { title: "One Piece", slug: "one-piece" },
    { title: "My Hero Academia", slug: "my-hero-academia" },
    { title: "Death Note", slug: "death-note" }
  ];

  // Test different websites for dub content
  const websites = [
    {
      name: "Gogoanime",
      baseUrl: "https://anitaku.to",
      dubPattern: (slug) => `https://anitaku.to/category/${slug}-dub`,
      epPattern: (slug, ep) => `https://anitaku.to/${slug}-dub-episode-${ep}`
    },
    {
      name: "9Anime",
      baseUrl: "https://9animetv.to",
      dubPattern: (slug) => `https://9animetv.to/category/${slug}-dub`,
      epPattern: (slug, ep) => `https://9animetv.to/watch/${slug}-dub-${ep}`
    },
    {
      name: "AnimePahe",
      baseUrl: "https://animepahe.com",
      dubPattern: (slug) => `https://animepahe.com/anime/${slug}`,
      epPattern: (slug, ep) => `https://animepahe.com/anime/${slug}`
    },
    {
      name: "AnimeKai",
      baseUrl: "https://animekai.to",
      dubPattern: (slug) => `https://animekai.to/anime/${slug}-dub`,
      epPattern: (slug, ep) => `https://animekai.to/anime/${slug}-dub-${ep}`
    }
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

  const results = [];

  for (const website of websites) {
    console.log(`\n========== ${website.name} ==========`);
    
    let websiteResults = {
      name: website.name,
      baseUrl: website.baseUrl,
      accessible: false,
      dubPages: [],
      workingDubs: []
    };

    // Test if website is accessible
    console.log(`1. Testing ${website.baseUrl}...`);
    const homepageResult = await fetchUrl(website.baseUrl);
    if (homepageResult.error || homepageResult.status !== 200) {
      console.log(`❌ Website not accessible: ${homepageResult.error || homepageResult.status}`);
      results.push(websiteResults);
      continue;
    }
    websiteResults.accessible = true;
    console.log(`✅ Website accessible (${homepageResult.status})`);

    // Test dub pages for each anime
    for (const anime of testAnime.slice(0, 3)) { // Test first 3 anime
      console.log(`\n2. Testing ${anime.title} dub page...`);
      
      const dubUrl = website.dubPattern(anime.slug);
      console.log(`   URL: ${dubUrl}`);
      
      const dubPageResult = await fetchUrl(dubUrl);
      
      let pageResult = {
        anime: anime.title,
        url: dubUrl,
        status: dubPageResult.status,
        hasEpisodes: false,
        episodeLinks: [],
        hasVideoSources: false,
        dubIndicators: []
      };

      if (dubPageResult.error) {
        console.log(`   ❌ Error: ${dubPageResult.error}`);
        pageResult.status = 'ERROR';
      } else if (dubPageResult.status === 200) {
        console.log(`   ✅ Page exists (${dubPageResult.status})`);
        
        // Look for episode links
        const epLinkPatterns = [
          /href="\/([^"]*episode-\d+)"/gi,
          /href="\/([^"]*-\d+)"/gi,
          /data-ep="([^"]+)"/gi,
          /class="episode-item"[^>]*href="([^"]+)"/gi
        ];
        
        for (const pattern of epLinkPatterns) {
          const matches = [...dubPageResult.data.matchAll(pattern)];
          if (matches.length > 0) {
            pageResult.episodeLinks = matches.map(m => m[1]);
            pageResult.hasEpisodes = true;
            console.log(`   ✅ Found ${matches.length} episode links`);
            break;
          }
        }

        // Look for dub indicators
        const dubIndicators = [
          /dub/gi,
          /english/gi,
          /eng/gi,
          /audio[^>]*english/gi,
          /subtitles[^>]*off/gi,
          /data-type="dub"/gi,
          /class="[^"]*dub[^"]*"/gi
        ];
        
        for (const indicator of dubIndicators) {
          const matches = dubPageResult.data.match(indicator);
          if (matches && matches.length > 0) {
            pageResult.dubIndicators.push(indicator.source);
            console.log(`   ✅ Found dub indicator: ${indicator.source}`);
          }
        }

        // Look for video sources/embeds
        const videoPatterns = [
          /data-video="([^"]+)"/gi,
          /src="([^"]*\.(m3u8|mp4)[^"]*)"/gi,
          /iframe[^>]*src="([^"]+)"/gi,
          /source[^>]*src="([^"]+)"/gi
        ];
        
        for (const pattern of videoPatterns) {
          const matches = [...dubPageResult.data.matchAll(pattern)];
          if (matches.length > 0) {
            pageResult.hasVideoSources = true;
            console.log(`   ✅ Found ${matches.length} video sources`);
            break;
          }
        }

        // If we have episodes, test the first one
        if (pageResult.episodeLinks.length > 0) {
          console.log(`\n3. Testing first episode...`);
          const firstEp = pageResult.episodeLinks[0];
          const epUrl = `${website.baseUrl}/${firstEp}`;
          console.log(`   URL: ${epUrl}`);
          
          const epResult = await fetchUrl(epUrl);
          if (!epResult.error && epResult.status === 200) {
            // Check for video sources in episode page
            for (const pattern of videoPatterns) {
              const matches = [...epResult.data.matchAll(pattern)];
              if (matches.length > 0) {
                console.log(`   ✅ Episode has ${matches.length} video sources`);
                pageResult.hasVideoSources = true;
                websiteResults.workingDubs.push({
                  anime: anime.title,
                  episode: firstEp,
                  sources: matches.length
                });
                break;
              }
            }
          } else {
            console.log(`   ❌ Episode error: ${epResult.error || epResult.status}`);
          }
        }

      } else {
        console.log(`   ⚠️  Page not found (${dubPageResult.status})`);
      }
      
      websiteResults.dubPages.push(pageResult);
    }
    
    results.push(websiteResults);
  }

  // Summary
  console.log('\n=====================================');
  console.log('REAL DUB SOURCE INVESTIGATION RESULTS');
  console.log('=====================================\n');
  
  const workingSources = results.filter(r => r.workingDubs.length > 0);
  const accessibleSources = results.filter(r => r.accessible);
  const deadSources = results.filter(r => !r.accessible);

  if (workingSources.length > 0) {
    console.log(`✅ WORKING DUB SOURCES (${workingSources.length}):`);
    workingSources.forEach(source => {
      console.log(`\n${source.name} (${source.baseUrl}):`);
      source.workingDubs.forEach(dub => {
        console.log(`   - ${dub.anime}: ${dub.episode} (${dub.sources} sources)`);
      });
    });
  }

  if (accessibleSources.length > 0) {
    console.log(`\n🌐 ACCESSIBLE SOURCES (${accessibleSources.length}):`);
    accessibleSources.forEach(source => {
      const dubPages = source.dubPages.filter(p => p.status === 200);
      console.log(`   ${source.name}: ${dubPages.length} dub pages found`);
    });
  }

  if (deadSources.length > 0) {
    console.log(`\n❌ DEAD SOURCES (${deadSources.length}):`);
    deadSources.forEach(source => {
      console.log(`   ${source.name}: ${source.baseUrl}`);
    });
  }

  console.log('\n=====================================');
  console.log('RECOMMENDATIONS:');
  console.log('=====================================');
  
  if (workingSources.length > 0) {
    console.log('\n✅ IMPLEMENT DUB SCRAPING FOR:');
    workingSources.forEach(source => {
      console.log(`- ${source.name}: Focus on ${source.workingDubs.map(d => d.anime).join(', ')}`);
    });
  } else {
    console.log('\n⚠️  NO WORKING DUB SOURCES FOUND');
    console.log('Recommendations:');
    console.log('1. Try different URL patterns for dub content');
    console.log('2. Look for dub indicators in regular anime pages');
    console.log('3. Check for separate dub domains/subdomains');
    console.log('4. Implement more sophisticated scraping techniques');
  }

  console.log('\n=====================================');
  console.log('INVESTIGATION COMPLETE');
  console.log('=====================================');
}

investigateRealDubSources();
