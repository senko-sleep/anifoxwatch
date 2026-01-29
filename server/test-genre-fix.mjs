import axios from 'axios';

const BASE_URL = 'http://localhost:3003';

async function testGenreFix() {
    try {
        console.log('🧪 Testing genre search with streaming IDs...');
        
        const response = await axios.get(`${BASE_URL}/api/anime/browse?genre=Action&page=1`);
        
        console.log(`✅ Response status: ${response.status}`);
        console.log(`📊 Results count: ${response.data.results?.length || 0}`);
        
        // Check first few results for streamingId
        const results = response.data.results || [];
        console.log('\n🔍 Checking first 5 results:');
        
        for (let i = 0; i < Math.min(5, results.length); i++) {
            const anime = results[i];
            console.log(`${i + 1}. Title: ${anime.title}`);
            console.log(`   ID: ${anime.id}`);
            console.log(`   StreamingID: ${anime.streamingId || 'NOT SET'}`);
            console.log(`   Source: ${anime.source}`);
            console.log('');
        }
        
        // Count how many have streaming IDs
        const withStreamingId = results.filter(a => a.streamingId).length;
        console.log(`📈 Summary: ${withStreamingId}/${results.length} results have streaming IDs`);
        
        if (withStreamingId > 0) {
            console.log('✅ SUCCESS: Genre search is working with streaming IDs!');
        } else {
            console.log('❌ ISSUE: No streaming IDs found in results');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testGenreFix();
