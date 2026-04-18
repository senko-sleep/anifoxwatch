/**
 * Test streaming - full demo
 */

async function testStreaming(): Promise<void> {
    console.log('=== Testing Streaming - Full Demo ===');
    
    try {
        const { HiAnime } = await import('aniwatch');
        const scraper = new HiAnime.Scraper();
        
        // Use the correct ID for demon slayer
        const animeId = 'demon-slayer-kimetsu-no-yaiba-47';
        
        // Get episodes 
        console.log('\n1. Get episodes...');
        const eps = await scraper.getEpisodes(animeId);
        console.log('Episodes structure:', typeof eps);
        console.log('Episodes keys:', Object.keys(eps));
        console.log('Episodes:', JSON.stringify(eps).slice(0, 500));
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testStreaming().then(() => console.log('\n=== TEST COMPLETE ===')).catch(console.error);