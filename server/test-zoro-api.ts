import axios from 'axios';

async function testZoroAPI() {
    console.log('🧪 Testing Zoro/HiAnime API directly...\n');
    
    const API_URL = 'https://hianime.to';
    
    try {
        // Test search
        console.log('📍 Testing search...\n');
        const searchResponse = await axios.get(`${API_URL}/search?keyword=naruto`);
        console.log(`   Status: ${searchResponse.status}`);
        
        // Try to get episode sources via their API
        console.log('\n📍 Testing episode sources API...\n');
        const episodeId = 'naruto?ep=1';
        const sourcesResponse = await axios.get(`${API_URL}/ajax/v2/episode/servers?episodeId=${episodeId}`);
        console.log('   📦 Sources response:');
        console.log(JSON.stringify(sourcesResponse.data, null, 2));
        
        if (sourcesResponse.data?.data?.length > 0) {
            console.log(`   ✅ Found ${sourcesResponse.data.data.length} servers`);
            const firstServer = sourcesResponse.data.data[0];
            console.log(`   🎬 First server: ${firstServer.serverName}`);
            
            // Try to get actual stream URL
            const streamResponse = await axios.get(`${API_URL}/ajax/v2/episode/sources?episodeId=${episodeId}&server=${firstServer.serverName}&category=sub`);
            console.log('\n   📦 Stream response:');
            console.log(JSON.stringify(streamResponse.data, null, 2));
            
            if (streamResponse.data?.data?.url) {
                console.log(`   🎉 SUCCESS! Stream URL: ${streamResponse.data.data.url.substring(0, 80)}...`);
            }
        }
    } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`);
        if ((error as any).response) {
            console.error(`   Status: ${(error as any).response.status}`);
        }
    }
}

testZoroAPI().catch(console.error);
