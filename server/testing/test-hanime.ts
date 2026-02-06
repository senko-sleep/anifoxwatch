/**
 * Test script for Hanime source
 * Tests search, genres, streaming, and pagination
 */
import { HanimeSource } from '../src/sources/hanime-source.js';

async function testHanime() {
    console.log('='.repeat(60));
    console.log('Testing Hanime Source');
    console.log('='.repeat(60));

    const source = new HanimeSource();

    // Test 1: Health check
    console.log('\n1. Health check...');
    try {
        const isHealthy = await source.healthCheck();
        console.log(`   Health: ${isHealthy ? '✓ Online' : '✗ Offline'}`);
        if (!isHealthy) {
            console.log('   ⚠️ Source is offline, some tests may fail');
        }
    } catch (error: any) {
        console.log(`   ✗ Health check failed: ${error.message}`);
    }

    // Test 2: Get genres
    console.log('\n2. Testing getGenres()...');
    try {
        const genres = await source.getGenres();
        console.log(`   Found ${genres.length} genres`);
        console.log(`   Sample genres: ${genres.slice(0, 10).join(', ')}`);
    } catch (error: any) {
        console.log(`   ✗ getGenres failed: ${error.message}`);
    }

    // Test 3: Search
    console.log('\n3. Testing search("milf")...');
    try {
        const searchResult = await source.search('milf', 1);
        console.log(`   Found ${searchResult.results.length} results`);
        console.log(`   Total pages: ${searchResult.totalPages}`);
        console.log(`   Has next page: ${searchResult.hasNextPage}`);

        if (searchResult.results.length > 0) {
            console.log('\n   First 3 results:');
            searchResult.results.slice(0, 3).forEach((anime, i) => {
                console.log(`   ${i + 1}. ${anime.title}`);
                console.log(`      ID: ${anime.id}`);
                console.log(`      Image: ${anime.image?.substring(0, 60)}...`);
                console.log(`      Genres: ${anime.genres?.join(', ')}`);
            });
        }
    } catch (error: any) {
        console.log(`   ✗ Search failed: ${error.message}`);
    }

    // Test 4: Get by genre
    console.log('\n4. Testing getByGenre("milf", page 1)...');
    try {
        const genreResult = await source.getByGenre('milf', 1);
        console.log(`   Found ${genreResult.results.length} results`);
        console.log(`   Total pages: ${genreResult.totalPages}`);
        console.log(`   Has next page: ${genreResult.hasNextPage}`);

        if (genreResult.results.length > 0) {
            console.log('\n   First 3 results:');
            genreResult.results.slice(0, 3).forEach((anime, i) => {
                console.log(`   ${i + 1}. ${anime.title}`);
                console.log(`      ID: ${anime.id}`);
            });
        }
    } catch (error: any) {
        console.log(`   ✗ getByGenre failed: ${error.message}`);
    }

    // Test 5: Pagination - get page 2
    console.log('\n5. Testing pagination - getByGenre("milf", page 2)...');
    try {
        const page2Result = await source.getByGenre('milf', 2);
        console.log(`   Page 2 results: ${page2Result.results.length}`);
        console.log(`   Current page: ${page2Result.currentPage}`);
        console.log(`   Has next page: ${page2Result.hasNextPage}`);

        if (page2Result.results.length > 0) {
            console.log(`   First result on page 2: ${page2Result.results[0].title}`);
        }
    } catch (error: any) {
        console.log(`   ✗ Pagination failed: ${error.message}`);
    }

    // Test 6: Get trending
    console.log('\n6. Testing getTrending()...');
    try {
        const trending = await source.getTrending(1);
        console.log(`   Found ${trending.length} trending items`);
        if (trending.length > 0) {
            console.log(`   Top trending: ${trending[0].title}`);
        }
    } catch (error: any) {
        console.log(`   ✗ getTrending failed: ${error.message}`);
    }

    // Test 7: Get latest
    console.log('\n7. Testing getLatest()...');
    try {
        const latest = await source.getLatest(1);
        console.log(`   Found ${latest.length} latest items`);
        if (latest.length > 0) {
            console.log(`   Latest: ${latest[0].title}`);
        }
    } catch (error: any) {
        console.log(`   ✗ getLatest failed: ${error.message}`);
    }

    // Test 8: Get anime details
    console.log('\n8. Testing getAnime() with first search result...');
    try {
        const searchResult = await source.search('hentai', 1);
        if (searchResult.results.length > 0) {
            const firstId = searchResult.results[0].id;
            console.log(`   Fetching details for: ${firstId}`);
            const anime = await source.getAnime(firstId);
            if (anime) {
                console.log(`   ✓ Title: ${anime.title}`);
                console.log(`   ✓ Description: ${anime.description?.substring(0, 100)}...`);
                console.log(`   ✓ Genres: ${anime.genres?.join(', ')}`);
            } else {
                console.log(`   ✗ Anime not found`);
            }
        }
    } catch (error: any) {
        console.log(`   ✗ getAnime failed: ${error.message}`);
    }

    // Test 9: Get episodes
    console.log('\n9. Testing getEpisodes()...');
    try {
        const searchResult = await source.search('hentai', 1);
        if (searchResult.results.length > 0) {
            const firstId = searchResult.results[0].id;
            const episodes = await source.getEpisodes(firstId);
            console.log(`   Found ${episodes.length} episodes`);
            if (episodes.length > 0) {
                console.log(`   Episode 1 ID: ${episodes[0].id}`);
                console.log(`   Episode 1 Title: ${episodes[0].title}`);
            }
        }
    } catch (error: any) {
        console.log(`   ✗ getEpisodes failed: ${error.message}`);
    }

    // Test 10: Get streaming links
    console.log('\n10. Testing getStreamingLinks()...');
    try {
        const searchResult = await source.search('hentai', 1);
        if (searchResult.results.length > 0) {
            const firstId = searchResult.results[0].id;
            const episodes = await source.getEpisodes(firstId);
            if (episodes.length > 0) {
                console.log(`   Fetching streams for: ${episodes[0].id}`);
                const streamData = await source.getStreamingLinks(episodes[0].id);
                console.log(`   Found ${streamData.sources.length} sources`);
                if (streamData.sources.length > 0) {
                    streamData.sources.forEach((src, i) => {
                        console.log(`   ${i + 1}. Quality: ${src.quality}, URL: ${src.url?.substring(0, 60)}...`);
                    });
                } else {
                    console.log(`   ⚠️ No streaming sources found (may require different extraction method)`);
                }
            }
        }
    } catch (error: any) {
        console.log(`   ✗ getStreamingLinks failed: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('Hanime Source Tests Complete');
    console.log('='.repeat(60));
}

testHanime().catch(console.error);
