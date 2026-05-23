import fetch from 'node-fetch';

async function testDenoDeploy() {
    const API_URL = 'https://anifoxwatch-ch82xw1vqff9.allenposton14.deno.net';
    console.log(`\n🔍 Testing Deno Deploy API: ${API_URL}`);

    // 1. Test Health Endpoint
    console.log('\n--- 1. Health Check ---');
    try {
        const healthRes = await fetch(`${API_URL}/api/health`);
        const healthData = await healthRes.json();
        console.log(`Status: ${healthRes.status}`);
        console.log('Response:', healthData);
    } catch (e: any) {
        console.error('Health Check Failed:', e.message);
    }

    // 2. Test Stream Endpoint for Aniwaves (Re:Zero S4 Ep 1)
    console.log('\n--- 2. Stream Fetch (Aniwaves proxy test) ---');
    const streamPath = '/api/stream/watch/aniwaves-82570?eps=1';
    console.log(`GET ${streamPath}`);
    
    try {
        const streamRes = await fetch(`${API_URL}${streamPath}`);
        console.log(`Status: ${streamRes.status}`);
        
        if (!streamRes.ok) {
            const errorText = await streamRes.text();
            console.error('Error Body:', errorText);
        } else {
            const streamData = await streamRes.json() as any;
            if (streamData.sources && streamData.sources.length > 0) {
                console.log(`✅ SUCCESS! Found ${streamData.sources.length} sources.`);
                console.log('First source URL:', streamData.sources[0].url);
                console.log('Subtitles found:', streamData.subtitles?.length || 0);
            } else {
                console.log('❌ Failed: 200 OK but no sources returned.');
            }
        }
    } catch (e: any) {
        console.error('Stream Fetch Failed:', e.message);
    }
}

testDenoDeploy();
