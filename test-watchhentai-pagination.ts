import { WatchHentaiSource } from './server/src/sources/watchhentai-source';

async function testWatchHentaiPagination() {
    console.log('Testing WatchHentaiSource pagination (50 results per page)');

    const source = new WatchHentaiSource();

    // Test health check
    console.log('\n1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`Healthy: ${isHealthy}`);

    if (!isHealthy) {
        console.error('Health check failed - cannot continue tests');
        return;
    }

    // Test page 1
    console.log('\n2. Testing page 1:');
    const page1Result = await source.getByGenre('yuri', 1);
    console.log(`Results: ${page1Result.results.length}`);
    console.log(`Current page: ${page1Result.currentPage}`);
    console.log(`Total pages: ${page1Result.totalPages}`);
    console.log(`Has next page: ${page1Result.hasNextPage}`);

    if (page1Result.results.length > 0) {
        console.log('\nSample page 1 results:');
        page1Result.results.slice(0, 3).forEach((anime, index) => {
            console.log(`${index + 1}. ${anime.title}`);
        });
    }

    // Test page 2
    console.log('\n3. Testing page 2:');
    const page2Result = await source.getByGenre('yuri', 2);
    console.log(`Results: ${page2Result.results.length}`);
    console.log(`Current page: ${page2Result.currentPage}`);
    console.log(`Total pages: ${page2Result.totalPages}`);
    console.log(`Has next page: ${page2Result.hasNextPage}`);

    if (page2Result.results.length > 0) {
        console.log('\nSample page 2 results:');
        page2Result.results.slice(0, 3).forEach((anime, index) => {
            console.log(`${index + 1}. ${anime.title}`);
        });
    }

    // Verify results are different between pages
    if (page1Result.results.length > 0 && page2Result.results.length > 0) {
        const page1Ids = page1Result.results.map(a => a.id);
        const page2Ids = page2Result.results.map(a => a.id);

        const overlappingIds = page1Ids.filter(id => page2Ids.includes(id));
        console.log(`\nOverlapping results between pages: ${overlappingIds.length}`);

        if (overlappingIds.length > 0) {
            console.log('Overlapping IDs:', overlappingIds);
        } else {
            console.log('✓ No overlapping results - pagination working correctly');
        }
    }

    // Test page 6 (last page)
    console.log('\n4. Testing page 6 (last page):');
    const page6Result = await source.getByGenre('yuri', 6);
    console.log(`Results: ${page6Result.results.length}`);
    console.log(`Current page: ${page6Result.currentPage}`);
    console.log(`Total pages: ${page6Result.totalPages}`);
    console.log(`Has next page: ${page6Result.hasNextPage}`);

    if (page6Result.results.length > 0) {
        console.log('\nSample page 6 results:');
        page6Result.results.slice(0, 3).forEach((anime, index) => {
            console.log(`${index + 1}. ${anime.title}`);
        });
    }
}

// Run the test
testWatchHentaiPagination().catch(error => {
    console.error('\nError during test:', error);
    if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
        if (error.response.data) {
            console.error('Response data snippet:', error.response.data.substring(0, 500));
        }
    }
});
