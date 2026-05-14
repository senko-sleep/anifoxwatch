
import { sourceManager } from '../server/src/services/source-manager.js';
import axios from 'axios';

async function testEpisode(animeTitle: string, ep: any, attempt: number = 1): Promise<{ success: boolean; duration: number; error?: string }> {
    const start = Date.now();
    console.log(`      [EP ${ep.number}] Testing Episode ${ep.number} (Attempt ${attempt})...`);
    
    try {
        // 1. Get Stream
        const streamData = await sourceManager.getStreamingLinks(ep.id, undefined, 'sub', ep.number);
        if (!streamData.sources.length) throw new Error('No sources found');
        
        const source = streamData.sources[0];
        const referer = streamData.headers?.Referer || streamData.headers?.referer || '';
        
        // 2. Proxy Manifest Test
        const proxyUrl = `http://localhost:3002/api/stream/proxy?url=${encodeURIComponent(source.url)}&referer=${encodeURIComponent(referer)}`;
        const resp = await axios.get(proxyUrl, { timeout: 15000 });
        
        if (resp.status !== 200) throw new Error(`Proxy manifest failed with ${resp.status}`);
        
        const manifest = resp.data;
        if (typeof manifest !== 'string' || !manifest.includes('#EXTM3U')) {
            throw new Error('Invalid manifest content');
        }
        
        // Verification of HLS metadata
        const hasTargetDuration = manifest.includes('#EXT-X-TARGETDURATION');
        const hasSegments = manifest.includes('.ts') || manifest.includes('.m4s') || manifest.includes('/proxy?url=');
        
        if (!hasTargetDuration && !manifest.includes('#EXT-X-STREAM-INF')) {
            throw new Error('Manifest missing critical HLS tags');
        }

        // 3. Segment Test
        const lines = manifest.split('\n');
        let segmentUrl = '';
        for (const line of lines) {
            if (line.trim() && !line.startsWith('#')) {
                segmentUrl = line.trim();
                break;
            }
        }
        
        if (segmentUrl) {
            const proxiedSegment = segmentUrl.startsWith('http') ? segmentUrl : new URL(segmentUrl, proxyUrl).toString();
            // Ensure segment URL also points to the new proxy port if it was relative
            const finalSegmentUrl = proxiedSegment.replace(':3001', ':3002');
            const segResp = await axios.get(finalSegmentUrl, { timeout: 15000, responseType: 'arraybuffer' });
            if (segResp.status !== 200) throw new Error(`Segment fetch failed with ${segResp.status}`);
            console.log(`      [EP ${ep.number}] ✅ Pass (${segResp.data.byteLength} bytes)`);
        } else if (manifest.includes('#EXT-X-STREAM-INF')) {
            console.log(`      [EP ${ep.number}] ✅ Master manifest verified`);
        }

        return { success: true, duration: Date.now() - start };
    } catch (err: any) {
        console.log(`      [EP ${ep.number}] ❌ Fail: ${err.message}`);
        return { success: false, duration: Date.now() - start, error: err.message };
    }
}

async function runRigorousTest() {
    console.log('🏁 Starting Rigorous Multi-Episode Pressure Test...');
    
    const trending = await sourceManager.getTrending(1);
    const selected = trending.filter(a => a.episodes > 1).sort(() => 0.5 - Math.random()).slice(0, 3);
    
    console.log(`Selected Anime: ${selected.map(a => `${a.title} (${a.episodes} eps)`).join(', ')}\n`);

    const finalResults: any[] = [];

    for (const anime of selected) {
        console.log(`\n📺 Testing Anime: ${anime.title}`);
        const results = { title: anime.title, episodes: [] as any[] };

        try {
            const episodes = await sourceManager.getEpisodes(anime.id);
            if (episodes.length < 2) {
                console.log('   ⚠️ Not enough episodes to test multi-episode logic, skipping.');
                continue;
            }

            // Test 3 episodes (or max available)
            const epsToTest = episodes.slice(0, 3);
            
            for (const ep of epsToTest) {
                // Test 1: Initial load
                const res1 = await testEpisode(anime.title, ep, 1);
                results.episodes.push({ num: ep.number, ...res1 });

                // Test 2: Retry logic (should be fast due to caching)
                if (res1.success) {
                    const res2 = await testEpisode(anime.title, ep, 2);
                    if (!res2.success) console.log('      ⚠️ Cache/Retry failed!');
                }
            }
        } catch (err: any) {
            console.log(`   ❌ Failed to get episodes: ${err.message}`);
        }
        finalResults.push(results);
    }

    console.log('\n\n' + '='.repeat(60));
    console.log('📊 RIGOROUS TEST SUMMARY');
    console.log('='.repeat(60));

    finalResults.forEach(r => {
        console.log(`\n${r.title}`);
        r.episodes.forEach((e: any) => {
            const status = e.success ? '✅' : '❌';
            console.log(`  ${status} Ep ${e.num} (${e.duration}ms) ${e.error ? `[Error: ${e.error}]` : ''}`);
        });
    });
    
    console.log('\n' + '='.repeat(60));
}

runRigorousTest().catch(console.error);
