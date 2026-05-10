import axios from 'axios';

async function test() {
    const remoteProxy = 'https://anifoxwatch.vercel.app/api/stream/proxy';
    const testUrl = 'https://www.google.com';
    try {
        const resp = await axios.get(`${remoteProxy}?url=${encodeURIComponent(testUrl)}`, { timeout: 10000 });
        console.log(`Remote proxy status: ${resp.status}`);
    } catch (err) {
        console.error(`Remote proxy failed: ${err.message}`);
    }
}

test();
