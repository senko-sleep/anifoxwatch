import { AkiHSource } from './server/src/sources/akih-source';

async function testAkiHGenrePagination() {
    console.log('Testing AkiHSource genre pagination with deduplication check');

    const source = new AkiHSource();

    // Test health check
    console.log('\n1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`Healthy: ${isHealthy}`);

    if (!isHealthy) {
        console.error('Health check failed - cannot continue tests');
        return;
    }

    // Test genre page 1
    console.log('\n2. Testing genre page 1 (yuri):');
    const page1Result = await source.getByGenre('yuri', 1);
    console.log(`Results: ${page1Result.results.length}`);
    console.log(`Current page: ${page1Result.currentPage}`);
    console.log(`Total pages: ${page1Result.totalPages}`);
    console.log(`Has next page: ${page1Result.hasNextPage}`);

    if (page1Result.results.length > 0) {
        console.log('\nSample page 1 results:');
        page1Result.results.slice(0, 3).forEach((anime, index) => {
            console.log(`${index + 1}. ${anime.title} (ID: ${anime.id})`);
        });
    }

    // Test genre page 2
    console.log('\n3. Testing genre page 2 (yuri):');
    const page2Result = await source.getByGenre('yuri', 2);
    console.log(`Results: ${page2Result.results.length}`);
    console.log(`Current page: ${page2Result.currentPage}`);
    console.log(`Total pages: ${page2Result.totalPages}`);
    console.log(`Has next page: ${page2Result.hasNextPage}`);

    if (page2Result.results.length > 0) {
        console.log('\nSample page 2 results:');
        page2Result.results.slice(0, 3).forEach((anime, index) => {
            console.log(`${index + 1}. ${anime.title} (ID: ${anime.id})`);
        });
    }

    // Verify results are different between pages (deduplication check)
    if (page1Result.results.length > 0 && page2Result.results.length > 0) {
        const page1Ids = page1Result.results.map(a => a.id);
        const page2Ids = page2Result.results.map(a => a.id);

        const overlappingIds = page1Ids.filter(id => page2Ids.includes(id));
        console.log(`\n=== DEDUPLICATION CHECK ===`);
        console.log(`Page 1 IDs: ${page1Ids.length}`);
        console.log(`Page 2 IDs: ${page2Ids.length}`);
        console.log(`Overlapping results between pages: ${overlappingIds.length}`);

        if (overlappingIds.length > 0) {
            console.log('⚠️  WARNING: Found overlapping results:');
            overlappingIds.forEach(id => console.log(`  - ${id}`));
        } else {
            console.log('✅ No overlapping results - pagination working correctly');
        }
    }

    // Test multiple genres to ensure pagination works
    console.log('\n4. Testing genre pagination for "3d":');
    const genre3dPage1 = await source.getByGenre('3d', 1);
    console.log(`3D Genre Page 1: ${genre3dPage1.results.length} results`);
    
    if (genre3dPage1.hasNextPage) {
        const genre3dPage2 = await source.getByGenre('3d', 2);
        console.log(`3D Genre Page 2: ${genre3dPage2.results.length} results`);
        
        const page1Ids = genre3dPage1.results.map(a => a.id);
        const page2Ids = genre3dPage2.results.map(a => a.id);
        const overlapping = page1Ids.filter(id => page2Ids.includes(id));
        console.log(`3D Genre Overlapping: ${overlapping.length} items`);
    }
}

// Run the test
testAkiHGenrePagination().catch(error => {
    console.error('\nError during test:', error);
    if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
        if (error.response.data) {
            console.error('Response data snippet:', error.response.data.substring(0, 500));
        }
    }
});
