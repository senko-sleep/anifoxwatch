/**
 * Test HiAnime APIs to find one that works for streaming
 */

import axios from 'axios';

const APIs = [
    'https://hianime-api-chi.vercel.app',
    'https://aniwatch-api-v2.vercel.app',
    'https://api-aniwatch.onrender.com',
    'https://aniwatch-api.onrender.com',
];

async function testAPI(baseUrl: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${baseUrl}`);
    console.log('='.repeat(60));

    try {
        // Test 1: Search
        console.log('\n📍 Test 1: Search');
        const searchUrl = `${baseUrl}/api/v2/hianime/search?q=naruto&page=1`;
        const searchRes = await axios.get(searchUrl, { timeout: 15000 });

        if (searchRes.data?.data?.animes || searchRes.data?.animes) {
            const animes = searchRes.data?.data?.animes || searchRes.data?.animes;
            console.log(`✅ Search works - Found ${animes.length} results`);
            console.log(`   Sample: ${animes[0]?.name} (${animes[0]?.id})`);
        } else {
            console.log('❌ Search response format unexpected:', JSON.stringify(searchRes.data).slice(0, 200));
            return false;
        }

        // Test 2: Get anime info
        console.log('\n📍 Test 2: Get anime info');
        const animeUrl = `${baseUrl}/api/v2/hianime/anime/naruto-shippuden-355`;
        const animeRes = await axios.get(animeUrl, { timeout: 15000 });

        const animeData = animeRes.data?.data || animeRes.data;
        if (animeData?.anime) {
            console.log(`✅ Anime info works - ${animeData.anime.info?.name || 'Naruto Shippuden'}`);
            console.log(`   Episodes: ${animeData.anime.info?.stats?.episodes?.sub || '?'} sub`);
        } else {
            console.log('❌ Anime info response format unexpected');
            return false;
        }

        // Test 3: Get episodes
        console.log('\n📍 Test 3: Get episodes');
        const episodesUrl = `${baseUrl}/api/v2/hianime/anime/naruto-shippuden-355/episodes`;
        const episodesRes = await axios.get(episodesUrl, { timeout: 15000 });

        const episodesData = episodesRes.data?.data || episodesRes.data;
        if (episodesData?.episodes && episodesData.episodes.length > 0) {
            console.log(`✅ Episodes work - Found ${episodesData.episodes.length} episodes`);
            console.log(`   First episode ID: ${episodesData.episodes[0].episodeId}`);

            // Test 4: Get episode servers  
            console.log('\n📍 Test 4: Get episode servers');
            const episodeId = episodesData.episodes[0].episodeId;
            const serversUrl = `${baseUrl}/api/v2/hianime/episode/servers?animeEpisodeId=${encodeURIComponent(episodeId)}`;
            const serversRes = await axios.get(serversUrl, { timeout: 15000 });

            const serversData = serversRes.data?.data || serversRes.data;
            if (serversData?.sub) {
                console.log(`✅ Servers work - SUB: ${serversData.sub.map((s: any) => s.serverName).join(', ')}`);
                if (serversData.dub) {
                    console.log(`              DUB: ${serversData.dub.map((s: any) => s.serverName).join(', ')}`);
                }

                // Test 5: Get streaming sources (THE KEY TEST!)
                console.log('\n📍 Test 5: Get streaming sources');
                const sourcesUrl = `${baseUrl}/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=hd-1&category=sub`;

                try {
                    const sourcesRes = await axios.get(sourcesUrl, { timeout: 30000 });
                    const sourcesData = sourcesRes.data?.data || sourcesRes.data;

                    if (sourcesData?.sources && sourcesData.sources.length > 0) {
                        console.log('\n' + '*'.repeat(60));
                        console.log('🎉 STREAMING SOURCES FOUND!');
                        console.log('*'.repeat(60));
                        console.log('\n📺 Sources:');
                        sourcesData.sources.forEach((s: any, i: number) => {
                            const url = typeof s.url === 'string' ? s.url : 'N/A';
                            console.log(`   ${i + 1}. [${s.quality || 'auto'}] ${url.substring(0, 80)}...`);
                        });

                        if (sourcesData.subtitles && sourcesData.subtitles.length > 0) {
                            console.log('\n📝 Subtitles available:', sourcesData.subtitles.length);
                        }

                        console.log('\n✅ THIS API WORKS FOR STREAMING!');
                        return true;
                    } else {
                        console.log('❌ No sources in response');
                        console.log('Response:', JSON.stringify(sourcesData).slice(0, 300));
                    }
                } catch (e: any) {
                    console.log('❌ Sources request failed:', e.message);
                    if (e.response?.data) {
                        console.log('Error response:', JSON.stringify(e.response.data).slice(0, 300));
                    }
                }
            } else {
                console.log('❌ Servers response format unexpected');
            }
        } else {
            console.log('❌ Episodes response format unexpected');
        }

        return false;
    } catch (error: any) {
        console.log('❌ API failed:', error.message);
        return false;
    }
}

// Also test the chi.vercel.app /api/stream endpoint
async function testChiStreamAPI() {
    const baseUrl = 'https://hianime-api-chi.vercel.app';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing CHI /api/stream endpoint`);
    console.log('='.repeat(60));

    try {
        // First get episodes to get an episode ID
        const episodesUrl = `${baseUrl}/api/v2/hianime/anime/naruto-shippuden-355/episodes`;
        const episodesRes = await axios.get(episodesUrl, { timeout: 15000 });
        const episodesData = episodesRes.data?.data || episodesRes.data;

        if (!episodesData?.episodes?.[0]) {
            console.log('❌ Could not get episodes');
            return false;
        }

        const episodeId = episodesData.episodes[0].episodeId;
        console.log(`📍 Testing with episode: ${episodeId}`);

        // Try the /api/stream endpoint
        const streamUrl = `${baseUrl}/api/stream?id=${encodeURIComponent(episodeId)}&server=hd-1&type=sub`;
        console.log(`🔗 URL: ${streamUrl}`);

        const streamRes = await axios.get(streamUrl, { timeout: 30000 });

        if (streamRes.data?.success && streamRes.data?.results?.sources) {
            const results = streamRes.data.results;
            console.log('\n' + '*'.repeat(60));
            console.log('🎉 CHI STREAM API WORKS!');
            console.log('*'.repeat(60));
            console.log('\n📺 Sources:');
            results.sources.forEach((s: any, i: number) => {
                const url = typeof s.url === 'string' ? s.url : 'N/A';
                console.log(`   ${i + 1}. [${s.quality || 'auto'}] ${url.substring(0, 80)}...`);
            });

            if (results.subtitles && results.subtitles.length > 0) {
                console.log('\n📝 Subtitles:', results.subtitles.length);
            }

            if (results.intro) {
                console.log(`\n⏭️ Intro: ${results.intro.start}s - ${results.intro.end}s`);
            }

            return true;
        } else {
            console.log('❌ CHI stream response:', JSON.stringify(streamRes.data).slice(0, 500));
        }

        return false;
    } catch (error: any) {
        console.log('❌ CHI stream API failed:', error.message);
        if (error.response?.data) {
            console.log('Error response:', JSON.stringify(error.response.data).slice(0, 300));
        }
        return false;
    }
}

async function main() {
    console.log('🎬 Testing HiAnime APIs for working streaming sources\n');

    const workingAPIs: string[] = [];

    // Test the chi /api/stream endpoint first
    if (await testChiStreamAPI()) {
        workingAPIs.push('https://hianime-api-chi.vercel.app/api/stream');
    }

    // Test each standard API
    for (const api of APIs) {
        if (await testAPI(api)) {
            workingAPIs.push(api);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    if (workingAPIs.length > 0) {
        console.log('\n✅ Working APIs for streaming:');
        workingAPIs.forEach(api => console.log(`   - ${api}`));
    } else {
        console.log('\n❌ No working APIs found for streaming');
        console.log('   The decryption may need to be updated in the aniwatch package');
    }
}

main();
