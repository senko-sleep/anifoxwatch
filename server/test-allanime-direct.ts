import { AllAnimeSource } from './src/sources/allanime-source.js';

async function testAllAnime() {
    console.log('🧪 Testing AllAnime source directly...\n');
    
    const source = new AllAnimeSource();
    
    // Test with a known working episode ID format
    const testCases = [
        { id: 'allanime-ReooPAxPMsHM4KPMY-1', description: 'AllAnime format from test' },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.description}`);
        console.log(`   Episode ID: ${testCase.id}`);
        
        try {
            const result = await source.getStreamingLinks(testCase.id, undefined, 'sub', { timeout: 20000 });
            console.log(`   ✅ Sources found: ${result.sources.length}`);
            if (result.sources.length > 0) {
                console.log(`   📺 Qualities: ${result.sources.map(s => s.quality).join(', ')}`);
                console.log(`   🔗 First URL: ${result.sources[0].url.substring(0, 80)}...`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
    
    // Test search to get a real anime ID
    console.log('\n\n🔍 Testing search...\n');
    try {
        const searchResult = await source.search('one piece', 1);
        console.log(`   ✅ Found ${searchResult.results.length} results`);
        if (searchResult.results.length > 0) {
            console.log(`   📺 First result: ${searchResult.results[0].title} (${searchResult.results[0].id})`);
            
            // Get episodes
            const episodes = await source.getEpisodes(searchResult.results[0].id);
            console.log(`   📺 Found ${episodes.length} episodes`);
            if (episodes.length > 0) {
                console.log(`   🎬 First episode: ${episodes[0].id}`);
                
                // Try streaming
                const streamResult = await source.getStreamingLinks(episodes[0].id);
                console.log(`   ✅ Stream sources: ${streamResult.sources.length}`);
                if (streamResult.sources.length > 0) {
                    console.log(`   🔗 First stream: ${streamResult.sources[0].url.substring(0, 80)}...`);
                }
            }
        }
    } catch (error) {
        console.log(`   ❌ Error: ${(error as Error).message}`);
    }
}

testAllAnime().catch(console.error);
