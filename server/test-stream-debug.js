/**
 * Test streaming API with more detailed debugging
 */

const API_BASE = process.env.API_BASE || 'https://anifoxwatch-api.anifoxwatch.workers.dev';

// Test various episode ID formats to find one that works
const testEpisodes = [
    // Current failing one
    'spy-x-family-part-2-18152?ep=94682',
    'spy-x-family-part-2-18152?ep=94388',
    // Different slug format
    'spy-x-family-part-2-18152$ep=94682$token=abc',
    'spy-x-family-part-2-18152$ep=94388$token=abc',
    // Kaido format
    'kaido-spy-x-family-part-2-18152?ep=94682',
];

async function test() {
    console.log('Testing different episode ID formats...\n');
    
    for (const episodeId of testEpisodes) {
        console.log(`=== Testing: ${episodeId} ===`);
        
        const streamUrl = `${API_BASE}/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub`;
        
        try {
            const streamRes = await fetch(streamUrl);
            const streamData = await streamRes.json();
            
            console.log(`Status: ${streamRes.status}`);
            console.log(`Sources: ${streamData.sources?.length || 0}`);
            console.log(`Error: ${streamData.error || 'none'}`);
            console.log(`Source used: ${streamData.source}`);
            
            if (streamData.sources?.length > 0) {
                console.log(`First source URL: ${streamData.sources[0].url?.substring(0, 80)}...`);
                console.log(`First quality: ${streamData.sources[0].quality}`);
            }
        } catch (err) {
            console.error(`Error: ${err.message}`);
        }
        
        console.log('');
    }
}

test();
