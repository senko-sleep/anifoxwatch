import { AllAnimeSource } from '../server/src/sources/allanime-source.js';
import axios from 'axios';

async function testEpisodeWithVariables() {
    const src = new AllAnimeSource();
    const showId = "SyR2K6bGYfKSE6YMm"; // Re:Zero Season 4
    
    console.log('Testing AllAnime episode query with variables...');
    
    const query = `
    query($showId: String!, $epString: String!, $type: VaildTranslationTypeEnumType!) {
      episode(showId: $showId, episodeString: $epString, translationType: $type) {
        sourceUrls
      }
    }`;
    
    const variables = {
        showId: showId,
        epString: "1",
        type: "sub"
    };
    
    try {
        const response = await axios.post('https://api.allanime.day/api', {
            query,
            variables
        }, {
            headers: (src as any).getHeaders()
        });
        console.log('Success! Data:', JSON.stringify(response.data, null, 2));
    } catch (e: any) {
        console.log('Failed:', e.response?.status, JSON.stringify(e.response?.data, null, 2) || e.message);
    }
}

testEpisodeWithVariables();
