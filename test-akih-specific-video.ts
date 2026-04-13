import { AkiHSource } from './server/src/sources/akih-source';

async function testSpecificVideo() {
    console.log('Testing Aki-H stream extraction for specific video: gVeegWqZIw');

    const source = new AkiHSource();

    // Test health check
    console.log('\n1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`Healthy: ${isHealthy}`);

    if (!isHealthy) {
        console.error('Health check failed - cannot continue tests');
        return;
    }

    // Test with the specific video ID from the URL
    // URL: https://aki-h.com/videos/gVeegWqZIw/
    // Video ID: gVeegWqZIw
    const videoId = 'gVeegWqZIw';
    const episodeId = `akih-video/${videoId}`;

    console.log(`\n2. Testing stream extraction for video ID: ${videoId}`);
    console.log(`Episode ID: ${episodeId}`);

    try {
        const streamingData = await source.getStreamingLinks(episodeId);
        console.log(`\n3. Streaming sources found: ${streamingData.sources.length}`);
        
        if (streamingData.sources.length > 0) {
            console.log('\n✅ SUCCESS - Streaming sources found:');
            streamingData.sources.forEach((source, index) => {
                console.log(`\n  Source ${index + 1}:`);
                console.log(`    Quality: ${source.quality}`);
                console.log(`    URL: ${source.url}`);
                console.log(`    M3U8: ${source.isM3U8}`);
                console.log(`    DASH: ${source.isDASH}`);
            });
            console.log(`\nTotal sources: ${streamingData.sources.length}`);
            console.log(`Subtitles: ${streamingData.subtitles.length}`);
            console.log(`Source provider: ${streamingData.source}`);
        } else {
            console.log('❌ No streaming sources found');
        }
    } catch (error: any) {
        console.error('❌ Error getting streaming links:', error.message);
        console.error('Stack:', error.stack);
    }

    // Also test getting episode servers
    console.log(`\n4. Testing episode servers for: ${episodeId}`);
    try {
        const servers = await source.getEpisodeServers(episodeId);
        console.log(`Servers found: ${servers.length}`);
        servers.forEach(server => {
            console.log(`  - ${server.name} (${server.type}): ${server.url}`);
        });
    } catch (error: any) {
        console.error('Error getting servers:', error.message);
    }

    // Test with full URL as well
    console.log(`\n5. Testing with full URL as episode ID`);
    const fullUrlEpisodeId = 'akih-video/https://aki-h.com/videos/gVeegWqZIw/';
    try {
        const streamingData2 = await source.getStreamingLinks(fullUrlEpisodeId);
        console.log(`Streaming sources found: ${streamingData2.sources.length}`);
        if (streamingData2.sources.length > 0) {
            console.log('✅ Full URL method also works');
        }
    } catch (error: any) {
        console.error('Full URL method failed:', error.message);
    }
}

// Run the test
testSpecificVideo().catch(error => {
    console.error('\nFatal error during test:', error);
});
