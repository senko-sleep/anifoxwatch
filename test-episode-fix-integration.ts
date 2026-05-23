import { SourceManager } from './server/src/services/source-manager.js';

/**
 * Integration test to verify the episode streaming fix
 * Tests that episodes 1, 4, and the last episode all work correctly
 */

async function testEpisodeStreamingFix() {
    console.log('🎬 Episode Streaming Fix - Integration Test');
    console.log('='.repeat(80));

    const manager = new SourceManager();
    const testCases = [
        { anilistId: 189046, title: 'Anime 189046 - Re:ZERO Season 4', episodes: [1, 4] },
        { anilistId: 182205, title: 'Anime 182205', episodes: [1] },
    ];

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Testing: ${testCase.title}`);
        console.log('='.repeat(80));

        try {
            // Resolve AniList ID to streaming ID
            const streamId = await manager.resolveAniListToStreamingId(testCase.anilistId);
            if (!streamId) {
                console.log('❌ FAILED: Could not resolve AniList ID');
                failed++;
                continue;
            }

            console.log(`✅ Resolved to: ${streamId}`);

            // Fetch episodes
            const episodes = await manager.getEpisodes(streamId);
            if (!episodes || episodes.length === 0) {
                console.log('❌ FAILED: No episodes found');
                failed++;
                continue;
            }

            console.log(`✅ Found ${episodes.length} episodes`);

            // Test each episode in the test case
            for (const epNum of testCase.episodes) {
                const ep = episodes.find(e => e.number === epNum);
                if (!ep) {
                    console.log(`⚠️  Episode ${epNum} not found`);
                    continue;
                }

                console.log(`\n   Testing Episode ${epNum}:`);
                console.log(`   ID: ${ep.id}`);

                let episodePassed = true;

                // Test SUB
                try {
                    const subResult = await manager.getStreamingLinks(ep.id, undefined, 'sub');
                    if (subResult?.sources?.length) {
                        console.log(`   ✅ SUB: ${subResult.sources.length} source(s)`);
                        passed++;
                    } else {
                        console.log(`   ❌ SUB: No sources found`);
                        failed++;
                        episodePassed = false;
                    }
                } catch (error: any) {
                    console.log(`   ❌ SUB: Error - ${error.message}`);
                    failed++;
                    episodePassed = false;
                }

                // Test DUB
                try {
                    const dubResult = await manager.getStreamingLinks(ep.id, undefined, 'dub');
                    if (dubResult?.sources?.length) {
                        console.log(`   ✅ DUB: ${dubResult.sources.length} source(s)`);
                        passed++;
                    } else {
                        console.log(`   ⚠️  DUB: No sources found`);
                    }
                } catch (error: any) {
                    console.log(`   ⚠️  DUB: Error - ${error.message}`);
                }
            }
        } catch (error: any) {
            console.error(`❌ FAILED: ${error.message}`);
            failed++;
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(80));

    if (failed === 0) {
        console.log('✅ All tests passed! The fix appears to be working.');
    } else {
        console.log(`⚠️  ${failed} test(s) failed.`);
    }
}

testEpisodeStreamingFix().catch(console.error);
