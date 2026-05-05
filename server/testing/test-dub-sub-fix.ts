import { GogoanimeSource } from '../src/sources/gogoanime-source.js';

async function testDubSubFix() {
    console.log('=== Testing Dub/Sub Fix ===\n');
    
    const source = new GogoanimeSource();
    
    // Test with Naruto (should have both sub and dub)
    const animeId = 'naruto';
    
    console.log(`Testing with anime: ${animeId}\n`);
    
    // Get episodes
    console.log('1. Getting episodes...');
    const episodes = await source.getEpisodes(`gogoanime-${animeId}`);
    console.log(`   Episodes returned: ${episodes.length}`);
    
    if (episodes.length === 0) {
        console.log('   No episodes found, cannot test streaming');
        process.exit(1);
    }
    
    const firstEp = episodes[0];
    console.log(`   First episode: ${firstEp.id}`);
    
    // Test SUB streaming
    console.log('\n2. Testing SUB streaming...');
    const subStream = await source.getStreamingLinks(firstEp.id, undefined, 'sub');
    console.log(`   Sources: ${subStream.sources.length}`);
    subStream.sources.forEach((s, i) => {
        console.log(`     [${i}] ${s.quality}: ${s.url?.substring(0, 60)}...`);
    });
    
    // Test DUB streaming
    console.log('\n3. Testing DUB streaming...');
    const dubStream = await source.getStreamingLinks(firstEp.id, undefined, 'dub');
    console.log(`   Sources: ${dubStream.sources.length}`);
    dubStream.sources.forEach((s, i) => {
        console.log(`     [${i}] ${s.quality}: ${s.url?.substring(0, 60)}...`);
    });
    
    // Compare
    console.log('\n4. Comparison:');
    if (subStream.sources.length === 0 && dubStream.sources.length === 0) {
        console.log('   Both sub and dub have no sources (anime may not be available)');
    } else if (subStream.sources.length > 0 && dubStream.sources.length > 0) {
        const subUrl = subStream.sources[0]?.url;
        const dubUrl = dubStream.sources[0]?.url;
        if (subUrl === dubUrl) {
            console.log('   ❌ BUG: Sub and Dub return the same URL!');
        } else {
            console.log('   ✅ Sub and Dub have different URLs');
            console.log(`      Sub: ${subUrl?.substring(0, 60)}...`);
            console.log(`      Dub: ${dubUrl?.substring(0, 60)}...`);
        }
    } else if (subStream.sources.length > 0) {
        console.log('   ✅ Sub available, Dub not available (different URLs confirmed)');
    } else {
        console.log('   ℹ️ Dub available, Sub not available (unexpected)');
    }
    
    // Test with another anime
    console.log('\n\n=== Testing with Demon Slayer ===\n');
    const dsId = 'kimetsu-no-yaiba';
    
    console.log(`Testing with anime: ${dsId}\n`);
    
    const dsEpisodes = await source.getEpisodes(`gogoanime-${dsId}`);
    console.log(`   Episodes returned: ${dsEpisodes.length}`);
    
    if (dsEpisodes.length > 0) {
        const dsFirstEp = dsEpisodes[0];
        console.log(`   First episode: ${dsFirstEp.id}`);
        
        console.log('\n   Testing SUB...');
        const dsSub = await source.getStreamingLinks(dsFirstEp.id, undefined, 'sub');
        console.log(`   Sources: ${dsSub.sources.length}`);
        
        console.log('\n   Testing DUB...');
        const dsDub = await source.getStreamingLinks(dsFirstEp.id, undefined, 'dub');
        console.log(`   Sources: ${dsDub.sources.length}`);
        
        if (dsSub.sources.length > 0 && dsDub.sources.length > 0) {
            const same = dsSub.sources[0]?.url === dsDub.sources[0]?.url;
            console.log(`\n   ${same ? '❌ BUG:' : '✅ OK:'} Sub and Dub ${same ? 'are the same' : 'are different'}`);
        }
    }
    
    console.log('\n=== Test Complete ===');
}

testDubSubFix()
    .then(() => process.exit(0))
    .catch(e => {
        console.error('Test failed:', e);
        process.exit(1);
    });
