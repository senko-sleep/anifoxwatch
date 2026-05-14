import { GogoanimeSource } from '../server/src/sources/gogoanime-source.js';

async function testGogoDub() {
    const source = new GogoanimeSource();
    
    console.log('============================================================');
    console.log('🧪 GOGOANIME DUB DIRECT TEST');
    console.log('============================================================');
    
    // Test 1: Native Gogoanime DUB
    console.log('\n🎯 Test 1: Native Gogoanime episode ID');
    const nativeResult = await source.getStreamingLinks(
        'rezero-kara-hajimeru-isekai-seikatsu-4th-season-episode-1', 
        undefined, 
        'dub'
    );
    console.log(`   Sources: ${nativeResult.sources.length}`);
    if (nativeResult.sources.length > 0) {
        console.log(`   URL: ${nativeResult.sources[0].url.substring(0, 80)}...`);
        console.log(`   ✅ DUB found via native ID`);
    } else {
        console.log(`   ❌ No DUB found via native ID`);
    }
    
    // Test 2: HiAnime-style ID
    console.log('\n🎯 Test 2: HiAnime-style episode ID');
    const hianimeResult = await source.getStreamingLinks(
        'rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0$ep=1$token=Ltfh8KXzuwau03VfhY-G', 
        undefined, 
        'dub'
    );
    console.log(`   Sources: ${hianimeResult.sources.length}`);
    if (hianimeResult.sources.length > 0) {
        console.log(`   URL: ${hianimeResult.sources[0].url.substring(0, 80)}...`);
        console.log(`   ✅ DUB found via HiAnime ID`);
    } else {
        console.log(`   ❌ No DUB found via HiAnime ID`);
    }
    
    // Test 3: English dub slug with "re-zero" (alternate naming)
    console.log('\n🎯 Test 3: Direct dub slug test');
    const dubSlugs = [
        'rezero-kara-hajimeru-isekai-seikatsu-4th-season-dub-episode-1',
        're-zero-kara-hajimeru-isekai-seikatsu-4th-season-dub-episode-1',
        're-zero-starting-life-in-another-world-season-4-dub-episode-1',
    ];
    for (const slug of dubSlugs) {
        const result = await source.getStreamingLinks(slug, undefined, 'dub');
        console.log(`   ${slug}: ${result.sources.length > 0 ? '✅' : '❌'} (${result.sources.length} sources)`);
    }
    
    console.log('\n============================================================');
    console.log('📋 DONE');
    console.log('============================================================');
}

testGogoDub().catch(console.error);
