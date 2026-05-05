import axios from 'axios';

const epId = 'one-piece-dk6r$ep=1$token=coDh9_Ly6U1W8Visvd';

// Try various API endpoints
const endpoints = [
    `https://animekai.to/ajax/episode/list?episode_id=${encodeURIComponent(epId)}`,
    `https://animekai.to/ajax/server/list?episode_id=${encodeURIComponent(epId)}`,
    `https://animekai.to/api/servers?episode_id=${encodeURIComponent(epId)}`,
    `https://animekai.to/ajax/episode/servers?id=${encodeURIComponent(epId)}`,
];

async function testEndpoint(url) {
    console.log(`\nTesting: ${url.substring(0, 70)}...`);
    try {
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/javascript, */*',
                'Referer': 'https://animekai.to/',
                'X-Requested-With': 'XMLHttpRequest',
            },
            timeout: 10000,
        });
        console.log('Status:', resp.status);
        console.log('Type:', typeof resp.data);
        if (typeof resp.data === 'object') {
            console.log('Keys:', Object.keys(resp.data));
            console.log('Data:', JSON.stringify(resp.data).substring(0, 500));
        } else {
            console.log('HTML/Text:', String(resp.data).substring(0, 300));
        }
    } catch (err) {
        console.log('Error:', err.response?.status || err.message);
    }
}

// Test all endpoints
for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
}
