/**
 * Complete End-to-End Stream Test
 * Verifies the entire streaming pipeline works
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

interface TestResult {
    step: string;
    success: boolean;
    message: string;
    data?: any;
}

async function runCompleteTest(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    console.log('🎬 COMPLETE STREAMING FLOW TEST');
    console.log('='.repeat(70));
    console.log('Anime: Spy x Family Part 2, Episode 1');
    console.log('='.repeat(70) + '\n');

    // Step 1: Get episodes
    console.log('📍 STEP 1: Get episodes');
    try {
        const episodesRes = await axios.get(`${API_BASE}/anime/hianime-spy-x-family-part-2-18152/episodes`, {
            timeout: 15000
        });
        
        const episodes = episodesRes.data?.episodes || [];
        console.log(`   ✅ Found ${episodes.length} episodes`);
        
        results.push({
            step: 'Get Episodes',
            success: episodes.length > 0,
            message: `Found ${episodes.length} episodes`,
            data: { count: episodes.length, firstEp: episodes[0]?.id }
        });

        if (episodes.length === 0) {
            console.log('   ❌ No episodes found, stopping test');
            return results;
        }

        const episodeId = episodes[0].id;
        console.log(`   First episode: ${episodeId}\n`);

        // Step 2: Get streaming links (via our API which tries multiple servers)
        console.log('📍 STEP 2: Get streaming links');
        const streamRes = await axios.get(`${API_BASE}/stream/watch/${encodeURIComponent(episodeId)}`, {
            params: { category: 'sub' },
            timeout: 60000
        });

        const streamData = streamRes.data;
        const sourceCount = streamData.sources?.length || 0;
        
        console.log(`   ✅ Got ${sourceCount} sources from server: ${streamData.server}`);
        console.log(`   Servers tried: ${streamData.triedServers?.join(', ')}`);
        
        if (streamData.intro) {
            console.log(`   Intro skip: ${streamData.intro.start}s - ${streamData.intro.end}s`);
        }
        
        results.push({
            step: 'Get Streaming Links',
            success: sourceCount > 0,
            message: `Got ${sourceCount} sources from ${streamData.server}`,
            data: {
                server: streamData.server,
                sources: sourceCount,
                hasIntro: !!streamData.intro,
                hasSubtitles: (streamData.subtitles?.length || 0) > 0
            }
        });

        if (sourceCount === 0) {
            console.log('   ❌ No sources found, stopping test');
            return results;
        }

        const proxyUrl = streamData.sources[0].url;
        const originalUrl = streamData.sources[0].originalUrl;
        
        console.log(`   Proxied URL: ${proxyUrl.substring(0, 80)}...`);
        console.log(`   Original URL: ${originalUrl?.substring(0, 60)}...`);

        // Step 3: Test the proxied m3u8 manifest
        console.log('\n📍 STEP 3: Test proxied manifest (master.m3u8)');
        const manifestRes = await axios.get(proxyUrl, {
            timeout: 15000,
            validateStatus: () => true
        });

        const isValidManifest = typeof manifestRes.data === 'string' && 
                                manifestRes.data.includes('#EXTM3U') &&
                                manifestRes.data.includes('#EXT-X-STREAM-INF');

        console.log(`   Status: ${manifestRes.status}`);
        console.log(`   Content-Type: ${manifestRes.headers['content-type']}`);
        console.log(`   Valid m3u8: ${isValidManifest}`);

        results.push({
            step: 'Proxy Manifest',
            success: manifestRes.status === 200 && isValidManifest,
            message: isValidManifest ? 'Valid m3u8 manifest received' : `Invalid response (${manifestRes.status})`
        });

        if (!isValidManifest) {
            console.log('   ❌ Invalid manifest, stopping test');
            return results;
        }

        // Parse quality options from manifest
        const qualityLines = manifestRes.data.match(/#EXT-X-STREAM-INF[^\n]+\n[^\n]+/g) || [];
        console.log(`   Found ${qualityLines.length} quality options:`);
        
        const qualities: { resolution: string; bandwidth: string; url: string }[] = [];
        for (const line of qualityLines) {
            const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            const bwMatch = line.match(/BANDWIDTH=(\d+)/);
            const urlMatch = line.match(/\n(.+)/);
            
            if (resMatch && urlMatch) {
                const quality = {
                    resolution: resMatch[1],
                    bandwidth: bwMatch ? `${(parseInt(bwMatch[1]) / 1000000).toFixed(1)} Mbps` : 'unknown',
                    url: urlMatch[1]
                };
                qualities.push(quality);
                console.log(`      - ${quality.resolution} @ ${quality.bandwidth}`);
            }
        }

        // Step 4: Test a quality-specific playlist
        if (qualities.length > 0) {
            console.log('\n📍 STEP 4: Test quality playlist (1080p)');
            const q1080 = qualities.find(q => q.resolution.includes('1080')) || qualities[0];
            
            const playlistRes = await axios.get(q1080.url, {
                timeout: 15000,
                validateStatus: () => true
            });

            const isValidPlaylist = typeof playlistRes.data === 'string' &&
                                    playlistRes.data.includes('#EXTM3U') &&
                                    playlistRes.data.includes('#EXTINF');

            console.log(`   Status: ${playlistRes.status}`);
            console.log(`   Valid playlist: ${isValidPlaylist}`);

            if (isValidPlaylist) {
                const segmentCount = (playlistRes.data.match(/#EXTINF/g) || []).length;
                console.log(`   Segment count: ${segmentCount}`);

                // Check if segments are proxied
                const hasProxiedSegments = playlistRes.data.includes('/api/stream/proxy');
                console.log(`   Segments proxied: ${hasProxiedSegments}`);

                results.push({
                    step: 'Quality Playlist',
                    success: true,
                    message: `Valid playlist with ${segmentCount} segments`,
                    data: { resolution: q1080.resolution, segments: segmentCount }
                });

                // Step 5: Test a segment (optional - might be slow)
                console.log('\n📍 STEP 5: Test video segment');
                const segmentMatch = playlistRes.data.match(/http[^\s]+\.ts[^\s]*/);
                if (segmentMatch) {
                    const segmentUrl = segmentMatch[0];
                    console.log(`   Testing: ${segmentUrl.substring(0, 60)}...`);

                    const segmentRes = await axios.get(segmentUrl, {
                        timeout: 30000,
                        responseType: 'arraybuffer',
                        validateStatus: () => true
                    });

                    console.log(`   Status: ${segmentRes.status}`);
                    console.log(`   Content-Type: ${segmentRes.headers['content-type']}`);
                    console.log(`   Size: ${(segmentRes.data.length / 1024).toFixed(1)} KB`);

                    const isValidSegment = segmentRes.status === 200 && segmentRes.data.length > 1000;

                    results.push({
                        step: 'Video Segment',
                        success: isValidSegment,
                        message: isValidSegment ? 
                            `Valid segment (${(segmentRes.data.length / 1024).toFixed(1)} KB)` : 
                            `Invalid segment (status ${segmentRes.status})`
                    });
                }
            } else {
                results.push({
                    step: 'Quality Playlist',
                    success: false,
                    message: `Invalid playlist (${playlistRes.status})`
                });
            }
        }

    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
        results.push({
            step: 'Unknown',
            success: false,
            message: error.message
        });
    }

    return results;
}

async function main() {
    const results = await runCompleteTest();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n✅ Passed: ${passed}/${results.length}`);
    console.log(`❌ Failed: ${failed}/${results.length}\n`);

    results.forEach(r => {
        const icon = r.success ? '✅' : '❌';
        console.log(`${icon} ${r.step}: ${r.message}`);
    });

    if (passed === results.length) {
        console.log('\n' + '*'.repeat(70));
        console.log('🎉 ALL TESTS PASSED! STREAMING IS WORKING!');
        console.log('*'.repeat(70));
    } else if (passed > 0) {
        console.log('\n⚠️ Some tests passed. Streaming may partially work.');
    } else {
        console.log('\n❌ All tests failed. Streaming is not working.');
    }
}

main();
