import { WatchHentaiSource } from '../../../server/src/sources/watchhentai-source.js';

async function testWatchHentaiStreaming() {
    console.log('=== Testing WatchHentai Search ===\n');
    const source = new WatchHentaiSource();

    try {
        // Test search functionality with age verification bypass
        console.log('Testing search for "boku no pico" with age verification bypass:');
        const searchResults = await source.search('boku no pico', 1);
        console.log(`Search results found: ${searchResults.results.length}`);
        searchResults.results.forEach((result, index) => {
            console.log(`${index + 1}. ${result.title} (${result.id})`);
        });
        
        // Test with the actual title that was found
        console.log('\nTesting search for "shounen ga otona":');
        const shounenResults = await source.search('shounen ga otona', 1);
        console.log(`Search results found: ${shounenResults.results.length}`);
        shounenResults.results.forEach((result, index) => {
            console.log(`${index + 1}. ${result.title} (${result.id})`);
        });
        
    } catch (error: any) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testWatchHentaiStreaming().catch(console.error);