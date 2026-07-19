import axios from 'axios';

async function testLocalApi() {
    try {
        console.log('Fetching watch route from local API on port 3001 with nocache=true...');
        const res = await axios.get('http://127.0.0.1:3001/api/stream/watch/anilist-207141?nocache=true', { timeout: 10000 });
        console.log('Status:', res.status);
        console.log('Response:', JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error('Failed to connect to local API:', e.message);
    }
}

testLocalApi();
