/**
 * End-to-End Streaming Test
 * Tests the complete flow from search to playable stream through the source manager
 */

import { sourceManager } from '../src/services/source-manager.js';

async function testEndToEnd() {
    console.log('='.repeat(70));
    console.log('END-TO-END STREAMING TEST');
    console.log('='.repeat(70));
    console.log('\nThis test validates the complete flow through the source manager.\n');

    // Step 1: Search for anime
    console.log('📍 Step 1: Search for "Demon Slayer"');
    const searchResults = await sourceManager.search('Demon Slayer', 1);
    console.log(`   Found ${searchResults.results.length} results`);

    if (searchResults.results.length === 0) {
        console.log('   ❌ No search results found');
        return;
    }

    const anime = searchResults.results[0];
    console.log(`   Selected: ${anime.title} (ID: ${anime.id})`);
    console.log(`   Source: ${anime.source}`);

    // Step 2: Get anime details
    console.log('\n📍 Step 2: Get Anime Details');
    const animeDetails = await sourceManager.getAnime(anime.id);
    if (animeDetails) {
        console.log(`   Title: ${animeDetails.title}`);
        console.log(`   Episodes: ${animeDetails.episodes}`);
        console.log(`   Status: ${animeDetails.status}`);
    } else {
        console.log('   ❌ Failed to get anime details');
    }

    // Step 3: Get episodes
    console.log('\n📍 Step 3: Get Episodes');
    const episodes = await sourceManager.getEpisodes(anime.id);
    console.log(`   Total episodes: ${episodes.length}`);

    if (episodes.length === 0) {
        console.log('   ❌ No episodes found');
        return;
    }

    const episode = episodes[0];
    console.log(`   First episode: ${episode.title} (ID: ${episode.id})`);

    // Step 4: Get episode servers
    console.log('\n📍 Step 4: Get Episode Servers');
    const servers = await sourceManager.getEpisodeServers(episode.id);
    console.log(`   Available servers: ${servers.length}`);
    servers.slice(0, 5).forEach(s => {
        console.log(`     - ${s.name} (${s.type})`);
    });

    // Step 5: Get streaming links
    console.log('\n📍 Step 5: Get Streaming Links (THE CRITICAL TEST)');
    const streamData = await sourceManager.getStreamingLinks(episode.id, 'hd-2', 'sub');

    console.log(`   Video sources: ${streamData.sources.length}`);
    console.log(`   Subtitles: ${streamData.subtitles?.length || 0}`);

    if (streamData.sources.length > 0) {
        console.log('\n   ✅ SUCCESS! Streaming URLs obtained:');
        streamData.sources.forEach((src, i) => {
            console.log(`     ${i + 1}. Quality: ${src.quality}`);
            console.log(`        M3U8: ${src.isM3U8}`);
            console.log(`        URL: ${src.url?.substring(0, 70)}...`);
        });

        if (streamData.subtitles && streamData.subtitles.length > 0) {
            console.log(`\n   Subtitles available:`);
            streamData.subtitles.slice(0, 3).forEach((sub, i) => {
                console.log(`     ${i + 1}. ${sub.lang}`);
            });
        }

        if (streamData.headers) {
            console.log(`\n   Headers for playback:`);
            Object.entries(streamData.headers).forEach(([key, value]) => {
                console.log(`     ${key}: ${value}`);
            });
        }

        console.log('\n' + '='.repeat(70));
        console.log('🎉 END-TO-END TEST PASSED!');
        console.log('='.repeat(70));
        console.log('\nThe streaming implementation is working correctly.');
        console.log('Stream URLs are being extracted and are ready for playback.');
    } else {
        console.log('\n   ❌ FAILED: No streaming sources found');
        console.log('\n' + '='.repeat(70));
        console.log('❌ END-TO-END TEST FAILED');
        console.log('='.repeat(70));
    }
}

testEndToEnd().catch(console.error);
