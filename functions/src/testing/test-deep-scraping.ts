/**
 * Test deep streaming path via AnimeKai (Consumet) + source manager.
 */

import { AnimeKaiSource } from '../src/sources/animekai-source.js';
import { sourceManager } from '../src/services/source-manager.js';

async function testAnimeKaiDeep() {
    console.log('='.repeat(60));
    console.log('ANIMEKAI SOURCE TESTS (streaming)');
    console.log('='.repeat(60));

    const source = new AnimeKaiSource();

    console.log('\n📍 Test 1: Health Check');
    try {
        const healthy = await source.healthCheck();
        console.log(`   Result: ${healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    console.log('\n📍 Test 2: Search for "One Piece"');
    try {
        const results = await source.search('One Piece', 1);
        console.log(`   Results: ${results.results.length} anime found`);
        console.log(`   Source: ${results.source}`);
        if (results.results.length > 0) {
            console.log(`   First: ${results.results[0].title} (${results.results[0].id})`);
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    console.log('\n📍 Test 3: Get Episodes (from search)');
    let episodeId: string | null = null;
    try {
        const os = await source.search('one piece', 1);
        const aid = os.results[0]?.id;
        if (!aid) throw new Error('no anime from search');
        const episodes = await source.getEpisodes(aid);
        console.log(`   Total Episodes: ${episodes.length}`);
        if (episodes.length > 0) {
            episodeId = episodes[0].id;
            console.log(`   First episode: ${episodes[0].id}`);
        }
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
    }

    if (episodeId) {
        console.log('\n📍 Test 4: Streaming');
        try {
            const streamData = await source.getStreamingLinks(episodeId, undefined, 'sub');
            console.log(`   Video sources: ${streamData.sources.length}`);
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`);
        }
    }
}

async function testSourceManager() {
    console.log('\n' + '='.repeat(60));
    console.log('SOURCE MANAGER');
    console.log('='.repeat(60));
    console.log(`   Sources: ${sourceManager.getAvailableSources().join(', ')}`);
}

async function main() {
    await testAnimeKaiDeep();
    await testSourceManager();
}

main().catch(console.error);
