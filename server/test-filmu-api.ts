import axios from 'axios';

async function testFilmUAPI() {
    console.log('🧪 Testing FilmU Embed API...\n');
    
    try {
        // Try different API endpoints
        const endpoints = [
            'https://embed.filmu.in/api/search?q=naruto&type=anime',
            'https://embed.filmu.in/api/anime/search?q=naruto',
            'https://server2.filmu.in/api/search?q=naruto',
            'https://prime.filmu.in/api/search?q=naruto',
        ];
        
        for (const endpoint of endpoints) {
            console.log(`\n� Testing: ${endpoint}\n`);
            try {
                const response = await axios.get(endpoint, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    }
                });
                console.log('   Status:', response.status);
                console.log('   Content-Type:', response.headers['content-type']);
                
                if (response.headers['content-type']?.includes('application/json')) {
                    console.log('   📦 JSON response:');
                    console.log(JSON.stringify(response.data, null, 2));
                    
                    if (response.data.results && response.data.results.length > 0) {
                        console.log(`   🎉 SUCCESS! FilmU API works!`);
                        return;
                    }
                } else {
                    console.log('   ⚠️ Not JSON, skipping...');
                }
            } catch (error) {
                console.log(`   ❌ Failed: ${(error as Error).message}`);
            }
        }
    } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`);
    }
    
    console.log('\n❌ FilmU API failed - no working endpoints found');
}

testFilmUAPI().catch(console.error);
