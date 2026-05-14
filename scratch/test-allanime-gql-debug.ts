import axios from 'axios';

async function debugAllAnimeGQL() {
    const api = 'https://api.allanime.day/api';
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        'Referer': 'https://allmanga.to/',
    };
    
    const showId = "SyR2K6bGYfKSE6YMm"; // Re:Zero S4
    
    console.log('Querying available episodes details...');
    const detailResult = await axios.post(api, {
        query: `{show(_id:"${showId}"){name,availableEpisodesDetail}}`
    }, { headers });
    
    console.log(`Show: ${detailResult.data.data.show.name}`);
    console.log(`Detail: ${JSON.stringify(detailResult.data.data.show.availableEpisodesDetail)}`);
    
    const subEps = detailResult.data.data.show.availableEpisodesDetail.sub || [];
    if (subEps.length > 0) {
        const ep = subEps[0];
        console.log(`\nTrying to get streams for episode ${ep} (sub)...`);
        
        // Try with various translationType formats
        const types = ['sub', '"sub"', 'SUB', '"SUB"'];
        for (const t of types) {
             console.log(`Testing translationType: ${t}`);
             try {
                 const res = await axios.post(api, {
                     query: `{episode(showId:"${showId}",translationType:${t},episodeString:"${ep}"){sourceUrls}}`
                 }, { headers });
                 console.log(`  Result: ${JSON.stringify(res.data).substring(0, 100)}`);
             } catch (e: any) {
                 console.log(`  Error: ${e.message}`);
             }
        }
    }
}

debugAllAnimeGQL();
