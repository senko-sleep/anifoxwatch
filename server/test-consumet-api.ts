async function testConsumetAPI() {
    console.log('🧪 Testing Consumet API with fetchEpisodeSources...\n');
    
    try {
        const mod = await import('@consumet/extensions');
        
        // Test AnimeKai with fetchEpisodeSources directly
        console.log('📍 Testing AnimeKai with fetchEpisodeSources...\n');
        const Provider = mod.ANIME.AnimeKai;
        const provider = new Provider();
        
        // Try to get streaming sources directly with a known episode ID format
        const testEpisodeIds = [
            'naruto-9r5k$ep=1$token=coDh9_Ly6U6v1W8Visvd',
            'naruto-9r5k?ep=1',
        ];
        
        for (const epId of testEpisodeIds) {
            console.log(`   Testing episode ID: ${epId}`);
            try {
                const sources = await provider.fetchEpisodeSources(epId);
                console.log(`   ✅ Found ${sources.sources?.length || 0} streaming sources`);
                if (sources.sources && sources.sources.length > 0) {
                    console.log(`   🎉 SUCCESS! AnimeKai works!`);
                    console.log(`   � First source: ${sources.sources[0].url?.substring(0, 80) || 'no URL'}...`);
                    console.log(`   📺 Quality: ${sources.sources[0].quality || 'auto'}`);
                    return;
                }
            } catch (error) {
                console.log(`   ❌ Failed: ${(error as Error).message}`);
            }
        }
        
        // If direct episode IDs don't work, try search first
        console.log('\n� Trying search first...\n');
        const searchResults = await provider.search('naruto');
        console.log(`   ✅ Found ${searchResults.results.length} results`);
        
        if (searchResults.results.length > 0) {
            const animeId = searchResults.results[0].id;
            console.log(`   📺 First result: ${searchResults.results[0].title} (${animeId})`);
            
            // Try to construct episode ID from search result
            const constructedEpId = `${animeId}$ep=1`;
            console.log(`   Testing constructed episode ID: ${constructedEpId}`);
            
            try {
                const sources = await provider.fetchEpisodeSources(constructedEpId);
                console.log(`   ✅ Found ${sources.sources?.length || 0} streaming sources`);
                if (sources.sources && sources.sources.length > 0) {
                    console.log(`   🎉 SUCCESS! AnimeKai works!`);
                    console.log(`   🔗 First source: ${sources.sources[0].url?.substring(0, 80) || 'no URL'}...`);
                    console.log(`   📺 Quality: ${sources.sources[0].quality || 'auto'}`);
                    return;
                }
            } catch (error) {
                console.log(`   ❌ Failed: ${(error as Error).message}`);
            }
        }
    } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`);
    }
    
    console.log('\n❌ Consumet AnimeKai failed');
}

testConsumetAPI().catch(console.error);
