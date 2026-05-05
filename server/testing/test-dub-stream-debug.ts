import { GogoanimeSource } from '../src/sources/gogoanime-source.js';

async function testDubDebug() {
    console.log('=== Debug Dub Streaming ===\n');
    
    const source = new GogoanimeSource();
    
    // Test with an anime known to have dub
    const testCases = [
        { animeId: 'naruto', epNum: 1, name: 'Naruto' },
        { animeId: 'one-piece', epNum: 1, name: 'One Piece' },
        { animeId: 'bleach', epNum: 1, name: 'Bleach' },
    ];
    
    for (const test of testCases) {
        console.log(`\n--- Testing ${test.name} Episode ${test.epNum} ---`);
        const epId = `${test.animeId}-episode-${test.epNum}`;
        
        console.log('1. Testing SUB...');
        const subStream = await source.getStreamingLinks(epId, undefined, 'sub');
        console.log(`   Sources: ${subStream.sources.length}`);
        if (subStream.sources.length > 0) {
            console.log(`   URL: ${subStream.sources[0].url?.substring(0, 80)}...`);
        }
        
        console.log('2. Testing DUB...');
        const dubStream = await source.getStreamingLinks(epId, undefined, 'dub');
        console.log(`   Sources: ${dubStream.sources.length}`);
        if (dubStream.sources.length > 0) {
            console.log(`   URL: ${dubStream.sources[0].url?.substring(0, 80)}...`);
        }
        
        // Check if dub ID transformation is working
        const expectedDubId = `${test.animeId}-dub-episode-${test.epNum}`;
        console.log(`3. Dub ID should be: ${expectedDubId}`);
        
        // Compare
        if (subStream.sources.length > 0 && dubStream.sources.length > 0) {
            const same = subStream.sources[0].url === dubStream.sources[0].url;
            console.log(`4. Result: ${same ? '❌ SAME URL (BUG)' : '✅ Different URLs'}`);
        } else if (subStream.sources.length > 0 && dubStream.sources.length === 0) {
            console.log('4. Result: ℹ️ Sub available, Dub not available');
        } else if (subStream.sources.length === 0 && dubStream.sources.length > 0) {
            console.log('4. Result: ℹ️ Dub available, Sub not available (weird)');
        } else {
            console.log('4. Result: ❌ Neither available');
        }
    }
    
    console.log('\n=== Done ===');
}

testDubDebug()
    .then(() => process.exit(0))
    .catch(e => {
        console.error('Error:', e);
        process.exit(1);
    });
