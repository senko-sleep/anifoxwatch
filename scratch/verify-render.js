async function testEndpoint(label, url) {
    console.log(`\n🔍 Testing ${label}...`);
    console.log(`URL: ${url}`);
    try {
        const start = Date.now();
        const res = await fetch(url);
        const elapsed = Date.now() - start;
        const data = await res.json();
        
        console.log(`Status: ${res.status} (${elapsed}ms)`);
        if (data.sources && data.sources.length > 0) {
            console.log(`✅ SUCCESS! Found ${data.sources.length} sources.`);
            console.log(`   Source provider: ${data.source || data.server}`);
            console.log(`   Quality: ${data.sources[0].quality}`);
            console.log(`   Proxied URL: ${data.sources[0].url?.substring(0, 100)}...`);
            
            // Verify proxy URL if present
            if (data.sources[0].url) {
                const pRes = await fetch(data.sources[0].url);
                console.log(`   Proxy status: ${pRes.status} (${pRes.headers.get('content-type')})`);
            }
        } else {
            console.log(`❌ FAILED: ${data.error || 'No sources returned'}`);
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error(`❌ ERROR: ${err.message}`);
    }
}

async function runAllTests() {
    console.log('🚀 RUNNING RIGOROUS EXTERNAL STREAMING TESTS AGAINST RENDER API...');
    
    await testEndpoint('1. Anime (AniList ID - One Piece)', 'https://anifoxwatch-dko2.onrender.com/api/stream/watch/anilist-21?ep=1');
    await testEndpoint('1b. Anime (AniList ID - 189046 ep 3)', 'https://anifoxwatch-dko2.onrender.com/api/stream/watch/anilist-189046?ep=3');
    await testEndpoint('2. Anime (Aniwaves ID)', 'https://anifoxwatch-dko2.onrender.com/api/stream/watch/aniwaves-82570&eps=1');
    await testEndpoint('3. Hentai (WatchHentai)', 'https://anifoxwatch-dko2.onrender.com/api/stream/watch/watchhentai-shoujo-ramune-episode-1');
    await testEndpoint('4. Hentai (Hanime)', 'https://anifoxwatch-dko2.onrender.com/api/stream/watch/hanime-overflow-episode-1');
    
    console.log('\n✨ Verification completed!');
}

runAllTests();
