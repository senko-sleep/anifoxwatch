/**
 * Fresh Stream Test
 * Gets fresh stream URLs from local aniwatch-api and tests immediately
 */

import axios from 'axios';

const ANIWATCH_API = 'http://localhost:4000/api/v2/hianime';
const OUR_API = 'http://localhost:3001/api';

interface StreamSource {
    url: string;
    quality: string;
    isM3U8: boolean;
}

interface TestResult {
    source: string;
    streams: StreamSource[];
    testedUrls: { url: string; status: number; working: boolean; error?: string }[];
}

async function testStreamUrl(url: string, referer: string): Promise<{ status: number; working: boolean; error?: string }> {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': referer,
                'Origin': new URL(referer).origin
            },
            timeout: 15000,
            validateStatus: () => true
        });

        const isM3u8 = typeof response.data === 'string' && response.data.includes('#EXTM3U');
        
        return {
            status: response.status,
            working: response.status === 200 && isM3u8
        };
    } catch (error: any) {
        return {
            status: 0,
            working: false,
            error: error.message
        };
    }
}

async function testLocalAniwatchAPI(): Promise<TestResult> {
    console.log('\n' + '='.repeat(70));
    console.log('TEST: Local Aniwatch API (localhost:4000)');
    console.log('='.repeat(70));

    const result: TestResult = {
        source: 'aniwatch-api',
        streams: [],
        testedUrls: []
    };

    try {
        // Step 1: Search for anime
        console.log('\n📍 Step 1: Search for "spy family"');
        const searchRes = await axios.get(`${ANIWATCH_API}/search`, {
            params: { q: 'spy family' },
            timeout: 15000
        });

        const animes = searchRes.data?.data?.animes || [];
        console.log(`   Found ${animes.length} anime`);

        if (animes.length === 0) {
            console.log('   ❌ No anime found');
            return result;
        }

        // Find Spy x Family Part 2
        const targetAnime = animes.find((a: any) => 
            a.name?.toLowerCase().includes('spy') && 
            a.name?.toLowerCase().includes('family') &&
            (a.name?.toLowerCase().includes('part 2') || a.name?.toLowerCase().includes('season 2'))
        ) || animes[0];

        console.log(`   ✅ Using: ${targetAnime.name} (${targetAnime.id})`);

        // Step 2: Get episodes
        console.log('\n📍 Step 2: Get episodes');
        const episodesRes = await axios.get(`${ANIWATCH_API}/anime/${targetAnime.id}/episodes`, {
            timeout: 15000
        });

        const episodes = episodesRes.data?.data?.episodes || [];
        console.log(`   Found ${episodes.length} episodes`);

        if (episodes.length === 0) {
            console.log('   ❌ No episodes found');
            return result;
        }

        const firstEp = episodes[0];
        console.log(`   ✅ First episode: ${firstEp.episodeId}`);

        // Step 3: Get servers
        console.log('\n📍 Step 3: Get servers');
        const serversRes = await axios.get(`${ANIWATCH_API}/episode/servers`, {
            params: { animeEpisodeId: firstEp.episodeId },
            timeout: 15000
        });

        const subServers = serversRes.data?.data?.sub || [];
        const dubServers = serversRes.data?.data?.dub || [];
        console.log(`   SUB servers: ${subServers.map((s: any) => s.serverName).join(', ')}`);
        console.log(`   DUB servers: ${dubServers.map((s: any) => s.serverName).join(', ')}`);

        // Step 4: Get sources from each server
        console.log('\n📍 Step 4: Get streaming sources');

        const servers = [...subServers.slice(0, 3), ...dubServers.slice(0, 1)];

        for (const server of servers) {
            console.log(`\n   🔍 Trying ${server.serverName}...`);

            try {
                const sourcesRes = await axios.get(`${ANIWATCH_API}/episode/sources`, {
                    params: {
                        animeEpisodeId: firstEp.episodeId,
                        server: server.serverName,
                        category: subServers.includes(server) ? 'sub' : 'dub'
                    },
                    timeout: 60000
                });

                const sources = sourcesRes.data?.data?.sources || [];
                console.log(`      Sources: ${sources.length}`);

                if (sources.length > 0) {
                    for (const source of sources) {
                        result.streams.push({
                            url: source.url,
                            quality: source.quality || 'auto',
                            isM3U8: source.isM3U8 || source.url?.includes('.m3u8')
                        });

                        // Test immediately
                        console.log(`      Testing: ${source.url?.substring(0, 60)}...`);
                        const testResult = await testStreamUrl(source.url, 'https://megacloud.tv/');
                        
                        result.testedUrls.push({
                            url: source.url,
                            ...testResult
                        });

                        if (testResult.working) {
                            console.log(`      ✅ WORKING! Status: ${testResult.status}`);
                        } else {
                            console.log(`      ❌ Failed. Status: ${testResult.status} ${testResult.error || ''}`);
                        }
                    }
                }
            } catch (error: any) {
                console.log(`      ❌ Error: ${error.message}`);
            }
        }

    } catch (error: any) {
        console.log(`❌ Test failed: ${error.message}`);
    }

    return result;
}

async function testOurAPI(): Promise<TestResult> {
    console.log('\n' + '='.repeat(70));
    console.log('TEST: Our API (localhost:3001) - With Proxy');
    console.log('='.repeat(70));

    const result: TestResult = {
        source: 'our-api',
        streams: [],
        testedUrls: []
    };

    try {
        // Use HiAnime source
        console.log('\n📍 Step 1: Get episodes from HiAnime source');
        const episodesRes = await axios.get(`${OUR_API}/anime/hianime-spy-x-family-part-2-18152/episodes`, {
            timeout: 15000
        });

        const episodes = episodesRes.data?.episodes || [];
        console.log(`   Found ${episodes.length} episodes`);

        if (episodes.length === 0) {
            console.log('   ❌ No episodes found');
            return result;
        }

        const firstEp = episodes[0];
        console.log(`   ✅ First episode: ${firstEp.id}`);

        // Step 2: Get stream (will be proxied)
        console.log('\n📍 Step 2: Get proxied stream');
        const streamRes = await axios.get(`${OUR_API}/stream/watch/${encodeURIComponent(firstEp.id)}`, {
            params: { server: 'hd-1', category: 'sub' },
            timeout: 60000
        });

        const sources = streamRes.data?.sources || [];
        console.log(`   Found ${sources.length} sources`);

        for (const source of sources) {
            result.streams.push({
                url: source.url,
                quality: source.quality || 'auto',
                isM3U8: source.isM3U8
            });

            // Test the proxied URL
            console.log(`   Testing proxied URL: ${source.url.substring(0, 70)}...`);
            
            try {
                const testRes = await axios.get(source.url, {
                    timeout: 15000,
                    validateStatus: () => true
                });

                const isM3u8 = typeof testRes.data === 'string' && testRes.data.includes('#EXTM3U');
                
                result.testedUrls.push({
                    url: source.url,
                    status: testRes.status,
                    working: testRes.status === 200 && isM3u8
                });

                if (testRes.status === 200 && isM3u8) {
                    console.log(`   ✅ WORKING! Status: ${testRes.status}`);
                    console.log(`   📄 M3U8 Preview:`);
                    const lines = testRes.data.split('\n').slice(0, 5);
                    lines.forEach((line: string) => console.log(`      ${line}`));
                } else {
                    console.log(`   ❌ Status: ${testRes.status}`);
                    if (typeof testRes.data === 'object') {
                        console.log(`   Response: ${JSON.stringify(testRes.data).substring(0, 200)}`);
                    }
                }
            } catch (error: any) {
                console.log(`   ❌ Error: ${error.message}`);
                result.testedUrls.push({
                    url: source.url,
                    status: 0,
                    working: false,
                    error: error.message
                });
            }
        }

    } catch (error: any) {
        console.log(`❌ Test failed: ${error.message}`);
        if (error.response?.data) {
            console.log(`   Response: ${JSON.stringify(error.response.data).substring(0, 300)}`);
        }
    }

    return result;
}

async function main() {
    console.log('🎬 FRESH STREAM TEST');
    console.log('='.repeat(70));
    console.log('Testing with Spy x Family Part 2, Episode 1');
    console.log('='.repeat(70));

    const results: TestResult[] = [];

    // Test local aniwatch-api directly
    results.push(await testLocalAniwatchAPI());

    // Test our API with proxy
    results.push(await testOurAPI());

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(70));

    for (const result of results) {
        console.log(`\n📊 ${result.source}:`);
        console.log(`   Total streams: ${result.streams.length}`);
        
        const working = result.testedUrls.filter(t => t.working);
        const failed = result.testedUrls.filter(t => !t.working);
        
        console.log(`   ✅ Working: ${working.length}`);
        console.log(`   ❌ Failed: ${failed.length}`);

        if (working.length > 0) {
            console.log(`\n   🎉 Working URLs:`);
            working.forEach((w, i) => {
                console.log(`      ${i + 1}. ${w.url.substring(0, 70)}...`);
            });
        }
    }

    const allWorking = results.flatMap(r => r.testedUrls.filter(t => t.working));
    if (allWorking.length > 0) {
        console.log('\n' + '*'.repeat(70));
        console.log('SUCCESS! Found working streams!');
        console.log('*'.repeat(70));
    } else {
        console.log('\n❌ No working streams found');
        console.log('   Possible causes:');
        console.log('   - CDN blocking server requests');
        console.log('   - Stream URLs have expired');
        console.log('   - Geographic restrictions');
    }
}

main();
