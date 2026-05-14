
import { sourceManager } from '../server/src/services/source-manager.js';
import axios from 'axios';
import { performance } from 'perf_hooks';

const PROXY_PORT = 3002;
const PROXY_BASE = `http://localhost:${PROXY_PORT}/api/stream/proxy`;

async function testPlayback(url: string, referer: string): Promise<{ success: boolean; duration?: number; error?: string; speed?: number }> {
    const start = performance.now();
    try {
        const proxyUrl = `${PROXY_BASE}?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
        const mResp = await axios.get(proxyUrl, { timeout: 15000 });
        const end = performance.now();
        
        if (mResp.status !== 200) throw new Error(`Proxy error ${mResp.status}`);
        
        const manifest = mResp.data;
        if (!manifest.includes('#EXTM3U')) throw new Error('Invalid HLS Manifest');

        // Estimate duration based on segments (assuming 10s per segment)
        const segmentCount = (manifest.match(/#EXTINF/g) || []).length;
        const duration = segmentCount * 10;

        return { success: true, duration, speed: end - start };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

async function runFallbackResilienceTest() {
    console.log(`\n🛡️ STARTING FALLBACK RESILIENCE TEST (Source: AnimeKai EXCLUDED)`);
    console.log(`================================================================================`);

    const testTitles = [
        { title: 'Solo Leveling', expectedEpisodes: 12 },
        { title: 'Attack on Titan Season 4 Part 3', expectedEpisodes: 1 },
        { title: 'Jujutsu Kaisen Season 2', expectedEpisodes: 23 },
        { title: 'Chainsaw Man', expectedEpisodes: 12 },
        { title: 'Demon Slayer: Kimetsu no Yaiba', expectedEpisodes: 26 }
    ];

    const results: any[] = [];
    const FALLBACK_SOURCES = ['Gogoanime', 'Aniwaves', 'AllAnime', 'AnimeHeaven'];

    for (const item of testTitles) {
        console.log(`\n[ANIME] Testing: ${item.title}`);
        let found = false;
        let retryCount = 0;
        const MAX_RETRIES = 2; // Anti-spam / Loop prevention

        for (const src of FALLBACK_SOURCES) {
            if (found) break;
            console.log(`   🔍 Searching on ${src} (Retry: ${retryCount})...`);

            try {
                // Correct signature: search(query, page, sourceName, options)
                const searchResponse = await sourceManager.search(item.title, 1, src);
                const searchResults = searchResponse.results || [];
                
                if (searchResults.length === 0) {
                    console.log(`   ⚠️ No results from ${src}`);
                    continue;
                }

                const bestMatch = searchResults[0];
                console.log(`   ✅ Found match on ${src}: ${bestMatch.title} (${bestMatch.id})`);

                // Prevent infinite loop if the ID is malformed
                if (!bestMatch.id) throw new Error('Malformed search result ID');

                // Get Episodes
                const episodes = await sourceManager.getEpisodes(bestMatch.id);
                if (episodes.length === 0) throw new Error(`No episodes found for ${bestMatch.id}`);

                console.log(`   ✅ Fetched ${episodes.length} episodes.`);
                const targetEp = episodes[0];

                // Get Streaming Links
                const sStart = performance.now();
                const streamData = await sourceManager.getStreamingLinks(targetEp.id);
                const sTime = performance.now() - sStart;

                if (!streamData.sources || streamData.sources.length === 0) {
                    throw new Error(`No streaming links from ${src}`);
                }

                console.log(`   ✅ Stream retrieved in ${sTime.toFixed(0)}ms`);

                // Playback Check
                const referer = streamData.headers?.Referer || streamData.headers?.referer || 'https://gogoanime.run/';
                const play = await testPlayback(streamData.sources[0].url, referer);

                if (play.success) {
                    console.log(`   ✅ Playback Verified! Duration: ~${play.duration}s, Load Time: ${play.speed?.toFixed(0)}ms`);
                    results.push({ 
                        title: item.title, 
                        source: src, 
                        success: true, 
                        duration: play.duration, 
                        speed: (play.speed || 0) + sTime 
                    });
                    found = true;
                } else {
                    console.log(`   ❌ Playback failed on ${src}: ${play.error}`);
                }

            } catch (err: any) {
                console.log(`   ❌ Error on ${src}: ${err.message}`);
                retryCount++;
                if (retryCount >= MAX_RETRIES) {
                    console.log(`   🚫 Max retries reached for ${item.title}, moving to next title.`);
                    break;
                }
            }
        }

        if (!found) {
            results.push({ title: item.title, success: false, error: 'All fallback sources failed' });
        }
    }

    // FINAL REPORT
    console.log(`\n\n================================================================================`);
    console.log(`📊 FALLBACK RESILIENCE REPORT (AnimeKai Filtered)`);
    console.log(`================================================================================`);

    results.forEach(r => {
        const icon = r.success ? '✅' : '❌';
        if (r.success) {
            console.log(`${icon} ${r.title.padEnd(35)} | Source: ${r.source.padEnd(12)} | Speed: ${r.speed.toFixed(0)}ms | Duration: ${r.duration}s`);
        } else {
            console.log(`${icon} ${r.title.padEnd(35)} | FAILED: ${r.error}`);
        }
    });

    const passCount = results.filter(r => r.success).length;
    console.log(`\nRESILIENCE SCORE: ${passCount}/5 PASSED (${(passCount/5*100).toFixed(1)}%)`);
    console.log(`================================================================================\n`);
}

runFallbackResilienceTest().catch(console.error);
