import axios from 'axios';

async function testAllAnimeSlug() {
    const api = 'https://api.allanime.day/api';
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        'Referer': 'https://allmanga.to/',
    };
    
    console.log('Searching for Naruto to get slug...');
    const res = await axios.post(api, {
        query: `{shows(search:{query:"Naruto"},limit:1,page:1,countryOrigin:ALL){edges{_id,name,slug}}}`
    }, { headers });
    
    console.log(`Result: ${JSON.stringify(res.data.data.shows.edges[0])}`);
}

testAllAnimeSlug();
