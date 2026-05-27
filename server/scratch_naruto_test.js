const BASE = 'http://127.0.0.1:8787';

async function runNarutoTest() {
  console.log('='.repeat(70));
  console.log('  NARUTO END-TO-END WORKER FLOW TEST');
  console.log('='.repeat(70));

  try {
    // 1. Search for Naruto
    console.log('\n1. Searching for "naruto"...');
    const searchRes = await fetch(`${BASE}/api/anime/search?q=naruto`);
    if (!searchRes.ok) {
      throw new Error(`Search failed with status ${searchRes.status}: ${await searchRes.text()}`);
    }
    const searchData = await searchRes.json();
    console.log(`✅ Search passed. Found ${searchData.results?.length} results.`);
    
    // Find the main Naruto series
    const mainNaruto = searchData.results?.find(item => 
      item.title?.toLowerCase() === 'naruto' || item.id === '20'
    );
    
    if (!mainNaruto) {
      console.log('⚠️ Could not find exact "Naruto" series by title/ID in results, using first result instead.');
    }
    const target = mainNaruto || searchData.results?.[0];
    if (!target) {
      throw new Error('No search results found!');
    }
    
    console.log(`👉 Selected Target: "${target.title}" (ID: ${target.id})`);

    // 2. Fetch Episodes for selected target
    console.log(`\n2. Fetching episodes for anime ID: ${target.id}...`);
    const epRes = await fetch(`${BASE}/api/anime/${target.id}/episodes`);
    if (!epRes.ok) {
      throw new Error(`Episodes fetch failed with status ${epRes.status}: ${await epRes.text()}`);
    }
    const epData = await epRes.json();
    console.log(`✅ Episodes passed. Mapped count: ${epData.episodes?.length} (Source: ${epData.source})`);

    if (!epData.episodes || epData.episodes.length === 0) {
      throw new Error('No episodes returned!');
    }

    const firstEp = epData.episodes[0];
    console.log(`👉 Selected Episode 1 ID: "${firstEp.id}" (Title: "${firstEp.title}")`);

    // 3. Fetch servers for Episode 1
    console.log(`\n3. Fetching streaming servers for episode ID: ${firstEp.id}...`);
    const serverRes = await fetch(`${BASE}/api/stream/servers/${encodeURIComponent(firstEp.id)}`);
    if (!serverRes.ok) {
      throw new Error(`Servers fetch failed with status ${serverRes.status}: ${await serverRes.text()}`);
    }
    const serverData = await serverRes.json();
    console.log(`✅ Servers passed. Found ${serverData.servers?.length} servers (Source: ${serverData.source}):`);
    console.log(JSON.stringify(serverData.servers, null, 2));

    // 4. Fetch watch links for Episode 1 (Subbed category, server hd-1)
    console.log(`\n4. Fetching watch links for episode ID: ${firstEp.id} (Category: sub, Server: hd-1)...`);
    const watchRes = await fetch(`${BASE}/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=sub&server=hd-1`);
    if (!watchRes.ok) {
      console.warn(`⚠️ Watch links failed with status ${watchRes.status}. This is expected if HiAnime scraper doesn't recognize Jikan/AniList fallback ID.`);
      const text = await watchRes.text();
      console.warn(`Response: ${text}`);
    } else {
      const watchData = await watchRes.json();
      console.log(`✅ Watch links passed! (Source: ${watchData.source})`);
      console.log(`👉 Available Sources Count: ${watchData.sources?.length}`);
      console.log(JSON.stringify(watchData.sources, null, 2));
      console.log(`👉 Subtitles Count: ${watchData.subtitles?.length}`);
      if (watchData.subtitles?.length > 0) {
        console.log(`Sample Subtitle [${watchData.subtitles[0].lang}]: ${watchData.subtitles[0].url.slice(0, 100)}...`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎉 END-TO-END FLOW COMPLETED');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n❌ Flow test encountered an error:', err.message);
  }
}

// Start in 3 seconds to let Wrangler start up fully
setTimeout(runNarutoTest, 3000);
