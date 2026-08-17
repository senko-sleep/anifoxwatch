import { WatchHentaiSource } from '../sources/watchhentai-source.js';

async function testWatchHentaiStreaming() {
    console.log('=== Testing WatchHentai Streaming ===\n');
    const source = new WatchHentaiSource();

    try {
        const latest = await source.getLatest(1);
        if (latest.length > 0) {
            const sample = latest[0];
            console.log(`Testing streaming for: ${sample.title} (${sample.id})`);
            const streamingData = await source.getStreamingLinks(sample.id);
            console.log(`Sources found: ${streamingData.sources.length}`);
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

testWatchHentaiStreaming().catch(console.error);