/**
 * Test Local aniwatch-api for streaming sources
 */

import axios from 'axios';

const API_BASE = 'http://localhost:4000/api/v2/hianime';

async function main() {
    console.log('🎬 Testing LOCAL aniwatch-api\n');
    console.log('='.repeat(60) + '\n');
    
    try {
        // Test 1: Home page
        console.log('📍 Test 1: Home page');
        const homeRes = await axios.get(`${API_BASE}/home`, { timeout: 15000 });
        const homeData = homeRes.data?.data || homeRes.data;
        console.log(`✅ Home page works`);
        console.log(`   Spotlight: ${homeData.spotlightAnimes?.length || 0} animes`);
        console.log(`   Trending: ${homeData.trendingAnimes?.length || 0} animes`);
        
        // Test 2: Search
        console.log('\n📍 Test 2: Search for "one piece"');
        const searchRes = await axios.get(`${API_BASE}/search?q=one piece`, { timeout: 15000 });
        const searchData = searchRes.data?.data || searchRes.data;
        console.log(`✅ Found ${searchData.animes?.length || 0} results`);
        if (searchData.animes?.[0]) {
            console.log(`   First: ${searchData.animes[0].name} (${searchData.animes[0].id})`);
        }
        
        // Test 3: Get episodes for One Piece
        console.log('\n📍 Test 3: Get episodes for one-piece-100');
        const episodesRes = await axios.get(`${API_BASE}/anime/one-piece-100/episodes`, { timeout: 15000 });
        const episodesData = episodesRes.data?.data || episodesRes.data;
        console.log(`✅ Found ${episodesData.episodes?.length || 0} episodes`);
        
        if (episodesData.episodes?.[0]) {
            const firstEp = episodesData.episodes[0];
            console.log(`   First: Episode ${firstEp.number} (ID: ${firstEp.episodeId})`);
            
            // Test 4: Get servers
            console.log('\n📍 Test 4: Get servers');
            const serversRes = await axios.get(`${API_BASE}/episode/servers?animeEpisodeId=${encodeURIComponent(firstEp.episodeId)}`, { timeout: 15000 });
            const serversData = serversRes.data?.data || serversRes.data;
            console.log(`✅ SUB servers: ${serversData.sub?.map((s: any) => s.serverName).join(', ')}`);
            console.log(`   DUB servers: ${serversData.dub?.map((s: any) => s.serverName).join(', ')}`);
            
            // Test 5: Get streaming sources (THE KEY TEST!)
            console.log('\n📍 Test 5: Get streaming sources');
            console.log(`   Episode: ${firstEp.episodeId}`);
            console.log(`   Server: hd-1`);
            console.log(`   Category: sub`);
            
            const sourcesRes = await axios.get(`${API_BASE}/episode/sources`, {
                params: {
                    animeEpisodeId: firstEp.episodeId,
                    server: 'hd-1',
                    category: 'sub'
                },
                timeout: 60000
            });
            
            const sourcesData = sourcesRes.data?.data || sourcesRes.data;
            
            if (sourcesData?.sources && sourcesData.sources.length > 0) {
                console.log('\n' + '*'.repeat(60));
                console.log('🎉 STREAMING SOURCES FOUND!');
                console.log('*'.repeat(60));
                
                console.log('\n📺 VIDEO SOURCES:');
                sourcesData.sources.forEach((s: any, i: number) => {
                    const url = s.url || 'N/A';
                    console.log(`   ${i + 1}. [${s.quality || 'auto'}] ${url.substring(0, 80)}...`);
                });
                
                if (sourcesData.subtitles && sourcesData.subtitles.length > 0) {
                    console.log('\n📝 SUBTITLES:');
                    sourcesData.subtitles.slice(0, 5).forEach((sub: any, i: number) => {
                        console.log(`   ${i + 1}. ${sub.lang}: ${sub.url?.substring(0, 50)}...`);
                    });
                }
                
                if (sourcesData.intro) {
                    console.log(`\n⏭️ Intro: ${sourcesData.intro.start}s - ${sourcesData.intro.end}s`);
                }
                
                console.log('\n✅ LOCAL API WORKS FOR STREAMING!');
            } else {
                console.log('❌ No sources in response');
                console.log('Response:', JSON.stringify(sourcesData).slice(0, 500));
            }
        }
        
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.response?.data) {
            console.log('Error response:', JSON.stringify(error.response.data).slice(0, 500));
        }
    }
}

main();
