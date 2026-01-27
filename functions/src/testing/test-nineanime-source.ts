/**
 * Test the updated NineAnimeSource
 */

import { NineAnimeSource } from '../src/sources/nineanime-source.js';

async function main() {
    console.log('🎬 Testing NineAnimeSource\n');
    console.log('='.repeat(60));
    
    const source = new NineAnimeSource();
    
    try {
        // Test 1: Health check
        console.log('\n📍 Test 1: Health check');
        const isHealthy = await source.healthCheck();
        console.log(`✅ Health: ${isHealthy ? 'OK' : 'FAILED'}`);
        
        // Test 2: Search
        console.log('\n📍 Test 2: Search for "one piece"');
        const searchResults = await source.search('one piece', 1);
        console.log(`✅ Found ${searchResults.results.length} results`);
        if (searchResults.results.length > 0) {
            console.log('   First result:', searchResults.results[0].title);
            console.log('   ID:', searchResults.results[0].id);
        }
        
        // Test 3: Get anime info
        if (searchResults.results.length > 0) {
            console.log('\n📍 Test 3: Get anime info');
            const anime = await source.getAnime(searchResults.results[0].id);
            if (anime) {
                console.log(`✅ Anime: ${anime.title}`);
                console.log(`   Type: ${anime.type}`);
                console.log(`   Status: ${anime.status}`);
            }
        }
        
        // Test 4: Get episodes
        console.log('\n📍 Test 4: Get episodes');
        // Use a known anime slug for testing
        const episodes = await source.getEpisodes('9anime-one-piece-100');
        console.log(`✅ Found ${episodes.length} episodes`);
        if (episodes.length > 0) {
            console.log('   First episode:', episodes[0].title, `(ID: ${episodes[0].id})`);
        }
        
        // Test 5: Get episode servers
        if (episodes.length > 0) {
            console.log('\n📍 Test 5: Get episode servers');
            const servers = await source.getEpisodeServers(episodes[0].id);
            console.log(`✅ Found ${servers.length} servers`);
            servers.forEach(s => console.log(`   - ${s.name} (${s.type})`));
        }
        
        // Test 6: Get streaming links
        if (episodes.length > 0) {
            console.log('\n📍 Test 6: Get streaming links');
            const stream = await source.getStreamingLinks(episodes[0].id, 'hd-1', 'sub');
            
            if (stream.sources.length > 0) {
                console.log('\n' + '*'.repeat(60));
                console.log('🎉 STREAMING SOURCES FOUND!');
                console.log('*'.repeat(60));
                console.log(`\n📺 Sources: ${stream.sources.length}`);
                stream.sources.forEach((s, i) => {
                    console.log(`   ${i + 1}. [${s.quality}] ${s.url.substring(0, 70)}...`);
                });
                
                if (stream.subtitles && stream.subtitles.length > 0) {
                    console.log(`\n📝 Subtitles: ${stream.subtitles.length}`);
                }
                
                if (stream.intro) {
                    console.log(`\n⏭️ Intro: ${stream.intro.start}s - ${stream.intro.end}s`);
                }
            } else {
                console.log('❌ No streaming sources found');
            }
        }
        
        // Test 7: Get trending
        console.log('\n📍 Test 7: Get trending');
        const trending = await source.getTrending();
        console.log(`✅ Found ${trending.length} trending anime`);
        if (trending.length > 0) {
            console.log('   Sample:', trending.slice(0, 3).map(a => a.title).join(', '));
        }
        
        // Test 8: Get latest
        console.log('\n📍 Test 8: Get latest');
        const latest = await source.getLatest();
        console.log(`✅ Found ${latest.length} latest anime`);
        if (latest.length > 0) {
            console.log('   Sample:', latest.slice(0, 3).map(a => a.title).join(', '));
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ ALL TESTS COMPLETED!');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

main();
