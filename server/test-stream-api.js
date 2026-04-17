/**
 * Test streaming API for Spy x Family episode
 */

const API_BASE = process.env.API_BASE || 'https://anifoxwatch-api.anifoxwatch.workers.dev';
const episodeId = 'spy-x-family-part-2-18152?ep=94682';

async function test() {
    console.log('Testing streaming API...\n');
    
    // Test 1: Get servers
    console.log('=== Test 1: Get Servers ===');
    const serversUrl = `${API_BASE}/api/stream/servers/${encodeURIComponent(episodeId)}`;
    console.log('URL:', serversUrl);
    
    try {
        const serversRes = await fetch(serversUrl);
        console.log('Status:', serversRes.status);
        const serversData = await serversRes.json();
        console.log('Servers count:', serversData.servers?.length || 0);
        console.log('Servers:', JSON.stringify(serversData, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }

    // Test 2: Get streaming links - sub
    console.log('\n=== Test 2: Get Stream (sub) ===');
    const streamSubUrl = `${API_BASE}/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub`;
    console.log('URL:', streamSubUrl);
    
    try {
        const streamRes = await fetch(streamSubUrl);
        console.log('Status:', streamRes.status);
        const streamData = await streamRes.json();
        console.log('Sources:', streamData.sources?.length || 0);
        console.log('Source used:', streamData.source);
        console.log('Response:', JSON.stringify(streamData, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }

    // Test 3: Get streaming links - dub
    console.log('\n=== Test 3: Get Stream (dub) ===');
    const streamDubUrl = `${API_BASE}/api/stream/watch/${encodeURIComponent(episodeId)}?category=dub`;
    console.log('URL:', streamDubUrl);
    
    try {
        const streamRes = await fetch(streamDubUrl);
        console.log('Status:', streamRes.status);
        const streamData = await streamRes.json();
        console.log('Sources:', streamData.sources?.length || 0);
        console.log('Source used:', streamData.source);
        console.log('Response:', JSON.stringify(streamData, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }

    // Test 4: Try with explicit server
    console.log('\n=== Test 4: Get Stream (server=hd-1, sub) ===');
    const streamHd1Url = `${API_BASE}/api/stream/watch/${encodeURIComponent(episodeId)}?server=hd-1&category=sub`;
    console.log('URL:', streamHd1Url);
    
    try {
        const streamRes = await fetch(streamHd1Url);
        console.log('Status:', streamRes.status);
        const streamData = await streamRes.json();
        console.log('Sources:', streamData.sources?.length || 0);
        console.log('Source used:', streamData.source);
        console.log('Response:', JSON.stringify(streamData, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
