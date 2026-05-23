import { AkiHSource } from '../sources/akih-source';
import { WatchHentaiSource } from '../sources/watchhentai-source';

async function testAkiHStreaming() {
    console.log('=== Testing AkiH Streaming ===\n');
    const source = new AkiHSource();

    // Test with a known video ID from the earlier test
    const videoId = 'gVeegWqZIw';
    const episodeId = `akih-video/${videoId}`;

    console.log(`Testing streaming for video ID: ${videoId}`);
    console.log(`Episode ID: ${episodeId}\n`);

    try {
        const streamingData = await source.getStreamingLinks(episodeId);
        console.log(`Sources found: ${streamingData.sources.length}`);
        
        if (streamingData.sources.length > 0) {
            console.log('\n✅ SUCCESS - Streaming sources found:');
            streamingData.sources.forEach((s, i) => {
                console.log(`  ${i + 1}. Quality: ${s.quality}`);
                console.log(`     URL: ${s.url}`);
                console.log(`     M3U8: ${s.isM3U8}, DASH: ${s.isDASH}`);
            });
        } else {
            console.log('❌ No streaming sources found');
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

async function testWatchHentaiStreaming() {
    console.log('\n=== Testing WatchHentai Streaming ===\n');
    const source = new WatchHentaiSource();

    // Use an episode ID from the earlier test
    const episodeId = 'watchhentai-videos/muchuu-no-tou-episode-1';

    console.log(`Testing streaming for episode ID: ${episodeId}\n`);

    try {
        const streamingData = await source.getStreamingLinks(episodeId);
        console.log(`Sources found: ${streamingData.sources.length}`);
        
        if (streamingData.sources.length > 0) {
            console.log('\n✅ SUCCESS - Streaming sources found:');
            streamingData.sources.forEach((s, i) => {
                console.log(`  ${i + 1}. Quality: ${s.quality}`);
                console.log(`     URL: ${s.url}`);
                console.log(`     M3U8: ${s.isM3U8}, DASH: ${s.isDASH}`);
            });
        } else {
            console.log('❌ No streaming sources found');
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

async function main() {
    try {
        await testAkiHStreaming();
        await testWatchHentaiStreaming();
        console.log('\n=== All streaming tests completed ===');
    } catch (error) {
        console.error('Test error:', error);
    }
}

main().catch(console.error);