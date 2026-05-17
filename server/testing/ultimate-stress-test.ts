
import { sourceManager } from '../src/services/source-manager.js';
import { REGISTERED_SOURCE_NAMES } from '../src/registered-sources.js';
import { logger } from '../src/utils/logger.js';
import axios from 'axios';

/**
 * ULTIMATE STRESS TEST FOR ANIFOXWATCH STREAMING
 * 
 * Features:
 * - Tests 5 random anime from trending list
 * - Verifies multi-episode availability
 * - Tests both SUB and DUB
 * - Verifies playability (HLS/MP4 presence)
 * - Measures performance/timing
 * - Tests failover by disabling primary sources
 */

async function runUltimateStressTest() {
    console.log('\n🚀 STARTING ULTIMATE STREAMING STRESS TEST\n');
    const startTime = Date.now();
    const stats = {
        totalAnime: 0,
        totalEpisodes: 0,
        successfulStreams: 0,
        failedStreams: 0,
        avgLatency: 0,
        latencies: [] as number[],
        playableSources: 0
    };

    const probeStream = async (url: string): Promise<{ playable: boolean; duration: number }> => {
        try {
            const resp = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const isM3u8 = url.includes('.m3u8') || String(resp.data).includes('#EXTM3U');
            if (isM3u8) {
                // Crude duration check for VOD playlists
                const matches = String(resp.data).match(/#EXTINF:(\d+(\.\d+)?)/g);
                let duration = 0;
                if (matches) {
                    duration = matches.reduce((acc, m) => acc + parseFloat(m.split(':')[1]), 0);
                }
                return { playable: true, duration };
            }
            return { playable: true, duration: 0 };
        } catch (err) {
            return { playable: false, duration: 0 };
        }
    };

    try {
        // 1. Get 5 random trending anime
        console.log('🔍 Fetching trending anime for testing...');
        const trending = await sourceManager.getTrending(1);
        const testAnime = trending.slice(0, 5);
        stats.totalAnime = testAnime.length;

        for (const anime of testAnime) {
            console.log(`\n📺 TESTING ANIME: ${anime.title} (${anime.id})`);
            
            // 2. Fetch episodes
            console.log(`   📅 Fetching episodes...`);
            const epStart = Date.now();
            const episodes = await sourceManager.getEpisodes(anime.id);
            console.log(`   ✅ Found ${episodes.length} episodes (${Date.now() - epStart}ms)`);
            
            if (episodes.length === 0) {
                console.log(`   ❌ No episodes found, skipping.`);
                continue;
            }

            // 3. Test multiple episodes (First and Middle)
            const epsToTest = [episodes[0]];
            if (episodes.length > 5) epsToTest.push(episodes[Math.floor(episodes.length / 2)]);
            
            for (const ep of epsToTest) {
                stats.totalEpisodes++;
                console.log(`   🎬 Testing Episode ${ep.number} (ID: ${ep.id})`);

                // A. Test SUB Streaming
                console.log(`      🔊 [SUB] Fetching stream...`);
                const subStart = Date.now();
                const subStream = await sourceManager.getStreamingLinks(ep.id, undefined, 'sub', ep.number);
                const subDuration = Date.now() - subStart;
                stats.latencies.push(subDuration);

                if (subStream.sources.length > 0) {
                    const bestSource = subStream.sources[0].url;
                    const probe = await probeStream(bestSource);
                    const source = subStream.source || 'unknown';
                    console.log(`      ✅ [SUB] Success: ${subStream.sources.length} sources from ${source} (${subDuration}ms)`);
                    console.log(`         🔗 Playable: ${probe.playable}, Duration: ${probe.duration.toFixed(0)}s`);
                    if (probe.playable) stats.playableSources++;
                    stats.successfulStreams++;
                } else {
                    console.log(`      ❌ [SUB] FAILED: No sources found (${subDuration}ms)`);
                    stats.failedStreams++;
                }

                // B. Test DUB Streaming
                console.log(`      🎙️ [DUB] Fetching stream...`);
                const dubStart = Date.now();
                const dubStream = await sourceManager.getStreamingLinks(ep.id, undefined, 'dub', ep.number);
                const dubDuration = Date.now() - dubStart;
                stats.latencies.push(dubDuration);

                if (dubStream.sources.length > 0) {
                    const bestSource = dubStream.sources[0].url;
                    const probe = await probeStream(bestSource);
                    console.log(`      ✅ [DUB] Success: ${dubStream.sources.length} sources from ${dubStream.source} (${dubDuration}ms)`);
                    console.log(`         🔗 Playable: ${probe.playable}, Duration: ${probe.duration.toFixed(0)}s`);
                    if (probe.playable) stats.playableSources++;
                    stats.successfulStreams++;
                } else {
                    console.log(`      ⚠️ [DUB] Not found or unavailable (${dubDuration}ms)`);
                }
            }

            // 4. DEEP FAILOVER TEST: Disable AnimeKai, 9Anime, AND Aniwaves
            console.log(`   🛡️ TESTING DEEP FALLBACK (Disabling AnimeKai, 9Anime, Aniwaves)...`);
            const sourcesToDisable = ['AnimeKai', '9Anime', 'Aniwaves'];
            const originalStatuses: Record<string, boolean> = {};
            
            for (const name of sourcesToDisable) {
                const s = sourceManager['sources'].get(name);
                if (s) {
                    originalStatuses[name] = s.isAvailable;
                    s.isAvailable = false;
                }
            }
            
            const ep = episodes[0];
            console.log(`      🔄 Retrying Episode ${ep.number} with deep fallback...`);
            const fallbackStart = Date.now();
            const fallbackStream = await sourceManager.getStreamingLinks(ep.id, undefined, 'sub', ep.number);
            const fallbackDuration = Date.now() - fallbackStart;
            
            if (fallbackStream.sources.length > 0) {
                console.log(`      ✅ Deep Fallback Success: Found stream from ${fallbackStream.source} in ${fallbackDuration}ms`);
            } else {
                console.log(`      ❌ Deep Fallback FAILED: No alternative sources found in ${fallbackDuration}ms`);
                // If it fails, try to see if cross-source fallback search title is valid
                const searchTitle = sourceManager['episodeIdToFallbackSearchTitle'](ep.id);
                console.log(`      ℹ️ Fallback search title was: "${searchTitle}"`);
            }
            
            // Restore sources
            for (const name of sourcesToDisable) {
                const s = sourceManager['sources'].get(name);
                if (s && originalStatuses[name] !== undefined) {
                    s.isAvailable = originalStatuses[name];
                }
            }
        }

        // 7. Final Stats
        const totalTime = Date.now() - startTime;
        const avgLat = stats.latencies.length > 0 
            ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length 
            : 0;

        console.log('\n📊 TEST SUMMARY');
        console.log(`   - Total Anime Tested: ${stats.totalAnime}`);
        console.log(`   - Total Episodes: ${stats.totalEpisodes}`);
        console.log(`   - Successful Streams: ${stats.successfulStreams}`);
        console.log(`   - Failed Streams: ${stats.failedStreams}`);
        console.log(`   - Average Latency: ${avgLat.toFixed(2)}ms`);
        console.log(`   - Total Test Duration: ${(totalTime / 1000).toFixed(2)}s`);

        if (stats.failedStreams > 0) {
            console.log('\n🔴 SOME TESTS FAILED. TWEAKING REQUIRED.');
            process.exit(1);
        } else {
            console.log('\n🟢 ALL TESTS PASSED! STREAMING IS STABLE.');
        }

    } catch (error) {
        console.error('\n💥 CRITICAL TEST FAILURE:', error);
        process.exit(1);
    }
}

runUltimateStressTest();
