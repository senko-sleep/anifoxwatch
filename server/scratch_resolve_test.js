const BASE = 'http://127.0.0.1:8787';

async function runResolveTest() {
  console.log('='.repeat(70));
  console.log('  RESOLVER & QUERY-BASED ENDPOINTS INTEGRATION TEST');
  console.log('='.repeat(70));

  try {
    // 1. Resolve anilist-147105
    console.log('\n1. Resolving AniList ID "anilist-147105" (Witch Hat Atelier) to Streaming ID...');
    const resolveRes = await fetch(`${BASE}/api/anime/resolve?id=anilist-147105`);
    if (!resolveRes.ok) {
      throw new Error(`Resolve failed with status ${resolveRes.status}: ${await resolveRes.text()}`);
    }
    const resolveData = await resolveRes.json();
    console.log('✅ Resolve passed:', JSON.stringify(resolveData, null, 2));

    // 2. Fetch details via query parameter ?id=anilist-147105
    console.log('\n2. Fetching details via GET /api/anime?id=anilist-147105...');
    const detailRes = await fetch(`${BASE}/api/anime?id=anilist-147105`);
    if (!detailRes.ok) {
      throw new Error(`Query-based details failed with status ${detailRes.status}: ${await detailRes.text()}`);
    }
    const detailData = await detailRes.json();
    console.log(`✅ Details passed. Title: "${detailData.title}" (Source: ${detailData.source})`);

    // 3. Fetch episodes via query parameter ?id=anilist-147105
    console.log('\n3. Fetching episodes via GET /api/anime/episodes?id=anilist-147105...');
    const epRes = await fetch(`${BASE}/api/anime/episodes?id=anilist-147105`);
    if (!epRes.ok) {
      throw new Error(`Query-based episodes failed with status ${epRes.status}: ${await epRes.text()}`);
    }
    const epData = await epRes.json();
    console.log(`✅ Episodes passed. Mapped count: ${epData.episodes?.length} (Source: ${epData.source})`);
    if (epData.episodes?.length > 0) {
      console.log(`👉 First Episode ID: "${epData.episodes[0].id}" (Title: "${epData.episodes[0].title}")`);
      
      // Let's fetch servers for the first episode!
      console.log(`\n4. Fetching streaming servers for resolved episode ID: ${epData.episodes[0].id}...`);
      const serverRes = await fetch(`${BASE}/api/stream/servers/${encodeURIComponent(epData.episodes[0].id)}`);
      if (serverRes.ok) {
        const serverData = await serverRes.json();
        console.log(`✅ Servers passed. Found ${serverData.servers?.length} servers (Source: ${serverData.source})`);
        
        // Let's watch the first episode!
        console.log(`\n5. Fetching watch links for resolved episode ID: ${epData.episodes[0].id}...`);
        const watchRes = await fetch(`${BASE}/api/stream/watch/${encodeURIComponent(epData.episodes[0].id)}?category=sub&server=hd-1`);
        if (watchRes.ok) {
          const watchData = await watchRes.json();
          console.log(`✅ Watch links passed! Sources found: ${watchData.sources?.length} (Source: ${watchData.source})`);
          if (watchData.sources?.length > 0) {
            console.log(`👉 Sample Playable Stream URL: ${watchData.sources[0].url.slice(0, 120)}...`);
          }
        } else {
          console.warn(`⚠️ Watch links failed with status ${watchRes.status}: ${await watchRes.text()}`);
        }
      } else {
        console.warn(`⚠️ Servers fetch failed with status ${serverRes.status}: ${await serverRes.text()}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎉 RESOLVER INTEGRATION TEST SUITE COMPLETED SUCCESSFULLY');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n❌ Resolver integration test encountered an error:', err.message);
  }
}

// Start in 3 seconds to let Wrangler Dev hot reload
setTimeout(runResolveTest, 3000);
