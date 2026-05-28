import { AkiHSource } from './src/sources/akih-source';

async function testAkiHSearchAndStream() {
    console.log('Testing AkiH search → episodes → stream pipeline for "Shoujo Kyouiku"');

    const source = new AkiHSource();

    // Test health check
    console.log('\n1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`Healthy: ${isHealthy}`);

    if (!isHealthy) {
        console.error('Health check failed - cannot continue tests');
        return;
    }

    // Search for the anime
    console.log('\n2. Searching for "Shoujo Kyouiku":');
    try {
        const searchResults = await source.search('Shoujo Kyouiku');
        console.log(`Results: ${searchResults.results.length}`);
        
        if (searchResults.results.length > 0) {
            console.log('\nSearch results:');
            searchResults.results.forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title} (ID: ${anime.id})`);
            });

            // Use the first result
            const targetAnime = searchResults.results[0];
            console.log(`\n3. Using: ${targetAnime.title} (ID: ${targetAnime.id})`);

            // Get episodes
            console.log('\n4. Getting episodes:');
            const episodes = await source.getEpisodes(targetAnime.id);
            console.log(`Episodes found: ${episodes.length}`);
            
            if (episodes.length > 0) {
                const firstEpisode = episodes[0];
                console.log(`\n5. Testing stream for: ${firstEpisode.title} (ID: ${firstEpisode.id})`);

                // Test streaming
                const streamingData = await source.getStreamingLinks(firstEpisode.id);
                console.log(`\n6. Streaming sources found: ${streamingData.sources.length}`);
                
                if (streamingData.sources.length > 0) {
                    console.log('\n✅ SUCCESS - Streaming sources found:');
                    streamingData.sources.forEach((source, index) => {
                        console.log(`  ${index + 1}. Quality: ${source.quality}`);
                        console.log(`     URL: ${source.url.substring(0, 80)}...`);
                        console.log(`     M3U8: ${source.isM3U8}, DASH: ${source.isDASH}`);
                    });
                    console.log(`\nTotal sources: ${streamingData.sources.length}`);
                } else {
                    console.log('❌ No streaming sources found');
                }
            } else {
                console.log('No episodes found');
            }
        } else {
            console.log('No search results found');
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

testAkiHSearchAndStream().catch(error => {
    console.error('\nFatal error:', error);
});
