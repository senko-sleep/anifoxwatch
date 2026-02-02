/**
 * Test the full streaming API flow
 */
import axios from 'axios';

async function testStreamAPI() {
    console.log('Testing WatchHentai streaming API flow...\n');

    const baseUrl = 'http://localhost:3001';
    const animeId = 'watchhentai-series/boku-dake-no-hentai-kanojo-the-animation-id-01';

    try {
        // Step 1: Get anime details
        console.log('1. Fetching anime details...');
        const animeRes = await axios.get(`${baseUrl}/api/anime?id=${encodeURIComponent(animeId)}`);
        console.log(`   Title: ${animeRes.data.title}`);
        console.log(`   Episodes: ${animeRes.data.episodes}`);

        // Step 2: Get streaming links
        console.log('\n2. Fetching streaming links...');
        const episodeId = 'watchhentai-videos/boku-dake-no-hentai-kanojo-the-animation-episode-1-uncensored-id-01';
        const streamRes = await axios.get(`${baseUrl}/api/stream/watch/${encodeURIComponent(episodeId)}`);
        console.log(`   Sources found: ${streamRes.data.sources?.length}`);

        if (streamRes.data.sources?.length > 0) {
            const source = streamRes.data.sources[0];
            console.log(`   Source URL (proxied): ${source.url.substring(0, 100)}...`);
            console.log(`   Quality: ${source.quality}`);
            console.log(`   Is M3U8: ${source.isM3U8}`);
        }

        console.log('\n✅ Full streaming flow works!');
    } catch (error: any) {
        console.error('\n❌ Error:', error.response?.data || error.message);
    }
}

testStreamAPI();
