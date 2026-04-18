/**
 * Test aniwatch - async methods
 */

async function testAniwatch(): Promise<void> {
    console.log('=== Testing aniwatch async ===');
    
    try {
        const { HiAnime } = await import('aniwatch');
        const scraper = new HiAnime.Scraper();
        
        // Check what search returns - could be a Promise
        console.log('1. Testing search as Promise...');
        const searchResult = scraper.search;
        console.log('search type:', typeof searchResult);
        console.log('search:', searchResult);
        
        // Try calling with await
        console.log('\n2. Awaiting search...');
        const result = await (scraper.search as any)('naruto', 1);
        console.log('Result:', result);
        
        // Try getHomePage
        console.log('\n3. getHomePage...');
        const home = await (scraper.getHomePage as any)();
        console.log('Home:', home);
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testAniwatch().then(() => console.log('\n=== TEST COMPLETE ===')).catch(console.error);