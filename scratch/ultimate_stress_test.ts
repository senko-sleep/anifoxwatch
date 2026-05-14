
import { sourceManager } from '../server/src/services/source-manager.js';
import axios from 'axios';
import { performance } from 'perf_hooks';

const PROXY_PORT = 3002;
const PROXY_BASE = `http://localhost:${PROXY_PORT}/api/stream/proxy`;

async function testPlayback(epId: string, epNum: number, referer: string): Promise<{ success: boolean; manifestTime: number; segmentTime: number; error?: string }> {
    const start = performance.now();
    try {
        // 1. Manifest
        const mStart = performance.now();
        const proxyUrl = `${PROXY_BASE}?url=${encodeURIComponent(epId)}&referer=${encodeURIComponent(referer)}`;
        const mResp = await axios.get(proxyUrl, { timeout: 15000 });
        const mEnd = performance.now();
        
        if (mResp.status !== 200) throw new Error(`Manifest 502/404 (${mResp.status})`);
        
        const manifest = mResp.data;
        if (!manifest.includes('#EXTM3U')) throw new Error('Invalid HLS Manifest');

        // 2. Segment
        const lines = manifest.split('\n');
        let segmentUrl = lines.find(l => l.trim() && !l.startsWith('#'))?.trim();
        
        if (!segmentUrl && manifest.includes('#EXT-X-STREAM-INF')) {
            // Master manifest - try to get a sub-manifest
            const subMatch = manifest.match(/#EXT-X-STREAM-INF.*\n(.*)/);
            if (subMatch) {
                const subUrl = subMatch[1].trim();
                const absoluteSub = subUrl.startsWith('http') ? subUrl : new URL(subUrl, proxyUrl).toString();
                const subResp = await axios.get(absoluteSub, { timeout: 10000 });
                const subLines = subResp.data.split('\n');
                segmentUrl = subLines.find((l: string) => l.trim() && !l.startsWith('#'))?.trim();
            }
        }

        let sTime = 0;
        if (segmentUrl) {
            const absoluteSeg = segmentUrl.startsWith('http') ? segmentUrl : new URL(segmentUrl, proxyUrl).toString();
            // Ensure segment also uses the correct proxy port
            const finalSegUrl = absoluteSeg.replace(':3001', `:${PROXY_PORT}`);
            
            const sStart = performance.now();
            const sResp = await axios.get(finalSegUrl, { timeout: 15000, responseType: 'arraybuffer' });
            sTime = performance.now() - sStart;
            
            if (sResp.status !== 200) throw new Error(`Segment Fail (${sResp.status})`);
        }

        return { success: true, manifestTime: mEnd - mStart, segmentTime: sTime };
    } catch (err: any) {
        return { success: false, manifestTime: 0, segmentTime: 0, error: err.message };
    }
}

async function runUltimateStressTest() {
    console.log(`\n🚀 STARTING ULTIMATE STREAMING STRESS TEST (Target: Fastify Proxy Port ${PROXY_PORT})`);
    console.log(`================================================================================`);

    // 1. Fetch 5 random anime
    const trending = await sourceManager.getTrending(1);
    const pool = trending.filter(a => a.episodes > 5);
    const selected = pool.sort(() => 0.5 - Math.random()).slice(0, 5);

    console.log(`Selected for Stress Test: \n${selected.map((a, i) => `${i+1}. ${a.title} (${a.episodes} episodes)`).join('\n')}\n`);

    const summary: any[] = [];

    for (const anime of selected) {
        console.log(`\n[ANIME] Testing: ${anime.title}`);
        const animeResult = { title: anime.title, steps: [] as any[] };

        // STEP 1: Episode Fetching
        const epStart = performance.now();
        let episodes;
        try {
            episodes = await sourceManager.getEpisodes(anime.id);
            const epTime = performance.now() - epStart;
            console.log(`   ✅ getEpisodes: ${episodes.length} eps in ${epTime.toFixed(0)}ms`);
            animeResult.steps.push({ name: 'Fetch Episodes', time: epTime, success: true });
        } catch (err: any) {
            console.log(`   ❌ getEpisodes Failed: ${err.message}`);
            animeResult.steps.push({ name: 'Fetch Episodes', success: false, error: err.message });
            summary.push(animeResult);
            continue;
        }

        // STEP 2: Multi-Episode Verification (First, Middle, Last)
        if (!episodes || episodes.length === 0) {
            console.log('   ⚠️ No episodes available to test.');
            animeResult.steps.push({ name: 'EP Test', success: false, error: 'No episodes found' });
            summary.push(animeResult);
            continue;
        }

        const indices = [0, Math.floor(episodes.length / 2), episodes.length - 1];
        const uniqueIndices = Array.from(new Set(indices));

        for (const idx of uniqueIndices) {
            const ep = episodes[idx];
            console.log(`   [EP ${ep.number}] Testing...`);

            // Initial Retrieval
            const sStart = performance.now();
            const streamData = await sourceManager.getStreamingLinks(ep.id, undefined, 'sub', ep.number);
            const sTime = performance.now() - sStart;

            if (!streamData.sources.length) {
                console.log(`      ❌ getStream: No sources found (${sTime.toFixed(0)}ms)`);
                animeResult.steps.push({ name: `EP ${ep.number} GetStream`, success: false });
                continue;
            }
            console.log(`      ✅ getStream: ${streamData.sources.length} sources in ${sTime.toFixed(0)}ms`);

            // Playback Verification (With 2 retries to simulate player/rotation behavior)
            const referer = streamData.headers?.Referer || 'https://megaup.nl/';
            const sourceUrl = streamData.sources[0].url;

            let playResult: any = { success: false, error: 'Never started' };
            for (let attempt = 1; attempt <= 3; attempt++) {
                playResult = await testPlayback(sourceUrl, ep.number, referer);
                if (playResult.success) break;
                if (attempt < 3) console.log(`      ⚠️ Playback attempt ${attempt} failed, retrying...`);
            }

            if (playResult.success) {
                console.log(`      ✅ Playback: Manifest=${playResult.manifestTime.toFixed(0)}ms, Segment=${playResult.segmentTime.toFixed(0)}ms`);
                
                // RETRY TEST (Should be cached and fast)
                const playCached = await testPlayback(sourceUrl, ep.number, referer);
                console.log(`      ✅ Retry: ${playCached.manifestTime.toFixed(0)}ms (Cached)`);
                
                animeResult.steps.push({ name: `EP ${ep.number} Playback`, success: true, time: playResult.manifestTime + playResult.segmentTime });
            } else {
                console.log(`      ❌ Playback Failed: ${playResult.error}`);
                animeResult.steps.push({ name: `EP ${ep.number} Playback`, success: false, error: playResult.error });
            }
        }
        summary.push(animeResult);
    }

    // FINAL REPORT
    console.log(`\n\n================================================================================`);
    console.log(`📊 FINAL STRESS TEST SUMMARY REPORT`);
    console.log(`================================================================================`);

    summary.forEach(r => {
        console.log(`\n${r.title}`);
        r.steps.forEach((s: any) => {
            const icon = s.success ? '✅' : '❌';
            const time = s.time ? `(${s.time.toFixed(0)}ms)` : '';
            console.log(`   ${icon} ${s.name} ${time} ${s.error ? `[${s.error}]` : ''}`);
        });
    });

    const totalSteps = summary.reduce((acc, r) => acc + r.steps.length, 0);
    const passedSteps = summary.reduce((acc, r) => acc + r.steps.filter((s: any) => s.success).length, 0);
    const rate = (passedSteps / totalSteps) * 100;

    console.log(`\nOVERALL SCORE: ${passedSteps}/${totalSteps} STEPS PASSED (${rate.toFixed(1)}%)`);
    console.log(`================================================================================\n`);
}

runUltimateStressTest().catch(console.error);
