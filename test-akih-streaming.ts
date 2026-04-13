import { AkiHSource } from './server/src/sources/akih-source';

async function testAkiHStreaming() {
    console.log('Testing AkiHSource streaming functionality');

    const source = new AkiHSource();

    // Test health check
    console.log('\n1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`Healthy: ${isHealthy}`);

    if (!isHealthy) {
        console.error('Health check failed - cannot continue tests');
        return;
    }

    // Get a sample anime from latest
    console.log('\n2. Getting sample anime from latest:');
    const latest = await source.getLatest(1);
    if (latest.length === 0) {
        console.error('No latest anime found');
        return;
    }

    const sampleAnime = latest[0];
    console.log(`Sample anime: ${sampleAnime.title} (ID: ${sampleAnime.id})`);

    // Get anime details
    console.log('\n3. Getting anime details:');
    const animeDetails = await source.getAnime(sampleAnime.id);
    if (animeDetails) {
        console.log(`Title: ${animeDetails.title}`);
        console.log(`Episodes: ${animeDetails.episodes}`);
        console.log(`Image: ${animeDetails.image}`);
    }

    // Get episodes
    console.log('\n4. Getting episodes:');
    const episodes = await source.getEpisodes(sampleAnime.id);
    console.log(`Episodes found: ${episodes.length}`);
    
    if (episodes.length > 0) {
        const sampleEpisode = episodes[0];
        console.log(`Sample episode: ${sampleEpisode.title} (ID: ${sampleEpisode.id})`);

        // Get episode servers
        console.log('\n5. Getting episode servers:');
        const servers = await source.getEpisodeServers(sampleEpisode.id);
        console.log(`Servers found: ${servers.length}`);
        servers.forEach(server => {
            console.log(`  - ${server.name} (${server.type})`);
        });

        // Test streaming links
        console.log('\n6. Getting streaming links:');
        try {
            const streamingData = await source.getStreamingLinks(sampleEpisode.id);
            console.log(`Sources found: ${streamingData.sources.length}`);
            
            if (streamingData.sources.length > 0) {
                console.log('\nStreaming sources:');
                streamingData.sources.forEach((source, index) => {
                    console.log(`  ${index + 1}. Quality: ${source.quality}`);
                    console.log(`     URL: ${source.url.substring(0, 80)}...`);
                    console.log(`     M3U8: ${source.isM3U8}, DASH: ${source.isDASH}`);
                });
                console.log('\n✅ Streaming working!');
            } else {
                console.log('❌ No streaming sources found');
            }
        } catch (error: any) {
            console.error('❌ Error getting streaming links:', error.message);
        }
    } else {
        console.log('No episodes found');
    }

    // Test with a specific video ID from the episode sample HTML we fetched
    console.log('\n7. Testing with known video ID from aki-h.com:');
    const knownVideoId = 'akih-video/rGjtJAOfBX';
    console.log(`Testing video ID: ${knownVideoId}`);
    
    try {
        const knownStreaming = await source.getStreamingLinks(knownVideoId);
        console.log(`Streaming sources: ${knownStreaming.sources.length}`);
        
        if (knownStreaming.sources.length > 0) {
            console.log('✅ Known video streaming working!');
            console.log('Sample stream:');
            knownStreaming.sources.slice(0, 2).forEach((source, index) => {
                console.log(`  ${index + 1}. ${source.url.substring(0, 80)}...`);
            });
        } else {
            console.log('❌ Known video no streaming sources');
        }
    } catch (error: any) {
        console.error('Error with known video:', error.message);
    }
}

// Run the test
testAkiHStreaming().catch(error => {
    console.error('\nFatal error during test:', error);
});
