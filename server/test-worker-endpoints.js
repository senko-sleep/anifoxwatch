
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8787/api/anime'; // Assuming wrangler dev is running

async function testEndpoint(name, path) {
    console.log(`Testing ${name}...`);
    try {
        const res = await fetch(`${BASE_URL}${path}`);
        if (!res.ok) {
            console.error(`❌ ${name} failed with status ${res.status}`);
            const text = await res.text();
            console.error(text.substring(0, 200));
            return;
        }
        const data = await res.json();
        const count = data.results?.length || data.schedule?.length || 0;
        console.log(`✅ ${name} success: Found ${count} items`);
    } catch (e) {
        console.error(`❌ ${name} crashed:`, e.message);
    }
}

async function runTests() {
    await testEndpoint('Seasonal (New This Season)', '/seasonal');
    await testEndpoint('Schedule (Airing Today)', '/schedule');
    await testEndpoint('Leaderboard (Weekly Top 10)', '/leaderboard');
    await testEndpoint('Trending', '/trending');
}

runTests();
