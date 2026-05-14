import axios from 'axios';

async function testRotation() {
    const baseUrl = 'https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io';
    // This was the failing mirror
    const failingUrl = 'https://z78.megaup.cc/c6/h1ca5287751bdc312a5ca0c70e3955fb57d7fbaa16f8766cf87d32bde111f6e607522a875cf0d45b4a84ed386bf9e2b2ad266baf0c4eb2494622e4f18f02605b808cd894dc9741891ad71f89ae7/4/aGxzLzEwODAvMDAwMA.gif';
    // Let's try to rotate it manually to 'rrr'
    const rotatedUrl = failingUrl.replace('z78', 'rrr');
    
    const referer = 'https://megaup.nl/';
    
    console.log(`Testing rotation for failing mirror: ${new URL(failingUrl).hostname}`);

    const tryProxy = async (target: string) => {
        const url = `${baseUrl}/api/stream/proxy?url=${encodeURIComponent(target)}&referer=${encodeURIComponent(referer)}`;
        console.log(`GET ${url}`);
        try {
            const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            console.log(`✅ SUCCESS [${new URL(target).hostname}]: Status ${resp.status}, Length ${resp.data.byteLength}`);
            return true;
        } catch (err: any) {
            console.error(`❌ FAILED [${new URL(target).hostname}]: Status ${err.response?.status || err.code}`);
            return false;
        }
    };

    console.log('\n--- Attempting failing mirror ---');
    await tryProxy(failingUrl);

    console.log('\n--- Attempting rotated mirror (rrr) ---');
    await tryProxy(rotatedUrl);
    
    console.log('\n--- Attempting another mirror (xm8) ---');
    await tryProxy(failingUrl.replace('z78', 'xm8'));
}

testRotation();
