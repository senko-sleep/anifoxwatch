/**
 * Test the episodes API endpoint directly with debugging
 */
import axios from 'axios';

async function testEpisodesAPI() {
    console.log('Testing /api/anime/episodes endpoint...\n');

    const baseUrl = 'http://localhost:3001';
    const animeId = 'watchhentai-series/boku-dake-no-hentai-kanojo-the-animation-id-01';

    try {
        console.log('Fetching episodes for:', animeId);

        // First, test the main /api/anime endpoint
        console.log('\n1. Testing /api/anime endpoint:');
        const animeRes = await axios.get(`${baseUrl}/api/anime?id=${encodeURIComponent(animeId)}`);
        console.log('Anime response:', JSON.stringify(animeRes.data, null, 2));

        // Then test /api/anime/episodes
        console.log('\n2. Testing /api/anime/episodes endpoint:');
        const episodesRes = await axios.get(`${baseUrl}/api/anime/episodes?id=${encodeURIComponent(animeId)}`);
        console.log('Episodes response:', JSON.stringify(episodesRes.data, null, 2));
    } catch (error: any) {
        console.error('\nError:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Full error:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testEpisodesAPI();
