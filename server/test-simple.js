/**
 * Simple test to check if streaming works with the expected format
 */

const API_BASE = 'https://anifoxwatch-api.anifoxwatch.workers.dev';
const episodeId = process.argv[2] || 'spy-x-family-part-2-18152?ep=94682';

async function test() {
    console.log('Testing episode:', episodeId);
    console.log('');
    
    // Test servers first
    const serversUrl = `${API_BASE}/api/stream/servers/${encodeURIComponent(episodeId)}`;
    console.log('1. Get servers:', serversUrl);
    
    try {
        const serversRes = await fetch(serversUrl, { signal: AbortSignal.timeout(10000) });
        const serversData = await serversRes.json();
        console.log('   Status:', serversRes.status);
        console.log('   Servers:', JSON.stringify(serversData));
    } catch (err) {
        console.error('   Error:', err.message);
    }
    
    console.log('');
    
    // Test stream
    const streamUrl = `${API_BASE}/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub`;
    console.log('2. Get stream:', streamUrl);
    
    try {
        const streamRes = await fetch(streamUrl, { signal: AbortSignal.timeout(30000) });
        const streamData = await streamRes.json();
        console.log('   Status:', streamRes.status);
        console.log('   Sources:', streamData.sources?.length || 0);
        console.log('   Error:', streamData.error || 'none');
        console.log('   Response:', JSON.stringify(streamData).substring(0, 500));
    } catch (err) {
        console.error('   Error:', err.message);
    }
}

test();
