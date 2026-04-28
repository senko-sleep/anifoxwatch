import { AnikaiSource } from './server/src/sources/anikai-source.js';

async function testNewSource() {
    console.log('Testing Anikai source...');

    const source = new AnikaiSource();

    // Test health check
    console.log('\n1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`Healthy: ${isHealthy}`);

    if (!isHealthy) {
        console.error('Health check failed');
        return;
    }

    // Test getting anime info from the URL
    console.log('\n2. Testing getting anime info for spy-x-family-season-3-v2q8:');
    try {
        const anime = await source.getAnime('anikai-spy-x-family-season-3-v2q8');
        console.log(`Anime: ${anime?.title}`);
        console.log(`Episodes: ${anime?.episodes}`);
    } catch (error: any) {
        console.error('Get anime failed:', error.message);
    }

    // Test getting episodes
    console.log('\n3. Testing getting episodes:');
    try {
        const episodes = await source.getEpisodes('anikai-spy-x-family-season-3-v2q8');
        console.log(`Found ${episodes.length} episodes`);
        if (episodes.length > 0) {
            console.log(`First episode: ${episodes[0].title} (ID: ${episodes[0].id})`);
        }
    } catch (error: any) {
        console.error('Get episodes failed:', error.message);
    }

    // Test streaming
    console.log('\n4. Testing streaming for episode 1:');
    try {
        const streamingData = await source.getStreamingLinks('anikai-spy-x-family-season-3-v2q8#ep=1');
        console.log(`Sources found: ${streamingData.sources.length}`);
        if (streamingData.sources.length > 0) {
            console.log(`First source: ${streamingData.sources[0].url}`);
        }
    } catch (error: any) {
        console.error('Streaming failed:', error.message);
    }
}

testNewSource().catch(error => {
    console.error('Test failed:', error);
});