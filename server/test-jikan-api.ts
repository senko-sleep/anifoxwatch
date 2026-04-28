import axios from 'axios';

async function testJikanAPI() {
    console.log('🧪 Testing Jikan (MyAnimeList) API...\n');
    
    const JIKAN_API = 'https://api.jikan.moe/v4';
    
    try {
        // Search for Naruto
        console.log('📍 Searching for Naruto...\n');
        const searchResponse = await axios.get(`${JIKAN_API}/anime?q=naruto&limit=1`);
        console.log(`   ✅ Found ${searchResponse.data.data.length} results`);
        
        if (searchResponse.data.data.length > 0) {
            const anime = searchResponse.data.data[0];
            console.log(`   📺 Title: ${anime.title}`);
            console.log(`   📺 MAL ID: ${anime.mal_id}`);
            
            // Get episodes
            console.log('\n📍 Getting episodes...\n');
            const episodesResponse = await axios.get(`${JIKAN_API}/anime/${anime.mal_id}/episodes`);
            console.log(`   ✅ Found ${episodesResponse.data.data?.length || 0} episodes`);
            
            if (episodesResponse.data.data && episodesResponse.data.data.length > 0) {
                const firstEp = episodesResponse.data.data[0];
                console.log(`   🎬 First episode: ${firstEp.mal_id} (${firstEp.title})`);
                
                // Jikan doesn't provide streaming links, only metadata
                console.log('\n⚠️ Jikan API only provides metadata, not streaming links');
                console.log('   Need to use a different approach for actual streaming');
            }
        }
    } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`);
    }
}

testJikanAPI().catch(console.error);
