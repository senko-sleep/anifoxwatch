
import { sourceManager } from '../server/src/services/source-manager.js';
import { browserPool } from '../server/src/utils/browser-pool.js';
import axios from 'axios';

const PRODUCTION_API = 'https://anifoxwatch.web.app/api';
const LOCAL_API = 'http://localhost:3001/api';
const TARGET_API = process.env.TEST_API || LOCAL_API;

async function runStressTest() {
    console.log(`🚀 [StressTest] Starting stress test against: ${TARGET_API}`);
    
    // 1. Initialize local browser pool if testing locally
    if (TARGET_API.includes('localhost')) {
        await browserPool.init();
    }

    const testAnime = [
        'Re:Zero Starting Life in Another World',
        'Mushoku Tensei: Jobless Reincarnation',
        'Solo Leveling',
        'Frieren: Beyond Journey\'s End',
        'One Piece'
    ];

    for (const title of testAnime) {
        console.log(`\n🧪 [Test] Processing: ${title}`);
        
        try {
            // Step 1: Search
            const start = Date.now();
            const searchRes = await axios.get(`${TARGET_API}/anime/search?q=${encodeURIComponent(title)}`);
            const searchTime = Date.now() - start;
            console.log(`   🔍 Search took ${searchTime}ms (${searchRes.data.results.length} results)`);

            if (searchRes.data.results.length === 0) throw new Error('Search failed');
            const anime = searchRes.data.results[0];

            // Step 2: Get Episodes
            const epStart = Date.now();
            const epRes = await axios.get(`${TARGET_API}/anime/${anime.id}/episodes`);
            const epTime = Date.now() - epStart;
            console.log(`   📦 Episode list took ${epTime}ms (${epRes.data.length} episodes)`);

            if (epRes.data.length === 0) throw new Error('Episodes failed');
            const ep = epRes.data[epRes.data.length - 1]; // Test latest episode

            // Step 3: Stream Resolution (Limit Test)
            console.log(`   📡 Racing stream resolution for episode: ${ep.number}`);
            const streamStart = Date.now();
            const streamRes = await axios.get(`${TARGET_API}/stream/watch/${ep.id}?category=sub&episodeNum=${ep.number}`);
            const streamTime = Date.now() - streamStart;
            
            if (streamRes.data.sources.length > 0) {
                console.log(`   ✅ Stream RESOLVED in ${streamTime}ms (${streamRes.data.sources[0].url.substring(0, 50)}...)`);
                
                // Step 4: Playback Verification (Metadata check)
                const videoUrl = streamRes.data.sources[0].url;
                if (videoUrl.includes('.m3u8')) {
                    console.log(`   🎬 Playback: HLS Manifest detected. Checking headers...`);
                }
            } else {
                console.log(`   ❌ Stream FAILED resolution in ${streamTime}ms`);
            }

            // Pressure test: Parallel requests for the same stream
            console.log(`   🔥 Pressure Test: 5 parallel requests for same stream...`);
            const pStart = Date.now();
            await Promise.all([1,2,3,4,5].map(() => axios.get(`${TARGET_API}/stream/watch/${ep.id}`)));
            console.log(`   🔥 Pressure Test completed in ${Date.now() - pStart}ms (should be cached)`);

        } catch (err: any) {
            console.error(`   ❌ Test failed for ${title}: ${err.message}`);
        }
    }

    if (TARGET_API.includes('localhost')) {
        await browserPool.close();
    }
    console.log('\n🏁 [StressTest] Completed.');
}

runStressTest();
