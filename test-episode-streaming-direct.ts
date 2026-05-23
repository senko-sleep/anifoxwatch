import { SourceManager } from './server/src/services/source-manager.js';

/**
 * Test to diagnose why streaming fails for episodes other than episode 1
 */

async function testAnimeStreaming(anilistId: number, animeTitle: string) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${animeTitle} (AniList ID: ${anilistId})`);
    console.log('='.repeat(80));

    const manager = new SourceManager();
    
    try {
        // Step 1: Resolve AniList ID to streaming ID
        console.log('\n[1] Resolving AniList ID to streaming ID...');
        const streamId = await manager.resolveAniListToStreamingId(anilistId);
        
        if (!streamId) {
            console.log('❌ Could not resolve AniList ID to streaming ID');
            return;
        }
        
        console.log(`✅ Resolved to: ${streamId}`);

        // Step 2: Get episodes
        console.log('\n[2] Fetching episodes...');
        const episodes = await manager.getEpisodes(streamId);
        console.log(`✅ Found ${episodes.length} episodes`);

        if (episodes.length === 0) {
            console.log('❌ No episodes found');
            return;
        }

        // Step 3: Test streaming for different episodes
        const testEpisodes = [
            episodes[0],
            episodes[Math.min(3, episodes.length - 1)],
            episodes[episodes.length - 1],
        ];

        console.log('\n[3] Testing streaming links for selected episodes...');
        for (const ep of testEpisodes) {
            console.log(`\n   Episode ${ep.number}:`);
            console.log(`      ID: ${ep.id}`);
            console.log(`      Title: ${ep.title || 'N/A'}`);
            console.log(`      Has Dub: ${ep.hasDub || 'false'}`);

            // Test SUB
            try {
                const subResult = await manager.getStreamingLinks(ep.id, undefined, 'sub');
                if (subResult?.sources?.length) {
                    console.log(`      ✅ SUB: ${subResult.sources.length} source(s) - ${subResult.source || 'unknown'}`);
                } else {
                    console.log(`      ❌ SUB: No sources found`);
                }
            } catch (error: any) {
                console.log(`      ❌ SUB: Error - ${error.message}`);
            }

            // Test DUB
            try {
                const dubResult = await manager.getStreamingLinks(ep.id, undefined, 'dub');
                if (dubResult?.sources?.length) {
                    console.log(`      ✅ DUB: ${dubResult.sources.length} source(s) - ${dubResult.source || 'unknown'}`);
                } else {
                    console.log(`      ⚠️  DUB: No sources found`);
                }
            } catch (error: any) {
                console.log(`      ⚠️  DUB: Error - ${error.message}`);
            }
        }
    } catch (error: any) {
        console.error(`\n❌ Test error: ${error.message}`);
        console.error(error.stack);
    }
}

async function main() {
    console.log('🎬 Episode Streaming Diagnosis');
    console.log('Tests the SourceManager directly to diagnose episode streaming issues\n');

    // Test the problematic anime IDs from the user report
    await testAnimeStreaming(189046, 'Anime 189046 (Works on ep=1, fails on ep=4)');
    await testAnimeStreaming(182205, 'Anime 182205 (Doesn\'t work)');

    console.log(`\n${'='.repeat(80)}`);
    console.log('Diagnosis complete!');
    console.log('='.repeat(80));
}

main().catch(console.error);
