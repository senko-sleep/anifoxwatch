import { AkiHSource } from './server/src/sources/akih-source';

async function testAkiHDirect() {
    console.log('Testing AkiHSource directly...');

    const source = new AkiHSource();

    // Test health check
    console.log('\n1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`Healthy: ${isHealthy}`);

    if (!isHealthy) {
        console.error('Health check failed - cannot continue tests');
        return;
    }

    // Test getLatest
    console.log('\n2. Testing getLatest:');
    try {
        const latest = await source.getLatest(1);
        console.log(`Results: ${latest.length}`);
        if (latest.length > 0) {
            console.log('\nSample results:');
            latest.slice(0, 3).forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title} (${anime.id})`);
                console.log(`   Image: ${anime.image}`);
            });
        }
    } catch (error: any) {
        console.error('Error in getLatest:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
        }
    }

    // Test search
    console.log('\n3. Testing search:');
    try {
        const searchResults = await source.search('yuri');
        console.log(`Results: ${searchResults.results.length}`);
        if (searchResults.results.length > 0) {
            console.log('\nSample search results:');
            searchResults.results.slice(0, 3).forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title}`);
            });
        }
    } catch (error: any) {
        console.error('Error in search:', error.message);
    }

    // Test genre
    console.log('\n4. Testing genre (yuri):');
    try {
        const genreResults = await source.getByGenre('yuri');
        console.log(`Results: ${genreResults.results.length}`);
        if (genreResults.results.length > 0) {
            console.log('\nSample genre results:');
            genreResults.results.slice(0, 3).forEach((anime, index) => {
                console.log(`${index + 1}. ${anime.title}`);
            });
        }
    } catch (error: any) {
        console.error('Error in genre:', error.message);
    }
}

// Run the test
testAkiHDirect().catch(error => {
    console.error('\nFatal error during test:', error);
});
