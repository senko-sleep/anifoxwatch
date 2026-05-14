import axios from 'axios';

async function testEpisodeWithVariables() {
    console.log('Testing AllAnime episode query with variables (hardcoded headers)...');
    
    const query = `
    query($showId: String!, $epString: String!, $type: VaildTranslationTypeEnumType!) {
      episode(showId: $showId, episodeString: $epString, translationType: $type) {
        sourceUrls
      }
    }`;
    
    const variables = {
        showId: "SyR2K6bGYfKSE6YMm",
        epString: "1",
        type: "sub"
    };
    
    const headers = {
        'Content-Type': 'application/json',
        'Referer': 'https://allmanga.to/',
        'Origin': 'https://allmanga.to',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
    };
    
    try {
        const response = await axios.post('https://api.allanime.day/api', {
            query,
            variables
        }, {
            headers
        });
        console.log('Success! Data:', JSON.stringify(response.data, null, 2));
    } catch (e: any) {
        console.log('Failed:', e.response?.status, JSON.stringify(e.response?.data, null, 2) || e.message);
    }
}

testEpisodeWithVariables();
