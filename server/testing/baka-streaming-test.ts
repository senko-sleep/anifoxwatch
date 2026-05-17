
import { sourceManager } from '../src/services/source-manager.js';
import axios from 'axios';
import { logger } from '../src/utils/logger.js';

/**
 * Streaming Reliability Test for Baka to Test (AniList 6347, Ep 5)
 * Validates both SUB and DUB playback across all available servers.
 */
async function runStreamingTest() {
    const animeId = 'anilist-6347';
    const episodeNum = 5;
    const anilistId = 6347;

    console.log(`\n================================================================`);
    console.log(`🧪 STREAMING RELIABILITY TEST: Baka to Test Episode ${episodeNum}`);
    console.log(`================================================================\n`);

    const categories = ['sub', 'dub'] as const;

    for (const category of categories) {
        console.log(`\n📂 TESTING CATEGORY: ${category.toUpperCase()}`);
        console.log(`----------------------------------------------------------------`);

        try {
            // 1. Get available servers for the episode
            console.log(`🔍 Fetching available servers...`);
            const servers = await sourceManager.getEpisodeServers(animeId);
            console.log(`✅ Found ${servers.length} servers: ${servers.map(s => s.name).join(', ')}`);

            // 2. Test each server (and auto-selection)
            const testTargets = [
                { name: 'Auto (SourceManager Race)', server: undefined },
                ...servers.map(s => ({ name: s.name, server: s.name }))
            ];

            for (const target of testTargets) {
                console.log(`\n🚀 Testing Target: ${target.name}`);
                const start = Date.now();
                
                try {
                    const links = await sourceManager.getStreamingLinks(
                        animeId, 
                        target.server, 
                        category, 
                        episodeNum, 
                        anilistId
                    );

                    const duration = Date.now() - start;

                    if (links.sources && links.sources.length > 0) {
                        console.log(`   ✅ SUCCESS: Resolved in ${duration}ms from ${links.source || 'unknown'}`);
                        
                        // Probe the first source
                        const source = links.sources[0];
                        console.log(`   🔗 Probing: [${source.quality}] ${source.url.substring(0, 70)}...`);
                        
                        try {
                            const probeStart = Date.now();
                            const response = await axios.get(source.originalUrl || source.url, {
                                headers: { 
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                    'Referer': links.headers?.Referer || 'https://gogoanime.run/'
                                },
                                timeout: 15000,
                                validateStatus: () => true
                            });
                            
                            const probeDuration = Date.now() - probeStart;
                            if (response.status >= 200 && response.status < 400) {
                                console.log(`      🟢 PROBE OK: HTTP ${response.status} (${probeDuration}ms)`);
                            } else {
                                console.log(`      🔴 PROBE FAILED: HTTP ${response.status} (${probeDuration}ms)`);
                            }
                        } catch (probeErr) {
                            console.log(`      🔴 PROBE ERROR: ${probeErr instanceof Error ? probeErr.message : probeErr}`);
                        }
                    } else {
                        console.log(`   ❌ FAILED: No sources found (took ${duration}ms)`);
                    }
                } catch (err) {
                    console.log(`   ❌ ERROR: ${err instanceof Error ? err.message : err}`);
                }
            }
        } catch (err) {
            console.error(`❌ CRITICAL ERROR testing ${category}:`, err);
        }
    }

    console.log(`\n================================================================`);
    console.log(`🏁 TEST SUITE COMPLETE`);
    console.log(`================================================================\n`);
    process.exit(0);
}

runStreamingTest().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
