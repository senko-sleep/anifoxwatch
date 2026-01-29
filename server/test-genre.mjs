import axios from 'axios';

const BASE_URL = 'http://localhost:3001';

async function testGenre(genre) {
  console.log(`\n🧪 Testing genre: ${genre}`);
  console.log('='.repeat(50));
  
  try {
    const response = await axios.get(`${BASE_URL}/api/anime/browse`, {
      params: {
        genres: genre,
        page: 1,
        perPage: 20
      },
      timeout: 30000
    });
    
    console.log(`✅ Success! Found ${response.data.results?.length || 0} anime`);
    if (response.data.results?.length > 0) {
      console.log('First 5 results:');
      response.data.results.slice(0, 5).forEach((anime, i) => {
        console.log(`  ${i+1}. ${anime.title}`);
      });
    }
    return response.data;
  } catch (error) {
    console.log(`❌ Failed: ${error.response?.data?.error || error.message}`);
    return null;
  }
}

async function main() {
  const genres = ['Yuri', 'Action', 'Yaoi', 'Romance', 'Comedy', 'Drama'];
  
  for (const genre of genres) {
    await testGenre(genre);
    await new Promise(r => setTimeout(r, 1000)); // Rate limiting
  }
}

main();
