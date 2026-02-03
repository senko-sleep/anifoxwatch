import { WatchHentaiSource } from './server/src/sources/watchhentai-source';

async function testWatchHentaiGenreFix() {
    console.log('Testing WatchHentaiSource genre fix');

    const source = new WatchHentaiSource();

    // Test health check
    console.log('\n1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`Healthy: ${isHealthy}`);

    if (!isHealthy) {
        console.error('Health check failed - cannot continue tests');
        return;
    }

    // Test getting all available genres
    console.log('\n2. Testing getGenres():');
    const genres = await source.getGenres();
    console.log(`Found ${genres.length} genres`);
    console.log('Sample genres:', genres.slice(0, 10));

    // Check if Yuri is in the genres list
    const hasYuri = genres.some(genre => genre.toLowerCase() === 'yuri');
    console.log(`Yuri genre available: ${hasYuri}`);

    if (!hasYuri) {
        console.error('Yuri genre not found - cannot continue genre specific tests');
        return;
    }

    // Test genre search for Yuri
    console.log('\n3. Testing getByGenre("yuri"):');
    const result = await source.getByGenre('yuri');
    console.log(`Results found: ${result.results.length}`);
    console.log(`Current page: ${result.currentPage}`);
    console.log(`Total pages: ${result.totalPages}`);
    console.log(`Has next page: ${result.hasNextPage}`);

    if (result.results.length > 0) {
        console.log('\nSample results:');
        result.results.slice(0, 5).forEach((anime, index) => {
            console.log(`${index + 1}. ${anime.title}`);
            console.log(`   ID: ${anime.id}`);
            console.log(`   Image: ${anime.image}`);
            console.log(`   Episodes: ${anime.episodes}`);
        });
    }

    // Test pagination
    console.log('\n4. Testing getByGenre("yuri", page 2):');
    const page2Result = await source.getByGenre('yuri', 2);
    console.log(`Page 2 results: ${page2Result.results.length}`);
    console.log(`Current page: ${page2Result.currentPage}`);
    console.log(`Total pages: ${page2Result.totalPages}`);
    console.log(`Has next page: ${page2Result.hasNextPage}`);

    if (page2Result.results.length > 0) {
        console.log('\nSample page 2 results:');
        page2Result.results.slice(0, 3).forEach((anime, index) => {
            console.log(`${index + 1}. ${anime.title}`);
        });
    }
}

// Run the test
testWatchHentaiGenreFix().catch(error => {
    console.error('\nError during test:', error);
    if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
        if (error.response.data) {
            console.error('Response data snippet:', error.response.data.substring(0, 500));
        }
    }
});
