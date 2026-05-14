
import { sourceManager } from '../server/src/services/source-manager.js';
import axios from 'axios';
import { PerformanceTimer } from '../server/src/utils/performance.js';
import { logger } from '../server/src/utils/logger.js';

async function testPlayback(streamUrl: string, referer: string): Promise<{ success: boolean; duration: number; error?: string }> {
    const start = Date.now();
    try {
        // 1. Test Manifest
        const proxyUrl = `http://localhost:3001/api/stream/proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(referer)}`;
        console.log(`      - Testing manifest: ${proxyUrl.substring(0, 80)}...`);
        const resp = await axios.get(proxyUrl, { timeout: 10000 });
        
        if (resp.status !== 200) throw new Error(`Manifest returned ${resp.status}`);
        
        const manifest = resp.data;
        if (typeof manifest !== 'string' || !manifest.includes('#EXTM3U')) {
            throw new Error('Invalid HLS manifest received');
        }

        // 2. Test a segment (if it's a master manifest, try to get a sub-manifest first)
        let segmentUrl = '';
        const lines = manifest.split('\n');
        for (const line of lines) {
            if (line.trim() && !line.startsWith('#')) {
                segmentUrl = line.trim();
                break;
            }
        }

        if (segmentUrl) {
            const fullSegmentUrl = segmentUrl.startsWith('http') ? segmentUrl : new URL(segmentUrl, streamUrl).toString();
            const proxiedSegment = `http://localhost:3001/api/stream/proxy?url=${encodeURIComponent(fullSegmentUrl)}&referer=${encodeURIComponent(referer)}`;
            console.log(`      - Testing segment: ${proxiedSegment.substring(0, 80)}...`);
            const segResp = await axios.get(proxiedSegment, { timeout: 10000, responseType: 'arraybuffer' });
            if (segResp.status !== 200) throw new Error(`Segment returned ${segResp.status}`);
            console.log(`      ✅ Playback test passed (${segResp.data.byteLength} bytes)`);
        }

        return { success: true, duration: Date.now() - start };
    } catch (err: any) {
        return { success: false, duration: Date.now() - start, error: err.message };
    }
}

async function runPressureTest() {
    console.log('🚀 Starting Streaming Pressure Test...');
    
    // 1. Get 5 random anime from Trending
    console.log('--- Fetching candidate anime ---');
    const trending = await sourceManager.getTrending(1);
    if (trending.length < 5) {
        console.error('Could not get enough trending anime');
        return;
    }

    const selected = trending.sort(() => 0.5 - Math.random()).slice(0, 5);
    console.log(`Selected: ${selected.map(a => a.title).join(', ')}`);

    const results = [];

    for (const anime of selected) {
        console.log(`\n--- Testing: ${anime.title} (${anime.id}) ---`);
        const animeResult: any = { title: anime.title, id: anime.id, steps: [] };

        try {
            // Step A: Get Episodes
            const epStart = Date.now();
            const episodes = await sourceManager.getEpisodes(anime.id);
            const epDuration = Date.now() - epStart;
            console.log(`   ✅ Fetched ${episodes.length} episodes in ${epDuration}ms`);
            animeResult.steps.push({ name: 'getEpisodes', duration: epDuration, success: true });

            if (episodes.length === 0) throw new Error('No episodes found');

            // Step B: Pick 1 random episode and test stream retrieval (Retesting/Pressure)
            const ep = episodes[0]; // test first ep for consistency
            console.log(`   Testing Episode ${ep.number} (${ep.id})`);
            
            for (let i = 0; i < 2; i++) { // Test twice to check stability/caching
                console.log(`   Attempt ${i + 1} for stream retrieval...`);
                const streamStart = Date.now();
                const streamData = await sourceManager.getStreamingLinks(ep.id, undefined, 'sub', ep.number);
                const streamDuration = Date.now() - streamStart;
                
                if (streamData.sources.length === 0) {
                    console.log(`   ❌ Attempt ${i + 1} failed: No sources found`);
                    animeResult.steps.push({ name: `getStream_at${i+1}`, duration: streamDuration, success: false });
                    continue;
                }

                console.log(`   ✅ Attempt ${i + 1} success: ${streamData.sources.length} sources found in ${streamDuration}ms`);
                animeResult.steps.push({ name: `getStream_at${i+1}`, duration: streamDuration, success: true });

                // Step C: Playback test for the first source
                const firstSource = streamData.sources[0];
                console.log(`   Testing playback for source: ${firstSource.server} (${firstSource.quality})`);
                const referer = streamData.headers?.Referer || streamData.headers?.referer || '';
                
                const playback = await testPlayback(firstSource.url, referer);
                animeResult.steps.push({ name: `playback_at${i+1}`, duration: playback.duration, success: playback.success, error: playback.error });
                
                if (!playback.success) {
                    console.log(`   ❌ Playback failed: ${playback.error}`);
                }
            }

        } catch (err: any) {
            console.log(`   ❌ Major failure: ${err.message}`);
            animeResult.error = err.message;
        }

        results.push(animeResult);
    }

    console.log('\n\n' + '='.repeat(50));
    console.log('📊 FINAL PRESSURE TEST SUMMARY');
    console.log('='.repeat(50));
    
    let totalSuccess = 0;
    let totalSteps = 0;

    results.forEach(r => {
        console.log(`\nAnime: ${r.title}`);
        r.steps.forEach((s: any) => {
            totalSteps++;
            if (s.success) totalSuccess++;
            const status = s.success ? '✅' : '❌';
            console.log(`  ${status} ${s.name.padEnd(15)}: ${s.duration}ms ${s.error ? `(${s.error})` : ''}`);
        });
    });

    console.log('\n' + '='.repeat(50));
    console.log(`OVERALL: ${totalSuccess}/${totalSteps} steps passed (${Math.round(totalSuccess/totalSteps*100)}%)`);
    console.log('='.repeat(50));
}

runPressureTest().catch(console.error);
