import axios from 'axios';

async function testAllAnimeStreams() {
    const api = 'https://api.allanime.day/api';
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        'Referer': 'https://allmanga.to/',
    };
    
    // 1. Search for Re:Zero
    console.log('Searching for Re:Zero...');
    const searchResult = await axios.post(api, {
        query: `{shows(search:{query:"Re:Zero"},limit:1,page:1,countryOrigin:ALL){edges{_id,name}}}`
    }, { headers });
    
    const show = searchResult.data.data.shows.edges[0];
    if (!show) {
        console.log('No show found');
        return;
    }
    console.log(`Found: ${show.name} (${show._id})`);
    
    // 2. Get Episode 1 stream URLs
    console.log('\nGetting Episode 1 stream URLs...');
    const streamResult = await axios.post(api, {
        query: `{episode(showId:"${show._id}",translationType:sub,episodeString:"1"){sourceUrls}}`
    }, { headers });
    
    const sourceUrls = streamResult.data.data.episode.sourceUrls || [];
    console.log(`Sources found: ${sourceUrls.length}`);
    
    for (const src of sourceUrls) {
        console.log(`- ${src.sourceName}: ${src.sourceUrl.substring(0, 50)}...`);
        // If it's a clock path, test it
        if (src.sourceUrl.includes('/clock')) {
             // Decode URL if needed
             // AllAnimeSource.decodeUrl implementation
             const decode = (encoded: string) => {
                 const hex = encoded.startsWith('--') ? encoded.slice(2) : encoded;
                 let res = '';
                 for (let i = 0; i < hex.length - 1; i += 2) {
                     res += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
                 }
                 return res;
             };
             const decoded = src.sourceUrl.startsWith('--') ? decode(src.sourceUrl) : src.sourceUrl;
             console.log(`  Decoded: ${decoded}`);
             
             if (decoded.startsWith('/apivtwo/clock')) {
                 const clockUrl = `https://api.allanime.day${decoded.replace('clock', 'clock.json')}`;
                 console.log(`  Testing clock URL: ${clockUrl}`);
                 try {
                     const clockResp = await axios.get(clockUrl, { headers: { 'Referer': 'https://allmanga.to/' }, timeout: 5000 });
                     console.log(`  Clock Status: ${clockResp.status}`);
                     console.log(`  Clock Data: ${JSON.stringify(clockResp.data).substring(0, 100)}...`);
                 } catch (e: any) {
                     console.log(`  Clock Error: ${e.message}`);
                 }
             }
        }
    }
}

testAllAnimeStreams();
