/**
 * Test Sub and Dub Streaming
 * Verifies both audio types work correctly
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

interface StreamTest {
    category: 'sub' | 'dub';
    success: boolean;
    server?: string;
    sourceCount?: number;
    quality?: string;
    proxyWorks?: boolean;
    error?: string;
}

async function testStream(episodeId: string, category: 'sub' | 'dub'): Promise<StreamTest> {
    console.log(`\n📍 Testing ${category.toUpperCase()} stream...`);

    try {
        // Get stream
        const streamRes = await axios.get(`${API_BASE}/stream/watch/${encodeURIComponent(episodeId)}`, {
            params: { category },
            timeout: 60000
        });

        const streamData = streamRes.data;
        const sourceCount = streamData.sources?.length || 0;

        console.log(`   ✅ Got ${sourceCount} sources from server: ${streamData.server}`);
        console.log(`   Servers tried: ${streamData.triedServers?.join(', ')}`);
        console.log(`   Source: ${streamData.source}`);

        if (sourceCount === 0) {
            return {
                category,
                success: false,
                error: 'No sources found'
            };
        }

        const proxyUrl = streamData.sources[0].url;
        console.log(`   Testing proxy: ${proxyUrl.substring(0, 60)}...`);

        // Test proxy
        const proxyRes = await axios.get(proxyUrl, {
            timeout: 15000,
            validateStatus: () => true
        });

        const isValidM3u8 = typeof proxyRes.data === 'string' && 
                           proxyRes.data.includes('#EXTM3U');

        console.log(`   Proxy status: ${proxyRes.status}`);
        console.log(`   Valid m3u8: ${isValidM3u8}`);

        if (isValidM3u8) {
            // Check quality options
            const qualityLines = proxyRes.data.match(/RESOLUTION=(\d+x\d+)/g) || [];
            console.log(`   Quality options: ${qualityLines.join(', ')}`);
        }

        return {
            category,
            success: proxyRes.status === 200 && isValidM3u8,
            server: streamData.server,
            sourceCount,
            quality: streamData.sources[0].quality,
            proxyWorks: proxyRes.status === 200 && isValidM3u8
        };

    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
        return {
            category,
            success: false,
            error: error.message
        };
    }
}

async function main() {
    console.log('🎬 SUB & DUB STREAMING TEST');
    console.log('='.repeat(70));
    console.log('Anime: Spy x Family Part 2, Episode 1');
    console.log('='.repeat(70));

    // Get episode ID first
    console.log('\n📍 Getting episodes...');
    const episodesRes = await axios.get(`${API_BASE}/anime/hianime-spy-x-family-part-2-18152/episodes`, {
        timeout: 15000
    });

    const episodes = episodesRes.data?.episodes || [];
    if (episodes.length === 0) {
        console.log('❌ No episodes found');
        return;
    }

    const episodeId = episodes[0].id;
    console.log(`   First episode: ${episodeId}`);

    // Get servers to see sub/dub availability
    console.log('\n📍 Getting servers...');
    const serversRes = await axios.get(`${API_BASE}/stream/servers/${encodeURIComponent(episodeId)}`, {
        timeout: 15000
    });

    const servers = serversRes.data?.servers || [];
    const subServers = servers.filter((s: any) => s.type === 'sub');
    const dubServers = servers.filter((s: any) => s.type === 'dub');
    
    console.log(`   SUB servers: ${subServers.map((s: any) => s.name).join(', ') || 'none'}`);
    console.log(`   DUB servers: ${dubServers.map((s: any) => s.name).join(', ') || 'none'}`);

    // Test both audio types
    const results: StreamTest[] = [];

    // Test SUB
    const subResult = await testStream(episodeId, 'sub');
    results.push(subResult);

    // Test DUB
    const dubResult = await testStream(episodeId, 'dub');
    results.push(dubResult);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));

    for (const result of results) {
        const icon = result.success ? '✅' : '❌';
        console.log(`\n${icon} ${result.category.toUpperCase()}:`);
        
        if (result.success) {
            console.log(`   Server: ${result.server}`);
            console.log(`   Sources: ${result.sourceCount}`);
            console.log(`   Quality: ${result.quality}`);
            console.log(`   Proxy: ${result.proxyWorks ? 'Working' : 'Failed'}`);
        } else {
            console.log(`   Error: ${result.error}`);
        }
    }

    const allPassed = results.every(r => r.success);
    if (allPassed) {
        console.log('\n' + '*'.repeat(70));
        console.log('🎉 BOTH SUB AND DUB ARE WORKING!');
        console.log('*'.repeat(70));
    } else {
        const passed = results.filter(r => r.success);
        console.log(`\n⚠️ ${passed.length}/${results.length} audio types working`);
    }
}

main().catch(console.error);
