import axios from 'axios';

// Quick API test
const apis = [
    'https://aniwatch-api-cranci.vercel.app/api/v2/hianime/home',
    'https://aniwatch-api-v2.vercel.app/api/v2/hianime/home',
];

async function test() {
    for (const url of apis) {
        try {
            console.log('Testing:', url);
            const res = await axios.get(url, { timeout: 15000 });
            console.log('SUCCESS! Status:', res.status);
            console.log('Has data:', !!res.data);
            console.log('Data keys:', Object.keys(res.data || {}));
            console.log('Sample:', JSON.stringify(res.data).slice(0, 300));
            console.log('---');
        } catch (e: any) {
            console.log('FAILED:', e.message);
            console.log('---');
        }
    }
}

test();
