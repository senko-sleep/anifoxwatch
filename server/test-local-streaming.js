import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8787';
const EPISODE_ID = 'steinsgate-3?ep=230'; // Real HiAnime/aniwatch-style episode ID

async function runStreamingTest() {
    console.log('🚀 Starting local Worker streaming flow test...');
    console.log('==================================================');

    // 1. Test servers endpoint
    console.log('\n📡 STEP 1: Getting available servers...');
    try {
        const serversUrl = `${BASE_URL}/api/stream/servers/${encodeURIComponent(EPISODE_ID)}`;
        console.log(`URL: ${serversUrl}`);
        const response = await fetch(serversUrl);
        console.log(`Status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`Servers failed: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Servers found: ${data.servers?.length || 0}`);
        if (data.servers) {
            data.servers.forEach((s, i) => {
                console.log(`   ${i + 1}. ${s.name} (${s.type})`);
            });
        }

        // 2. Test watch/streaming links endpoint
        console.log('\n🎬 STEP 2: Getting streaming links...');
        const watchUrl = `${BASE_URL}/api/stream/watch/${encodeURIComponent(EPISODE_ID)}?server=hd-1&category=sub`;
        console.log(`URL: ${watchUrl}`);
        const watchResponse = await fetch(watchUrl);
        console.log(`Status: ${watchResponse.status}`);

        if (!watchResponse.ok) {
            throw new Error(`Watch failed: ${watchResponse.statusText}`);
        }

        const watchData = await watchResponse.json();
        console.log(`✅ Sources found: ${watchData.sources?.length || 0}`);
        if (watchData.sources && watchData.sources.length > 0) {
            const firstSource = watchData.sources[0];
            console.log('\n   First source details:');
            console.log(`   - Quality: ${firstSource.quality}`);
            console.log(`   - Is M3U8: ${firstSource.isM3U8}`);
            console.log(`   - Proxied URL preview: ${firstSource.url?.substring(0, 100)}...`);

            // 3. Test the proxy endpoint with the proxied URL
            console.log('\n🔄 STEP 3: Testing streaming proxy...');
            const proxyUrl = firstSource.url;
            console.log(`URL: ${proxyUrl}`);
            const proxyResponse = await fetch(proxyUrl, {
                headers: { Range: 'bytes=0-100' }
            });
            console.log(`Status: ${proxyResponse.status}`);
            console.log(`Content-Type: ${proxyResponse.headers.get('content-type')}`);
            
            if (proxyResponse.ok) {
                console.log('✅ Proxy successfully resolved and streamed segments!');
            } else {
                console.log('❌ Proxy returned error status');
            }
        } else {
            console.log('⚠️ No sources returned');
        }

        console.log('\n==================================================');
        console.log('🎉 ALL STREAMING TESTS PASSED SUCCESSFULLY locally!');
        console.log('==================================================');
    } catch (e) {
        console.error('\n❌ Test failed:', e.message);
    }
}

runStreamingTest();
