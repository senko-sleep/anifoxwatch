/**
 * Test aniwatch package - check available methods
 */

async function testAniwatch(): Promise<void> {
    console.log('=== Testing aniwatch package ===');
    
    try {
        const { HiAnime } = await import('aniwatch');
        console.log('Available exports:', Object.keys(HiAnime));
        
        const scraper = new HiAnime.Scraper();
        console.log('Scraper methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(scraper)));
        
        // Check search return type
        console.log('\n1. Direct search...');
        const result = scraper.search('naruto', 1);
        console.log('Search result type:', typeof result);
        console.log('Search result keys:', Object.keys(result));
        console.log('Search result:', JSON.stringify(result).slice(0, 200));
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testAniwatch().then(() => console.log('\n=== TEST COMPLETE ===')).catch(console.error);