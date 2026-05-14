import axios from 'axios';

async function testReferers() {
    const baseUrl = 'https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io';
    const targetUrl = 'https://rrr.megaup.cc/pz78/c6/h1ca5287751bdc312a5ca0c70e3955fb57d7fbaa16f8766cf87d32bde111f6e607522a875cf0d45b4a84ed386bf9e2b2ad266baf0c4eb2494622e4f18f02605b808cd894dc9741891ad71f89ae7/4/aGxzLzEwODAvMDAwMA.gif';
    
    const referers = [
        'https://megaup.nl/',
        'https://animekai.to/',
        'https://aniwatchtv.to/',
        'https://megacloud.blog/'
    ];
    
    console.log(`Testing referers for: ${targetUrl}`);

    for (const referer of referers) {
        console.log(`\n--- Testing Referer: ${referer} ---`);
        const url = `${baseUrl}/api/stream/proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}`;
        try {
            const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            console.log(`✅ SUCCESS: Status ${resp.status}, Length ${resp.data.byteLength}`);
        } catch (err: any) {
            console.error(`❌ FAILED: Status ${err.response?.status || err.code}`);
            if (err.response) {
                try {
                    const errBody = Buffer.from(err.response.data).toString();
                    console.error(errBody);
                } catch {}
            }
        }
    }
}

testReferers();
