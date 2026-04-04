/**
 * Test working anime sources via API
 * Tests registered API sources (AnimeKai, 9Anime, …).
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3002';
const TEST_EPISODES = [
    { source: 'AnimeKai', id: 'one-piece', episode: '1000' },
    // 9Anime test
    { source: '9Anime', id: 'one-piece', episode: '100' },
    // AniWatch test
    { source: 'Aniwatch', id: 'one-piece', episode: '1' },
    // AniWave test
    { source: 'Aniwave', id: 'one-piece', episode: '1' },
    // Hanime test
    { source: 'Hanime', id: 'boku-no-risou-no-isekai-seikatsu-2', episode: null },
];

async function testSource(source: string, episodeId: string) {
    console.log(`\n🧪 Testing ${source}...`);
    try {
        // Get servers for episode
        const serversRes = await axios.get(`${API_BASE}/api/stream/servers/${episodeId}`);
        console.log(`   📋 Servers: ${serversRes.data.servers?.length || 0} found`);

        if (serversRes.data.servers?.length > 0) {
            // Try first server
            const server = serversRes.data.servers[0];
            console.log(`   🎬 Trying server: ${server.name}`);

            const streamsRes = await axios.get(
                `${API_BASE}/api/stream/watch/${episodeId}?server=${server.name}`
            );

            if (streamsRes.data.sources?.length > 0) {
                const sourceUrl = streamsRes.data.sources[0].url;
                console.log(`   ✅ Got stream URL: ${sourceUrl.substring(0, 80)}...`);

                // Test proxy
                const proxyUrl = `${API_BASE}/api/stream/proxy?url=${encodeURIComponent(sourceUrl)}`;
                try {
                    const proxyRes = await axios.get(proxyUrl, { timeout: 10000 });
                    console.log(`   🎉 PROXY WORKING! Status: ${proxyRes.status}`);
                    return { source, episodeId, server: server.name, streamUrl: sourceUrl, success: true };
                } catch (proxyErr: any) {
                    console.log(`   ❌ Proxy failed: ${proxyErr.response?.data?.error || proxyErr.message}`);
                    return { source, episodeId, server: server.name, streamUrl: sourceUrl, success: false };
                }
            } else {
                console.log(`   ⚠️ No sources in response`);
            }
        }
    } catch (error: any) {
        console.log(`   ❌ Error: ${error.response?.data?.error || error.message}`);
    }
    return { source, episodeId, success: false };
}

async function main() {
    console.log('🧪 Testing Working Anime Sources via API');
    console.log('='.repeat(50));

    const results = [];

    for (const test of TEST_EPISODES) {
        const result = await testSource(test.source, test.id);
        results.push(result);

        // Wait between tests
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));

    const working = results.filter(r => r.success);
    console.log(`✅ Working: ${working.length}/${results.length}`);

    if (working.length > 0) {
        console.log('\n🎉 WORKING STREAMS:');
        working.forEach(r => {
            console.log(`   - ${r.source}: ${r.streamUrl?.substring(0, 60)}...`);
        });
    }
}

main().catch(console.error);
