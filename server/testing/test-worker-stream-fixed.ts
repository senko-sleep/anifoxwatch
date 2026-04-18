/**
 * Test worker streaming endpoints AFTER FIX
 */

const TIMEOUT = 15000;

async function fetchWithTimeout(url: string, opts?: RequestInit, ms: number = TIMEOUT): Promise<Response> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), ms);
    try {
        const resp = await fetch(url, { ...opts, signal: controller.signal });
        clearTimeout(tid);
        return resp;
    } catch (e) {
        clearTimeout(tid);
        throw e;
    }
}

async function testStreamingEndpoint(): Promise<void> {
    console.log('=== TESTING WORKER STREAMING AFTER FIX ===');
    
    // Test with the correct episode ID format
    const testCases = [
        // 9anime format
        { id: 'road-of-naruto-18220?ep=94736', name: '9anime naruto ep1' },
        { id: 'demon-slayer-kimetsu-no-yaiba-47?ep=1279', name: '9anime demon slayer ep1' },
        // kaido format
        { id: 'naruto.18691?ep=94736', name: 'kaido naruto ep1' },
    ];
    
    for (const tc of testCases) {
        console.log(`\n--- Testing ${tc.name} ---`);
        console.log('Episode ID:', tc.id);
        
        try {
            // Test servers endpoint
            console.log('\n1. Testing /servers...');
            const serverUrl = `https://anifoxwatch-api.anya-bot.workers.dev/api/stream/servers/${encodeURIComponent(tc.id)}`;
            const serverResp = await fetchWithTimeout(serverUrl, {}, 15000);
            console.log('   Servers Status:', serverResp.status);
            if (serverResp.ok) {
                const serverData = await serverResp.json();
                console.log('   Servers:', JSON.stringify(serverData).slice(0, 200));
            }
            
            // Test watch endpoint
            console.log('\n2. Testing /watch...');
            const watchUrl = `https://anifoxwatch-api.anya-bot.workers.dev/api/stream/watch/${encodeURIComponent(tc.id)}`;
            const watchResp = await fetchWithTimeout(watchUrl, {}, 20000);
            console.log('   Watch Status:', watchResp.status);
            if (watchResp.ok) {
                const watchData = await watchResp.json();
                console.log('   Sources:', watchData.sources?.length || 0);
                if (watchData.sources?.[0]) {
                    console.log('   First source URL:', watchData.sources[0].url?.slice(0, 100));
                }
                if (watchData.error) {
                    console.log('   Error:', watchData.error);
                }
            } else {
                const text = await watchResp.text();
                console.log('   Response:', text.slice(0, 200));
            }
            
        } catch (e) {
            console.log('   Error:', e instanceof Error ? e.message : String(e));
        }
    }
    
    console.log('\n=== TEST DIRECT RENDER BACKEND ===');
    
    // Test Render directly
    const renderTestCases = [
        'road-of-naruto-18220?ep=94736',
        'demon-slayer-kimetsu-no-yaiba-47?ep=1279',
    ];
    
    for (const epId of renderTestCases) {
        console.log(`\n--- Testing Render: ${epId} ---`);
        try {
            const url = `https://anifoxwatch-ci33.onrender.com/api/stream/watch/${encodeURIComponent(epId)}`;
            const start = Date.now();
            const resp = await fetchWithTimeout(url, {}, 30000);
            const ms = Date.now() - start;
            console.log('   Status:', resp.status, `(${ms}ms)`);
            if (resp.ok) {
                const data = await resp.json();
                console.log('   Sources:', data.sources?.length || 0);
                if (data.sources?.[0]) {
                    console.log('   First URL:', data.sources[0].url?.slice(0, 80));
                }
            }
        } catch (e) {
            console.log('   Error:', e instanceof Error ? e.message : String(e));
        }
    }
}

testStreamingEndpoint().then(() => console.log('\n=== DONE ===')).catch(console.error);