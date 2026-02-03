/**
 * Test Deep Scraping - Tests the HiAnimeDirectSource for streaming
 * This test verifies that deep scraping works and returns valid streaming URLs
 */

import { HiAnimeDirectSource } from '../src/sources/hianime-direct-source.js';
import { sourceManager } from '../src/services/source-manager.js';

async function testHiAnimeDirectSource() {
    console.log('='.repeat(60));
    console.log('HIANIME DIRECT SOURCE TESTS (Deep Scraping)');
    console.log('='.repeat(60));

    const source = new HiAnimeDirectSource();

    // Test 1: Health Check
    console.log('\n📍 Test 1: Health Check');
    try {
        const healthy = await source.healthCheck();
        console.log(`   Result: ${healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 2: Search
    console.log('\n📍 Test 2: Search for "One Piece"');
    try {
        const results = await source.search('One Piece', 1);
        console.log(`   Results: ${results.results.length} anime found`);
        console.log(`   Source: ${results.source}`);
        if (results.results.length > 0) {
            console.log(`   First result:`);
            console.log(`     - ID: ${results.results[0].id}`);
            console.log(`     - Title: ${results.results[0].title}`);
            console.log(`     - Episodes (Sub): ${results.results[0].subCount}`);
            console.log(`     - Episodes (Dub): ${results.results[0].dubCount}`);
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 3: Get Episodes
    console.log('\n📍 Test 3: Get Episodes for "one-piece-100"');
    let episodeId: string | null = null;
    try {
        const episodes = await source.getEpisodes('hianime-one-piece-100');
        console.log(`   Total Episodes: ${episodes.length}`);
        if (episodes.length > 0) {
            episodeId = episodes[0].id;
            console.log(`   First episode:`);
            console.log(`     - ID: ${episodes[0].id}`);
            console.log(`     - Number: ${episodes[0].number}`);
            console.log(`     - Title: ${episodes[0].title}`);
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    // Test 4: Get Episode Servers
    if (episodeId) {
        console.log('\n📍 Test 4: Get Episode Servers');
        try {
            const servers = await source.getEpisodeServers(episodeId);
            console.log(`   Available servers: ${servers.length}`);
            servers.forEach(server => {
                console.log(`     - ${server.name} (${server.type})`);
            });
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`);
        }
    }

    // Test 5: Get Streaming Links (THE CRITICAL TEST)
    if (episodeId) {
        console.log('\n📍 Test 5: Get Streaming Links (CRITICAL - Deep Scraping)');
        try {
            const streamData = await source.getStreamingLinks(episodeId, 'hd-2', 'sub');
            console.log(`   Video sources: ${streamData.sources.length}`);
            console.log(`   Subtitles: ${streamData.subtitles?.length || 0}`);

            if (streamData.sources.length > 0) {
                console.log(`   ✅ SUCCESS! Found streaming sources:`);
                streamData.sources.forEach((src, i) => {
                    console.log(`     ${i + 1}. Quality: ${src.quality}`);
                    console.log(`        M3U8: ${src.isM3U8}`);
                    console.log(`        URL: ${src.url?.substring(0, 80)}...`);
                });

                if (streamData.subtitles && streamData.subtitles.length > 0) {
                    console.log(`   Subtitles:`);
                    streamData.subtitles.forEach((sub, i) => {
                        console.log(`     ${i + 1}. ${sub.lang}: ${sub.url?.substring(0, 60)}...`);
                    });
                }

                if (streamData.intro) {
                    console.log(`   Intro: ${streamData.intro.start}s - ${streamData.intro.end}s`);
                }
                if (streamData.outro) {
                    console.log(`   Outro: ${streamData.outro.start}s - ${streamData.outro.end}s`);
                }
            } else {
                console.log(`   ❌ No streaming sources found`);
            }
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`);
        }
    }
}

async function testSourceManager() {
    console.log('\n');
    console.log('='.repeat(60));
    console.log('SOURCE MANAGER TESTS (with HiAnimeDirect)');
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

    // Test 3: Get Streaming Links via Manager
    console.log('\n📍 Test 3: Get Streaming Links via Source Manager');
    try {
        const episodeId = 'one-piece-100?ep=2142';
        console.log(`   Testing episode: ${episodeId}`);

        const streamData = await sourceManager.getStreamingLinks(episodeId, 'hd-2', 'sub');
        console.log(`   Video sources: ${streamData.sources.length}`);
        console.log(`   Subtitles: ${streamData.subtitles?.length || 0}`);

        if (streamData.sources.length > 0) {
            console.log(`   ✅ SUCCESS! Source Manager returned streaming URLs:`);
            streamData.sources.forEach((src, i) => {
                console.log(`     ${i + 1}. ${src.quality}: ${src.url?.substring(0, 60)}...`);
            });
        } else {
            console.log(`   ❌ No streaming sources found via Source Manager`);
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }
}

async function testDifferentAnime() {
    console.log('\n');
    console.log('='.repeat(60));
    console.log('TEST DIFFERENT ANIME');
    console.log('='.repeat(60));

    const source = new HiAnimeDirectSource();

    const testAnime = [
        { name: 'Naruto', id: 'naruto-shippuuden-355' },
        { name: 'Attack on Titan', id: 'shingeki-no-kyojin-112' },
        { name: 'Demon Slayer', id: 'kimetsu-no-yaiba-47' },
    ];

    for (const anime of testAnime) {
        console.log(`\n📍 Testing: ${anime.name}`);
        try {
            const episodes = await source.getEpisodes(`hianime-${anime.id}`);
            if (episodes.length > 0) {
                const episodeId = episodes[0].id;
                console.log(`   Episode ID: ${episodeId}`);

                const streamData = await source.getStreamingLinks(episodeId!, 'hd-2', 'sub');
                if (streamData.sources.length > 0) {
                    console.log(`   ✅ SUCCESS: ${streamData.sources.length} sources found`);
                    console.log(`   URL: ${streamData.sources[0].url?.substring(0, 60)}...`);
                } else {
                    console.log(`   ❌ No sources found`);
                }
            } else {
                console.log(`   ❌ No episodes found`);
            }
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`);
        }
    }
}

async function main() {
    console.log('\n🚀 Starting Deep Scraping Tests...\n');

    await testHiAnimeDirectSource();
    await testSourceManager();
    await testDifferentAnime();

    console.log('\n');
    console.log('='.repeat(60));
    console.log('ALL TESTS COMPLETED');
    console.log('='.repeat(60));
}

main().catch(console.error);
