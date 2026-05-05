/**
 * Debug test for anilist-189046 dub streaming
 * Run with: npx tsx test-dub-debug.ts
 */

import { sourceManager } from './server/src/services/source-manager.js';
import { anilistService } from './server/src/services/anilist-service.js';

const ANILIST_ID = 189046;
const EPISODE_NUM = 1;

async function debugDubStream() {
    console.log(`\n🔍 Debugging dub stream for anilist-${ANILIST_ID}`);
    console.log('=' .repeat(60));

    // Step 1: Get anime info from AniList
    console.log(`\n📺 Step 1: Fetching AniList info for ID ${ANILIST_ID}...`);
    let animeInfo;
    try {
        animeInfo = await anilistService.getAnime(ANILIST_ID);
        console.log(`   Title: ${animeInfo?.title}`);
        console.log(`   Romaji: ${animeInfo?.titleRomaji}`);
        console.log(`   English: ${animeInfo?.titleEnglish}`);
        console.log(`   Episodes: ${animeInfo?.episodes}`);
    } catch (e) {
        console.log(`   ❌ Error: ${(e as Error).message}`);
    }

    // Step 2: Try to resolve AniList ID to streaming source
    console.log(`\n🔗 Step 2: Resolving AniList ID to streaming source...`);
    try {
        // This simulates what the API does - search by title
        const searchTitle = animeInfo?.titleRomaji || animeInfo?.titleEnglish || animeInfo?.title;
        console.log(`   Searching for: "${searchTitle}"`);

        if (searchTitle) {
            // Try searching with "dub" suffix
            const dubSearch = `${searchTitle} dub`;
            console.log(`\n   🔍 Searching sources for "${dubSearch}"...`);

            // Test each source
            const sources = ['Gogoanime', 'AnimeFLV', 'AllAnime', 'AnimeKai', 'AnimePahe'];
            for (const sourceName of sources) {
                try {
                    const src = (sourceManager as any).sources.get(sourceName);
                    if (!src?.isAvailable) {
                        console.log(`   ⚠️ ${sourceName}: Not available`);
                        continue;
                    }

                    // Search for dub
                    const dubResult = await Promise.race([
                        src.search(dubSearch, 1),
                        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 10000))
                    ]).catch(() => null);

                    if (dubResult && (dubResult as any).results?.length > 0) {
                        const results = (dubResult as any).results;
                        console.log(`   ✅ ${sourceName}: Found ${results.length} results`);
                        console.log(`      First: "${results[0].title}" (${results[0].id})`);

                        // Try to get episodes
                        const episodes = await Promise.race([
                            src.getEpisodes(results[0].id),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 10000))
                        ]).catch(() => []);

                        if (episodes && (episodes as any).length > 0) {
                            console.log(`      Episodes: ${(episodes as any).length}`);

                            // Find target episode
                            const targetEp = (episodes as any).find((e: any) => e.number === EPISODE_NUM);
                            if (targetEp) {
                                console.log(`      Target ep ${EPISODE_NUM}: ${targetEp.id}`);
                                console.log(`      hasDub: ${targetEp.hasDub}`);

                                // Try to get streaming links for dub
                                console.log(`      🔴 Attempting DUB stream...`);
                                const dubStream = await Promise.race([
                                    src.getStreamingLinks(targetEp.id, undefined, 'dub'),
                                    new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 15000))
                                ]).catch((e) => {
                                    console.log(`      ❌ Stream error: ${(e as Error).message}`);
                                    return null;
                                });

                                if (dubStream && (dubStream as any).sources?.length > 0) {
                                    console.log(`      ✅ DUB STREAM FOUND!`);
                                    console.log(`         Sources: ${(dubStream as any).sources.length}`);
                                    console.log(`         Quality: ${(dubStream as any).sources.map((s: any) => s.quality).join(', ')}`);
                                    console.log(`         First URL: ${(dubStream as any).sources[0].url?.substring(0, 80)}...`);
                                } else {
                                    console.log(`      ❌ No dub stream sources`);
                                }
                            } else {
                                console.log(`      ❌ Episode ${EPISODE_NUM} not found`);
                            }
                        } else {
                            console.log(`      ❌ No episodes found`);
                        }
                    } else {
                        console.log(`   ❌ ${sourceName}: No dub results`);
                    }
                } catch (e) {
                    console.log(`   ❌ ${sourceName}: ${(e as Error).message}`);
                }
            }
        }
    } catch (e) {
        console.log(`   ❌ Error: ${(e as Error).message}`);
    }

    // Step 3: Test cross-source fallback directly
    console.log(`\n🔄 Step 3: Testing cross-source fallback with dub...`);
    try {
        const title = animeInfo?.titleRomaji || animeInfo?.titleEnglish || 'Unknown';
        const result = await (sourceManager as any).crossSourceStreamingFallback(
            `anilist-${ANILIST_ID}`,
            undefined,
            'dub',
            EPISODE_NUM,
            ANILIST_ID
        );

        if (result?.sources?.length) {
            console.log(`   ✅ Cross-source fallback found DUB!`);
            console.log(`      Sources: ${result.sources.length}`);
            console.log(`      Source: ${result.source || 'unknown'}`);
        } else {
            console.log(`   ❌ Cross-source fallback returned no dub`);
        }
    } catch (e) {
        console.log(`   ❌ Error: ${(e as Error).message}`);
    }

    // Step 4: Test AllAnime fallback
    console.log(`\n🌐 Step 4: Testing AllAnime fallback with dub...`);
    try {
        const result = await sourceManager.tryAllAnimeFallback(
            `anilist-${ANILIST_ID}`,
            'dub',
            EPISODE_NUM,
            ANILIST_ID
        );

        if (result?.sources?.length) {
            console.log(`   ✅ AllAnime fallback found DUB!`);
            console.log(`      Sources: ${result.sources.length}`);
        } else {
            console.log(`   ❌ AllAnime fallback returned no dub`);
        }
    } catch (e) {
        console.log(`   ❌ Error: ${(e as Error).message}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏁 Debug complete\n`);
}

// Run the debug
debugDubStream().catch(console.error);
