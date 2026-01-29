import { sourceManager } from './server/src/services/source-manager.js';

async function testBrowserFilters() {
    console.log('🧪 Testing Browser Filters...\n');

    // Test different filter combinations
    const testCases = [
        {
            name: 'Basic Browse (No Filters)',
            filters: { sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Trending Sort',
            filters: { sort: 'trending', page: 1, limit: 25 }
        },
        {
            name: 'Recently Released Sort',
            filters: { sort: 'recently_released', page: 1, limit: 25 }
        },
        {
            name: 'Shuffle Sort',
            filters: { sort: 'shuffle', page: 1, limit: 25 }
        },
        {
            name: 'Type Filter (TV)',
            filters: { type: 'TV', sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Type Filter (Movie)',
            filters: { type: 'Movie', sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Status Filter (Ongoing)',
            filters: { status: 'Ongoing', sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Status Filter (Completed)',
            filters: { status: 'Completed', sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Genre Filter (Action)',
            filters: { genre: 'Action', sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Genre Filter (Romance)',
            filters: { genre: 'Romance', sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Year Filter (2024)',
            filters: { year: 2024, sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Year Filter (2023)',
            filters: { year: 2023, sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Date Range Filter (2020-2024)',
            filters: { startYear: 2020, endYear: 2024, sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Multiple Filters (TV + Action + 2024)',
            filters: { type: 'TV', genre: 'Action', year: 2024, sort: 'popularity', page: 1, limit: 25 }
        },
        {
            name: 'Multiple Filters (Movie + Romance + Completed)',
            filters: { type: 'Movie', genre: 'Romance', status: 'Completed', sort: 'popularity', page: 1, limit: 25 }
        }
    ];

    for (const testCase of testCases) {
        console.log(`📋 Testing: ${testCase.name}`);
        console.log(`   Filters: ${JSON.stringify(testCase.filters)}`);

        try {
            const result = await sourceManager.browseAnime(testCase.filters);
            console.log(`   ✅ Success: ${result.anime.length} results found`);
            console.log(`   📊 Total Results: ${result.totalResults}`);
            console.log(`   📄 Total Pages: ${result.totalPages}`);
            console.log(`   📋 Has Next Page: ${result.hasNextPage}`);

            if (result.anime.length > 0) {
                console.log(`   🎯 Sample Results:`);
                result.anime.slice(0, 3).forEach((anime, index) => {
                    console.log(`      ${index + 1}. ${anime.title} (${anime.type}, ${anime.year}, ${anime.status})`);
                });
            }
        } catch (error) {
            console.log(`   ❌ Failed: ${(error as Error).message}`);
        }

        console.log('   ' + '='.repeat(50) + '\n');
    }

    // Test source health
    console.log('🏥 Testing Source Health...\n');
    const healthStatus = await sourceManager.checkAllHealth();
    healthStatus.forEach(source => {
        console.log(`${source.name}: ${source.status} (${source.latency}ms)`);
    });
}

// Run the test
testBrowserFilters().catch((error) => console.error('Test failed:', error));
