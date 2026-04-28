import { AnimeKaiSource } from './src/sources/animekai-source.js';

async function testAnimeKai() {
    console.log('🧪 Testing AnimeKai source...\n');
    
    const source = new AnimeKaiSource();
    
    // Test health check
    console.log('🔍 Testing health check...\n');
    try {
        const isHealthy = await source.healthCheck({ timeout: 10000 });
        console.log(`   ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    } catch (error) {
        console.log(`   ❌ Error: ${(error as Error).message}`);
    }
    
    // Test search
    console.log('\n🔍 Testing search...\n');
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
                    console.log(`   📺 Quality: ${streamResult.sources[0].quality}`);
                }
            }
        }
    } catch (error) {
        console.log(`   ❌ Error: ${(error as Error).message}`);
    }
}

testAnimeKai().catch(console.error);
