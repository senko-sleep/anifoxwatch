import { ReAnimeSource } from '../sources/reanime-source.js';
import { AnichiSource } from '../sources/anichi-source.js';
import { SourceManager } from '../services/source-manager.js';

async function verify() {
    console.log('=== VERIFYING REANIME & ANICHI SOURCES ===\n');

    // 1. ReAnime Test
    console.log('--- 1. Testing ReAnimeSource ---');
    const reanime = new ReAnimeSource();

    console.log('Searching ReAnime for "chainsmoker"...');
    const reSearch = await reanime.search('chainsmoker');
    console.log(`ReAnime Search count: ${reSearch.results.length}`);
    if (reSearch.results.length > 0) {
        console.log('  Top match:', reSearch.results[0].id, reSearch.results[0].title);
    }

    console.log('Fetching ReAnime streams for anilist-207141 ep 1 (category: sub)...');
    const reStreamsSub = await reanime.getStreamingLinks('anilist-207141$ep=1', undefined, 'sub', { episodeNum: 1, anilistId: 207141 });
    console.log(`ReAnime Sub streams returned: ${reStreamsSub.sources.length}`);
    reStreamsSub.sources.forEach(s => console.log(`   [Sub] ${s.server || 'Server'}: ${s.url}`));

    console.log('Fetching ReAnime streams for anilist-207141 ep 1 (category: dub)...');
    const reStreamsDub = await reanime.getStreamingLinks('anilist-207141$ep=1', undefined, 'dub', { episodeNum: 1, anilistId: 207141 });
    console.log(`ReAnime Dub streams returned: ${reStreamsDub.sources.length}`);
    reStreamsDub.sources.forEach(s => console.log(`   [Dub] ${s.server || 'Server'}: ${s.url}`));


    // 2. Anichi Test
    console.log('\n--- 2. Testing AnichiSource ---');
    const anichi = new AnichiSource();

    console.log('Fetching Anichi episodes for "anichi-chainsmoker-cat"...');
    const aniEps = await anichi.getEpisodes('anichi-chainsmoker-cat');
    console.log(`Anichi episode count: ${aniEps.length}`);

    console.log('Fetching Anichi streams for "anichi-chainsmoker-cat$ep=1"...');
    const aniStreams = await anichi.getStreamingLinks('anichi-chainsmoker-cat$ep=1');
    console.log(`Anichi streams returned: ${aniStreams.sources.length}`);
    aniStreams.sources.forEach(s => console.log(`   [Anichi] ${s.quality || 'auto'} (${s.category || 'sub'}): ${s.url}`));


    // 3. SourceManager Auto Stream Selection Test
    console.log('\n--- 3. Testing SourceManager Auto-Selection (Most Streams Policy) ---');
    const sm = new SourceManager();
    console.log('Available sources in SourceManager:', sm.getAvailableSources());

    console.log('Fetching streams via SourceManager for anilist-207141 ep 1...');
    const bestStreams = await sm.getStreamingLinks('anilist-207141$ep=1', undefined, 'sub', 1, 207141);
    console.log(`SourceManager returned ${bestStreams.sources.length} total streams.`);
    bestStreams.sources.forEach(s => console.log(`   -> [${s.category || 'sub'}] ${s.url}`));

    console.log('\n=== VERIFICATION COMPLETE ===');
}

verify().catch(console.error);
