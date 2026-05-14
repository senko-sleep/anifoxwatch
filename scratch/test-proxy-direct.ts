import axios from 'axios';

async function testProxy() {
    const baseUrl = 'https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io';
    const targetUrl = 'https://rrr.megaup.cc/pz78/c6/h1ca5287751bdc312a5ca0c70e3955fb57d7fbaa16f8766cf87d32bde111f6e607522a875cf0d45b4a84ed386bf9e2b2ad266baf0c4eb2494622e4f18f02605b808cd894dc9741891ad71f89ae7/list,WuxrIQT2oR6y.m3u8';
    const referer = 'https://megaup.nl/';
    
    console.log(`Testing proxy for: ${targetUrl}`);

    try {
        // 1. Get Master Playlist
        const url = `${baseUrl}/api/stream/proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}`;
        const response = await axios.get(url);
        
        // 2. Get Level Playlist
        const lines = response.data.split('\n');
        const levelUrl = lines.find((l: string) => l.includes('/api/stream/proxy?url='));
        if (!levelUrl) throw new Error('No level playlist found');
        
        console.log(`\nFetching Level Playlist: ${levelUrl}`);
        const levelResponse = await axios.get(levelUrl);
        
        // 3. Get real segment
        const levelLines = levelResponse.data.split('\n');
        const segmentUrl = levelLines.find((l: string) => l.includes('/api/stream/proxy?url='));
        if (!segmentUrl) throw new Error('No segment found in level playlist');
        
        console.log(`\nFetching Segment: ${segmentUrl}`);
        const segResponse = await axios.get(segmentUrl, { responseType: 'arraybuffer' });
        
        console.log('\n✅ SUCCESS:');
        console.log('Segment Status:', segResponse.status);
        console.log('Segment Content-Type:', segResponse.headers['content-type']);
        console.log('Segment Length:', segResponse.data.byteLength);

    } catch (error: any) {
        console.error('\n❌ PROXY ERROR:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            try {
                const errData = Buffer.from(error.response.data).toString();
                console.error(errData);
            } catch {
                console.error('[Binary data]');
            }
        } else {
            console.error(error.message);
        }
    }
}

testProxy();
