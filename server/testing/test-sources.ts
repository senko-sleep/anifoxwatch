/**
 * Comprehensive Source Tests - Tests the HiAnime source and source manager
 */
import { sourceManager } from '../src/services/source-manager.js';
import { HiAnimeSource } from '../src/sources/hianime-source.js';

async function testHiAnimeSource() {
    console.log('='.repeat(60));
    console.log('HIANIME SOURCE TESTS');
    console.log('='.repeat(60));

    const source = new HiAnimeSource();

    // Test 1: Health Check
    console.log('\n📍 Test 1: Health Check');
    try {
        const healthy = await source.healthCheck();
        console.log(`   Result: ${healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 2: Search
    console.log('\n📍 Test 2: Search for "Naruto"');
    try {
        const results = await source.search('Naruto', 1);
        console.log(`   Results: ${results.results.length} anime found`);
        console.log(`   Source: ${results.source}`);
        if (results.results.length > 0) {
            console.log(`   First result:`);
            console.log(`     - ID: ${results.results[0].id}`);
            console.log(`     - Title: ${results.results[0].title}`);
            console.log(`     - Image: ${results.results[0].image?.substring(0, 50)}...`);
            console.log(`     - Episodes (Sub): ${results.results[0].subCount}`);
            console.log(`     - Episodes (Dub): ${results.results[0].dubCount}`);
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 3: Get Trending
    console.log('\n📍 Test 3: Get Trending');
    try {
        const trending = await source.getTrending(1);
        console.log(`   Results: ${trending.length} trending anime`);
        if (trending.length > 0) {
            console.log(`   Sample:`);
            trending.slice(0, 3).forEach((anime, i) => {
                console.log(`     ${i + 1}. ${anime.title}`);
            });
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 4: Get Latest
    console.log('\n📍 Test 4: Get Latest Episodes');
    try {
        const latest = await source.getLatest(1);
        console.log(`   Results: ${latest.length} latest episode anime`);
        if (latest.length > 0) {
            console.log(`   Sample:`);
            latest.slice(0, 3).forEach((anime, i) => {
                console.log(`     ${i + 1}. ${anime.title}`);
            });
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 5: Get Top Rated
    console.log('\n📍 Test 5: Get Top Rated');
    try {
        const topRated = await source.getTopRated(1, 10);
        console.log(`   Results: ${topRated.length} top rated anime`);
        if (topRated.length > 0) {
            console.log(`   Top 3:`);
            topRated.slice(0, 3).forEach(item => {
                console.log(`     #${item.rank}. ${item.anime.title}`);
            });
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }
}

async function testSourceManager() {
    console.log('\n');
    console.log('='.repeat(60));
    console.log('SOURCE MANAGER TESTS');
    console.log('='.repeat(60));

    // Test 1: Available Sources
    console.log('\n📍 Test 1: Available Sources');
    const sources = sourceManager.getAvailableSources();
    console.log(`   Sources: ${sources.join(', ')}`);

    // Test 2: Health Status
    console.log('\n📍 Test 2: Health Status');
    const healthStatus = sourceManager.getHealthStatus();
    healthStatus.forEach(status => {
        const icon = status.status === 'online' ? '✅' : '❌';
        console.log(`   ${icon} ${status.name}: ${status.status} (${status.latency || '?'}ms)`);
    });

    // Test 3: Search All
    console.log('\n📍 Test 3: Search All Sources for "One Piece"');
    try {
        const results = await sourceManager.searchAll('One Piece', 1);
        console.log(`   Results: ${results.results.length} anime found`);
        console.log(`   Source(s): ${results.source}`);
        if (results.results.length > 0) {
            console.log(`   Sample:`);
            results.results.slice(0, 3).forEach((anime, i) => {
                console.log(`     ${i + 1}. ${anime.title} (${anime.source})`);
            });
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 4: Get Trending via Manager
    console.log('\n📍 Test 4: Get Trending via Manager');
    try {
        const trending = await sourceManager.getTrending(1);
        console.log(`   Results: ${trending.length} trending anime`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 5: Get Latest via Manager
    console.log('\n📍 Test 5: Get Latest via Manager');
    try {
        const latest = await sourceManager.getLatest(1);
        console.log(`   Results: ${latest.length} latest anime`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 6: Get Top Rated via Manager
    console.log('\n📍 Test 6: Get Top Rated via Manager');
    try {
        const topRated = await sourceManager.getTopRated(1, 10);
        console.log(`   Results: ${topRated.length} top rated anime`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }
}

async function testEpisodeAndStreaming() {
    console.log('\n');
    console.log('='.repeat(60));
    console.log('EPISODE AND STREAMING TESTS');
    console.log('='.repeat(60));

    const source = new HiAnimeSource();

    // First search for an anime
    console.log('\n📍 Searching for "Steins Gate" to test episodes...');
    const searchResults = await source.search('Steins Gate', 1);

    if (searchResults.results.length === 0) {
        console.log('   ❌ No results found, skipping episode tests');
        return;
    }

    const animeId = searchResults.results[0].id;
    console.log(`   Using: ${searchResults.results[0].title} (${animeId})`);

    // Test: Get Anime Details
    console.log('\n📍 Test: Get Anime Details');
    try {
        const anime = await source.getAnime(animeId);
        if (anime) {
            console.log(`   Title: ${anime.title}`);
            console.log(`   Japanese: ${anime.titleJapanese}`);
            console.log(`   Type: ${anime.type}`);
            console.log(`   Status: ${anime.status}`);
            console.log(`   Episodes: ${anime.episodes}`);
            console.log(`   Genres: ${anime.genres?.join(', ')}`);
            console.log(`   Description: ${anime.description?.substring(0, 100)}...`);
        } else {
            console.log('   ❌ Failed to get anime details');
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test: Get Episodes
    console.log('\n📍 Test: Get Episodes');
    try {
        const episodes = await source.getEpisodes(animeId);
        console.log(`   Total Episodes: ${episodes.length}`);
        if (episodes.length > 0) {
            console.log(`   First episode:`);
            console.log(`     - ID: ${episodes[0].id}`);
            console.log(`     - Number: ${episodes[0].number}`);
            console.log(`     - Title: ${episodes[0].title}`);
        }

        // Test: Get Episode Servers (if we have episodes)
        if (episodes.length > 0) {
            console.log('\n📍 Test: Get Episode Servers');
            try {
                const servers = await source.getEpisodeServers(episodes[0].id);
                console.log(`   Available servers: ${servers.length}`);
                servers.forEach(server => {
                    console.log(`     - ${server.name} (${server.type})`);
                });
            } catch (e: any) {
                console.log(`   ❌ Error: ${e.message}`);
            }

            // Test: Get Streaming Links
            console.log('\n📍 Test: Get Streaming Links');
            try {
                const streamData = await source.getStreamingLinks(episodes[0].id, 'hd-1', 'sub');
                console.log(`   Video sources: ${streamData.sources.length}`);
                console.log(`   Subtitles: ${streamData.subtitles?.length || 0}`);
                if (streamData.sources.length > 0) {
                    console.log(`   First source:`);
                    console.log(`     - Quality: ${streamData.sources[0].quality}`);
                    console.log(`     - M3U8: ${streamData.sources[0].isM3U8}`);
                    console.log(`     - URL: ${streamData.sources[0].url?.substring(0, 60)}...`);
                }
            } catch (e: any) {
                console.log(`   ❌ Error: ${e.message}`);
            }
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }
}

async function main() {
    console.log('\n🚀 Starting Comprehensive Source Tests...\n');

    await testHiAnimeSource();
    await testSourceManager();
    await testEpisodeAndStreaming();

    console.log('\n');
    console.log('='.repeat(60));
    console.log('TESTS COMPLETED');
    console.log('='.repeat(60));
}

main().catch(console.error);
