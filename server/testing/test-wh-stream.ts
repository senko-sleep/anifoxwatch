/**
 * Test WatchHentai streaming extraction
 */
import { WatchHentaiSource } from '../src/sources/watchhentai-source.js';

async function testStream() {
    console.log('Testing WatchHentai streaming extraction...\n');

    const source = new WatchHentaiSource();

    // Test getEpisodes
    const animeId = 'watchhentai-series/boku-dake-no-hentai-kanojo-the-animation-id-01';
    console.log('1. Testing getEpisodes...');
    const episodes = await source.getEpisodes(animeId);
    console.log(`   Found ${episodes.length} episodes`);

    if (episodes.length > 0) {
        const ep = episodes[0];
        console.log(`   First episode: ${ep.id} - ${ep.title}`);

        // Test getStreamingLinks
        console.log('\n2. Testing getStreamingLinks...');
        console.log('   (This may take a while as it uses Puppeteer)');
        try {
            const streamData = await source.getStreamingLinks(ep.id, undefined, 'sub');
            console.log(`   Sources found: ${streamData.sources.length}`);
            if (streamData.sources.length > 0) {
                console.log(`   First source URL: ${streamData.sources[0].url.substring(0, 100)}...`);
                console.log(`   Quality: ${streamData.sources[0].quality}`);
                console.log(`   Is M3U8: ${streamData.sources[0].isM3U8}`);
            }
        } catch (error: any) {
            console.error(`   Error: ${error.message}`);
        }
    }
}

testStream().catch(console.error);
