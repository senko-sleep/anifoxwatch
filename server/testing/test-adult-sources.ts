/**
 * Combined test script for all adult anime sources
 * Tests WatchHentai and Hanime together for:
 * - Search functionality
 * - Genre filtering
 * - Pagination
 * - Streaming links
 */
import { WatchHentaiSource } from '../src/sources/watchhentai-source.js';
import { HanimeSource } from '../src/sources/hanime-source.js';

interface TestResult {
    source: string;
    test: string;
    passed: boolean;
    details?: string;
}

const results: TestResult[] = [];

function logResult(source: string, test: string, passed: boolean, details?: string) {
    results.push({ source, test, passed, details });
    const icon = passed ? '✓' : '✗';
    console.log(`   ${icon} [${source}] ${test}${details ? ': ' + details : ''}`);
}

async function testSource(source: WatchHentaiSource | HanimeSource) {
    const name = source.name;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Testing ${name}`);
    console.log('─'.repeat(50));

    // Health check
    console.log('\n📡 Health Check:');
    try {
        const isHealthy = await source.healthCheck();
        logResult(name, 'Health Check', isHealthy, isHealthy ? 'Online' : 'Offline');
    } catch (error: any) {
        logResult(name, 'Health Check', false, error.message);
    }

    // Get genres
    console.log('\n📚 Genre Support:');
    try {
        const genres = await source.getGenres();
        logResult(name, 'getGenres()', genres.length > 0, `${genres.length} genres available`);
    } catch (error: any) {
        logResult(name, 'getGenres()', false, error.message);
    }

    // Search
    console.log('\n🔍 Search:');
    try {
        const searchResult = await source.search('milf', 1);
        logResult(name, 'search("milf")', searchResult.results.length > 0, `${searchResult.results.length} results`);
    } catch (error: any) {
        logResult(name, 'search("milf")', false, error.message);
    }

    // Genre filtering
    console.log('\n🏷️ Genre Filtering:');
    try {
        const genreResult = await source.getByGenre('yuri', 1);
        logResult(name, 'getByGenre("yuri")', genreResult.results.length > 0, `${genreResult.results.length} results`);
    } catch (error: any) {
        logResult(name, 'getByGenre("yuri")', false, error.message);
    }

    // Pagination
    console.log('\n📄 Pagination:');
    try {
        const page1 = await source.getByGenre('milf', 1);
        const page2 = await source.getByGenre('milf', 2);
        const differentResults = page1.results.length > 0 && page2.results.length > 0 &&
            page1.results[0]?.id !== page2.results[0]?.id;
        logResult(name, 'Pagination (page 1 vs 2)', differentResults,
            `Page 1: ${page1.results.length}, Page 2: ${page2.results.length}`);
    } catch (error: any) {
        logResult(name, 'Pagination', false, error.message);
    }

    // Trending
    console.log('\n📈 Trending:');
    try {
        const trending = await source.getTrending(1);
        logResult(name, 'getTrending()', trending.length > 0, `${trending.length} items`);
    } catch (error: any) {
        logResult(name, 'getTrending()', false, error.message);
    }

    // Latest
    console.log('\n🆕 Latest:');
    try {
        const latest = await source.getLatest(1);
        logResult(name, 'getLatest()', latest.length > 0, `${latest.length} items`);
    } catch (error: any) {
        logResult(name, 'getLatest()', false, error.message);
    }

    // Get anime details
    console.log('\n📋 Anime Details:');
    try {
        const searchResult = await source.search('hentai', 1);
        if (searchResult.results.length > 0) {
            const anime = await source.getAnime(searchResult.results[0].id);
            logResult(name, 'getAnime()', anime !== null, anime?.title || 'Not found');
        } else {
            logResult(name, 'getAnime()', false, 'No search results to test with');
        }
    } catch (error: any) {
        logResult(name, 'getAnime()', false, error.message);
    }

    // Get episodes
    console.log('\n🎬 Episodes:');
    try {
        const searchResult = await source.search('hentai', 1);
        if (searchResult.results.length > 0) {
            const episodes = await source.getEpisodes(searchResult.results[0].id);
            logResult(name, 'getEpisodes()', episodes.length > 0, `${episodes.length} episodes`);
        } else {
            logResult(name, 'getEpisodes()', false, 'No search results to test with');
        }
    } catch (error: any) {
        logResult(name, 'getEpisodes()', false, error.message);
    }

    // Streaming links
    console.log('\n🎥 Streaming:');
    try {
        const searchResult = await source.search('hentai', 1);
        if (searchResult.results.length > 0) {
            const episodes = await source.getEpisodes(searchResult.results[0].id);
            if (episodes.length > 0) {
                const streamData = await source.getStreamingLinks(episodes[0].id);
                logResult(name, 'getStreamingLinks()', streamData.sources.length > 0,
                    `${streamData.sources.length} sources`);
                if (streamData.sources.length > 0) {
                    console.log(`      First source: ${streamData.sources[0].quality} - ${streamData.sources[0].url?.substring(0, 50)}...`);
                }
            } else {
                logResult(name, 'getStreamingLinks()', false, 'No episodes to test with');
            }
        } else {
            logResult(name, 'getStreamingLinks()', false, 'No search results to test with');
        }
    } catch (error: any) {
        logResult(name, 'getStreamingLinks()', false, error.message);
    }
}

async function runAllTests() {
    console.log('═'.repeat(60));
    console.log('ADULT ANIME SOURCES - COMPREHENSIVE TEST SUITE');
    console.log('═'.repeat(60));
    console.log(`Started: ${new Date().toISOString()}`);

    const watchHentai = new WatchHentaiSource();
    const hanime = new HanimeSource();

    await testSource(watchHentai);
    await testSource(hanime);

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('TEST SUMMARY');
    console.log('═'.repeat(60));

    const watchHentaiResults = results.filter(r => r.source === 'WatchHentai');
    const hanimeResults = results.filter(r => r.source === 'Hanime');

    const whPassed = watchHentaiResults.filter(r => r.passed).length;
    const whTotal = watchHentaiResults.length;
    const hPassed = hanimeResults.filter(r => r.passed).length;
    const hTotal = hanimeResults.length;

    console.log(`\nWatchHentai: ${whPassed}/${whTotal} tests passed (${Math.round(whPassed/whTotal*100)}%)`);
    console.log(`Hanime:      ${hPassed}/${hTotal} tests passed (${Math.round(hPassed/hTotal*100)}%)`);
    console.log(`\nTotal:       ${whPassed + hPassed}/${whTotal + hTotal} tests passed`);

    // Failed tests
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
        console.log('\n❌ Failed Tests:');
        failed.forEach(f => {
            console.log(`   - [${f.source}] ${f.test}: ${f.details || 'Unknown error'}`);
        });
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`Completed: ${new Date().toISOString()}`);
    console.log('═'.repeat(60));
}

runAllTests().catch(console.error);
