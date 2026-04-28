/**
 * Test streaming with our fixed working sources
 */
import { sourceManager } from '../src/services/source-manager.js';

async function testStreaming() {
    console.log('='.repeat(70));
    console.log('STREAMING TEST WITH FIXED SOURCES');
    console.log('='.repeat(70));

    // Test 1: Search for Spy x Family Season 3
    console.log('\n📍 Test 1: Search for "Spy x Family Season 3"');
    const searchResults = await sourceManager.search('Spy x Family Season 3', 1);
    console.log(`   Found ${searchResults.results.length} results`);

    if (searchResults.results.length === 0) {
        console.log('   ❌ No search results');
        return;
    }

    const anime = searchResults.results[0];
    console.log(`   Selected: ${anime.title} (ID: ${anime.id}, Source: ${anime.source})`);

    // Test 2: Get episodes
    console.log('\n📍 Test 2: Get Episodes');
    const episodes = await sourceManager.getEpisodes(anime.id);
    console.log(`   Total episodes: ${episodes.length}`);

    if (episodes.length === 0) {
        console.log('   ❌ No episodes found');
        return;
    }

    const episode = episodes[0];
    console.log(`   First episode: ${episode.title} (ID: ${episode.id})`);

    // Test 3: Get streaming links
    console.log('\n📍 Test 3: Get Streaming Links');
    const streamData = await sourceManager.getStreamingLinks(episode.id, undefined, 'sub');

    console.log(`   Video sources: ${streamData.sources.length}`);
    console.log(`   Subtitles: ${streamData.subtitles?.length || 0}`);

    if (streamData.sources.length > 0) {
        console.log('\n   ✅ SUCCESS! Streaming URLs obtained:');
        streamData.sources.forEach((src, i) => {
            console.log(`     ${i + 1}. Quality: ${src.quality}`);
            console.log(`        M3U8: ${src.isM3U8}`);
            console.log(`        URL: ${src.url?.substring(0, 80)}...`);
        });

        if (streamData.headers) {
            console.log(`\n   Headers for playback:`);
            Object.entries(streamData.headers).forEach(([key, value]) => {
                console.log(`     ${key}: ${value}`);
            });
        }

        console.log('\n' + '='.repeat(70));
        console.log('🎉 STREAMING TEST PASSED!');
        console.log('='.repeat(70));
    } else {
        console.log('\n   ❌ FAILED: No streaming sources found');
        console.log('\n' + '='.repeat(70));
        console.log('❌ STREAMING TEST FAILED');
        console.log('='.repeat(70));
    }

    // Test 4: Try a different anime (Demon Slayer to verify Gogoanime)
    console.log('\n📍 Test 4: Test Gogoanime with Demon Slayer');
    const dmResults = await sourceManager.search('Demon Slayer', 1);
    if (dmResults.results.length > 0) {
        const dmEpisodes = await sourceManager.getEpisodes(dmResults.results[0].id);
        if (dmEpisodes.length > 0) {
            const dmStream = await sourceManager.getStreamingLinks(dmEpisodes[0].id, undefined, 'sub');
            console.log(`   Demon Slayer streaming: ${dmStream.sources.length} sources`);
            if (dmStream.sources.length > 0) {
                console.log(`   ✅ Gogoanime working: ${dmStream.sources[0].url?.substring(0, 60)}...`);
            }
        }
    }

    process.exit(0);
}

testStreaming().catch(console.error);
