import { AkiHSource } from '../sources/akih-source';
import { WatchHentaiSource } from '../sources/watchhentai-source';

async function testAkiH() {
    console.log('=== Testing Aki-H Source ===\n');
    const source = new AkiHSource();

    // Test health check
    console.log('1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`   Healthy: ${isHealthy}`);

    if (isHealthy) {
        // Test latest
        console.log('\n2. Testing getLatest:');
        const latest = await source.getLatest(1);
        console.log(`   Found ${latest.length} latest items`);
        if (latest.length > 0) {
            const sample = latest[0];
            console.log(`   Sample: ${sample.title} (ID: ${sample.id})`);
            console.log(`   Episodes: ${sample.episodes}`);
            console.log(`   Genres: ${sample.genres?.join(', ')}`);
        }

        // Test genres
        console.log('\n3. Testing getGenres:');
        const genres = await source.getGenres();
        console.log(`   Available genres: ${genres.slice(0, 10).join(', ')}... (${genres.length} total)`);

        // Test getAnime for first result
        if (latest.length > 0) {
            const sample = latest[0];
            console.log(`\n4. Testing getAnime for ${sample.id}:`);
            const anime = await source.getAnime(sample.id);
            if (anime) {
                console.log(`   Title: ${anime.title}`);
                console.log(`   Description: ${anime.description?.substring(0, 100)}...`);
            }

            // Test getEpisodes
            console.log(`\n5. Testing getEpisodes for ${sample.id}:`);
            const episodes = await source.getEpisodes(sample.id);
            console.log(`   Found ${episodes.length} episodes`);
            if (episodes.length > 0) {
                console.log(`   First episode: ${episodes[0].title} (ID: ${episodes[0].id})`);
            }
        }
    }

    console.log('\n✅ AkiH tests completed\n');
}

async function testWatchHentai() {
    console.log('=== Testing WatchHentai Source ===\n');
    const source = new WatchHentaiSource();

    // Test health check
    console.log('1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`   Healthy: ${isHealthy}`);

    if (isHealthy) {
        // Test latest
        console.log('\n2. Testing getLatest:');
        const latest = await source.getLatest(1);
        console.log(`   Found ${latest.length} latest items`);
        if (latest.length > 0) {
            const sample = latest[0];
            console.log(`   Sample: ${sample.title} (ID: ${sample.id})`);
            console.log(`   Episodes: ${sample.episodes}`);
            console.log(`   Genres: ${sample.genres?.join(', ')}`);
        }

        // Test genres
        console.log('\n3. Testing getGenres:');
        const genres = await source.getGenres();
        console.log(`   Available genres: ${genres.slice(0, 10).join(', ')}... (${genres.length} total)`);

        // Test search
        console.log('\n4. Testing search for "yuri":');
        const searchResults = await source.search('yuri', 1);
        console.log(`   Found ${searchResults.results.length} results`);
        if (searchResults.results.length > 0) {
            const sample = searchResults.results[0];
            console.log(`   Sample: ${sample.title}`);
        }

        // Test getAnime for first result
        if (latest.length > 0) {
            const sample = latest[0];
            console.log(`\n5. Testing getAnime for ${sample.id}:`);
            const anime = await source.getAnime(sample.id);
            if (anime) {
                console.log(`   Title: ${anime.title}`);
                console.log(`   Description: ${anime.description?.substring(0, 100)}...`);
            }

            // Test getEpisodes
            console.log(`\n6. Testing getEpisodes for ${sample.id}:`);
            const episodes = await source.getEpisodes(sample.id);
            console.log(`   Found ${episodes.length} episodes`);
            if (episodes.length > 0) {
                console.log(`   First episode: ${episodes[0].title} (ID: ${episodes[0].id})`);
            }
        }

        // Test getByGenre
        console.log('\n7. Testing getByGenre for "yuri":');
        const genreResults = await source.getByGenre('yuri', 1);
        console.log(`   Found ${genreResults.results.length} results for yuri genre`);
    }

    console.log('\n✅ WatchHentai tests completed\n');
}

async function main() {
    console.log('Starting hentai source tests...\n');
    console.log('=' .repeat(50) + '\n');

    try {
        await testAkiH();
    } catch (error) {
        console.error('AkiH test error:', error);
    }

    console.log('=' .repeat(50) + '\n');

    try {
        await testWatchHentai();
    } catch (error) {
        console.error('WatchHentai test error:', error);
    }

    console.log('=' .repeat(50));
    console.log('\nAll tests completed!');
}

main().catch(console.error);