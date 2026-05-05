const http = require('http');

// Test specifically if 9Anime provides actual dub streams
async function test9AnimeDub() {
  console.log('=== Testing 9Anime for DUB streams ===\n');
  
  const animeList = [
    { id: 16498, name: "Attack on Titan" },
    { id: 21, name: "One Piece" },
    { id: 20958, name: "Demon Slayer" },
    { id: 31964, name: "My Hero Academia" }
  ];

  function makeRequest(path) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: path,
        method: 'GET',
        timeout: 30000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ error: e.message });
          }
        });
      });

      req.on('error', (e) => resolve({ error: e.message }));
      req.end();
    });
  }

  for (const anime of animeList) {
    console.log(`\n========== ${anime.name} ==========`);
    
    // Resolve anime
    const resolveData = await makeRequest(`/api/anime/resolve?id=anilist-${anime.id}`);
    if (!resolveData || !resolveData.streamingId) {
      console.log(`❌ Resolve failed`);
      continue;
    }
    console.log(`✅ Resolved: ${resolveData.streamingId}`);

    // Get episodes
    const epData = await makeRequest(`/api/anime/episodes?id=${encodeURIComponent(resolveData.streamingId)}`);
    if (!epData || !epData.episodes || epData.episodes.length === 0) {
      console.log(`❌ No episodes`);
      continue;
    }
    const firstEp = epData.episodes[0];
    console.log(`✅ Found ${epData.episodes.length} episodes`);

    // Test 9Anime specifically for dub
    console.log(`\n--- Testing 9Anime for DUB ---`);
    const streamData = await makeRequest(`/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=dub&server=9anime&ep_num=1&anilist_id=${anime.id}`);
    
    if (streamData.error) {
      console.log(`❌ Error: ${streamData.error}`);
      continue;
    }

    if (!streamData.sources || streamData.sources.length === 0) {
      console.log(`⚠️  No sources (dubUnavailable: ${streamData.dubUnavailable})`);
      console.log(`   dubFallback: ${streamData.dubFallback}`);
      continue;
    }

    const sourceInfo = streamData.sources[0];
    console.log(`✅ STREAM FOUND!`);
    console.log(`   Category: ${streamData.category}`);
    console.log(`   Source: ${sourceInfo.server || streamData.server}`);
    console.log(`   Quality: ${sourceInfo.quality || 'unknown'}`);
    console.log(`   Audio: ${streamData.audioLanguage || 'not specified'}`);
    console.log(`   dubFallback: ${streamData.dubFallback || false}`);
    console.log(`   URL: ${sourceInfo.url?.substring(0, 60)}...`);
    
    // Check if it's actually a dub
    if (streamData.category === 'dub') {
      console.log(`🎉 ACTUAL DUB STREAM FOUND!`);
    } else {
      console.log(`⚠️  Still returning as sub, not dub`);
    }
  }

  console.log('\n========================================');
  console.log('SUMMARY:');
  console.log('If any anime shows "ACTUAL DUB STREAM FOUND!", 9Anime has working dubs');
  console.log('Otherwise, we need to find a different source or approach');
  console.log('========================================');
}

test9AnimeDub();
