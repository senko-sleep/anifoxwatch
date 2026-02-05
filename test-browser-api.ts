import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

async function testBrowserAPI() {
    console.log('🧪 Testing Browser API Endpoints...\n');

    const testCases = [
        {
            name: 'Basic Browse (No Filters)',
            endpoint: '/api/anime/browse?sort=popularity&page=1&limit=25'
        },
        {
            name: 'Trending Sort',
            endpoint: '/api/anime/browse?sort=trending&page=1&limit=25'
        },
        {
            name: 'Recently Released Sort',
            endpoint: '/api/anime/browse?sort=recently_released&page=1&limit=25'
        },
        {
            name: 'Shuffle Sort',
            endpoint: '/api/anime/browse?sort=shuffle&page=1&limit=25'
        },
        {
            name: 'Type Filter (TV)',
            endpoint: '/api/anime/browse?type=TV&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Type Filter (Movie)',
            endpoint: '/api/anime/browse?type=Movie&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Status Filter (Ongoing)',
            endpoint: '/api/anime/browse?status=Ongoing&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Status Filter (Completed)',
            endpoint: '/api/anime/browse?status=Completed&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Genre Filter (Action)',
            endpoint: '/api/anime/browse?genre=Action&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Genre Filter (Romance)',
            endpoint: '/api/anime/browse?genre=Romance&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Year Filter (2024)',
            endpoint: '/api/anime/browse?year=2024&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Year Filter (2023)',
            endpoint: '/api/anime/browse?year=2023&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Date Range Filter (2020-2024)',
            endpoint: '/api/anime/browse?startYear=2020&endYear=2024&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Multiple Filters (TV + Action + 2024)',
            endpoint: '/api/anime/browse?type=TV&genre=Action&year=2024&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Multiple Filters (Movie + Romance + Completed)',
            endpoint: '/api/anime/browse?type=Movie&genre=Romance&status=Completed&sort=popularity&page=1&limit=25'
        },
        {
            name: 'WatchHentai - Adult Mode Browse',
            endpoint: '/api/anime/browse?mode=adult&sort=popularity&page=1&limit=25'
        },
        {
            name: 'WatchHentai - Adult Mode Search',
            endpoint: '/api/anime/search?q=yuri&mode=adult&page=1'
        },
        {
            name: 'WatchHentai - Explicit Source',
            endpoint: '/api/anime/browse?source=WatchHentai&sort=popularity&page=1&limit=25'
        },
        {
            name: 'WatchHentai - Genre Filter (Yuri)',
            endpoint: '/api/anime/browse?mode=adult&genre=Yuri&sort=popularity&page=1&limit=25'
        },
        {
            name: 'Mixed Mode - Safe + Adult',
            endpoint: '/api/anime/browse?mode=mixed&sort=popularity&page=1&limit=25'
        }
    ];

    for (const testCase of testCases) {
        console.log(`📋 Testing: ${testCase.name}`);
        console.log(`   Endpoint: ${testCase.endpoint}`);

        try {
            const response = await fetch(`${API_BASE}${testCase.endpoint}`);
            const data = await response.json();

            if (response.ok) {
                console.log(`   ✅ Success: ${data.results?.length || 0} results found`);
                console.log(`   📊 Total Results: ${data.totalResults || 0}`);
                console.log(`   📄 Total Pages: ${data.totalPages || 0}`);
                console.log(`   📋 Has Next Page: ${data.hasNextPage || false}`);

                if (data.results && data.results.length > 0) {
                    console.log(`   🎯 Sample Results:`);
                    data.results.slice(0, 3).forEach((anime: any, index: number) => {
                        console.log(`      ${index + 1}. ${anime.title} (${anime.type}, ${anime.year}, ${anime.status})`);
                    });
                }
            } else {
                console.log(`   ❌ HTTP Error: ${response.status} - ${response.statusText}`);
                console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
            }
        } catch (error) {
            console.log(`   ❌ Network Error: ${(error as Error).message}`);
        }

        console.log('   ' + '='.repeat(50) + '\n');
    }
}

// Run the test
testBrowserAPI().catch(console.error);