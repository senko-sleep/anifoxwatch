/**
 * API Endpoint Checker - Tests various anime API endpoints
 */
import axios from 'axios';

const APIS_TO_TEST = [
    // Aniwatch API instances (hianime.to)
    { name: 'Aniwatch Render 1', url: 'https://aniwatch-api-cranci.vercel.app/api/v2/hianime/home' },
    { name: 'Aniwatch Render 2', url: 'https://aniwatch-api-v2.vercel.app/api/v2/hianime/home' },
    { name: 'Aniwatch Main', url: 'https://aniwatch-api.onrender.com/api/v2/hianime/home' },
    // Try the standard render format
    { name: 'Aniwatch API', url: 'https://api-aniwatch.onrender.com/api/v2/hianime/home' },
    // Old Consumet API (likely dead)
    { name: 'Consumet Org', url: 'https://api.consumet.org/anime/gogoanime/recent-episodes' },
    // Some community hosts
    { name: 'Amvstr API', url: 'https://api.amvstr.me/api/v2/trending?page=1&perPage=10' },
    { name: 'Zoro API 1', url: 'https://zoro-api.onrender.com/api/v2/hianime/home' },
];

async function testAPI(name: string, url: string): Promise<boolean> {
    try {
        console.log(`Testing ${name}...`);
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AniStreamHub/1.0'
            }
        });

        if (response.status === 200 && response.data) {
            console.log(`  ✅ ${name} is WORKING!`);
            console.log(`     Status: ${response.status}`);
            console.log(`     Data preview:`, JSON.stringify(response.data).substring(0, 200) + '...');
            return true;
        } else {
            console.log(`  ❌ ${name} returned status ${response.status} but no data`);
            return false;
        }
    } catch (error: any) {
        console.log(`  ❌ ${name} FAILED: ${error.message || error}`);
        if (error.response) {
            console.log(`     Status: ${error.response.status}`);
        }
        return false;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('ANIME API ENDPOINT CHECKER');
    console.log('='.repeat(60));
    console.log('');

    const workingAPIs: string[] = [];

    for (const api of APIS_TO_TEST) {
        const isWorking = await testAPI(api.name, api.url);
        if (isWorking) {
            workingAPIs.push(`${api.name}: ${api.url}`);
        }
        console.log('');
    }

    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    if (workingAPIs.length > 0) {
        console.log(`\n✅ Working APIs (${workingAPIs.length}):`);
        workingAPIs.forEach(api => console.log(`   - ${api}`));
    } else {
        console.log('\n❌ No working APIs found!');
        console.log('\nRecommendation: You need to self-host an Aniwatch API instance.');
        console.log('See: https://github.com/ghoshRitesh12/aniwatch-api');
    }
}

main().catch(console.error);
