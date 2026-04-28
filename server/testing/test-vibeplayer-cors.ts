import axios from 'axios';

async function main() {
    // Test if vibeplayer m3u8 works WITHOUT referer (direct play candidate)
    const m3u8Url = 'https://vibeplayer.site/public/stream/b1b1bcf0e7bbfcbe/master.m3u8';
    
    console.log('Test 1: No referer...');
    try {
        const r1 = await axios.get(m3u8Url, { timeout: 8000 });
        console.log('  Status:', r1.status, 'Type:', r1.headers['content-type']);
        console.log('  Content:', r1.data.slice(0, 300));
    } catch (e: any) {
        console.log('  Error:', e.message?.slice(0, 100));
    }

    console.log('\nTest 2: With anitaku.to referer...');
    try {
        const r2 = await axios.get(m3u8Url, { timeout: 8000, headers: { 'Referer': 'https://anitaku.to/' } });
        console.log('  Status:', r2.status, 'Type:', r2.headers['content-type']);
        console.log('  Content:', r2.data.slice(0, 300));
    } catch (e: any) {
        console.log('  Error:', e.message?.slice(0, 100));
    }

    // Check CORS headers
    console.log('\nTest 3: Check CORS headers...');
    try {
        const r3 = await axios.get(m3u8Url, {
            timeout: 8000,
            headers: { 'Origin': 'https://anifoxwatch.web.app' },
        });
        console.log('  Access-Control-Allow-Origin:', r3.headers['access-control-allow-origin'] || 'MISSING');
    } catch (e: any) {
        console.log('  Error:', e.message?.slice(0, 100));
    }

    // Test a segment URL
    console.log('\nTest 4: Check segment from m3u8...');
    try {
        const m3u8 = (await axios.get(m3u8Url, { timeout: 8000 })).data as string;
        const lines = m3u8.split('\n').filter((l: string) => l.trim() && !l.startsWith('#'));
        if (lines.length > 0) {
            let segUrl = lines[0];
            if (!segUrl.startsWith('http')) {
                const base = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
                segUrl = base + segUrl;
            }
            console.log('  Segment URL:', segUrl.slice(0, 120));
            const segR = await axios.get(segUrl, {
                timeout: 8000,
                responseType: 'arraybuffer',
                headers: { 'Range': 'bytes=0-1023' },
            });
            console.log('  Segment status:', segR.status, 'Size:', segR.data.byteLength, 'Type:', segR.headers['content-type']);
            console.log('  CORS:', segR.headers['access-control-allow-origin'] || 'MISSING');
        }
    } catch (e: any) {
        console.log('  Error:', e.message?.slice(0, 100));
    }

    process.exit(0);
}
main();
