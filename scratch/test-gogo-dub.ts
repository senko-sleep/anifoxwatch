import axios from 'axios';

async function testGogoDub() {
    const baseUrl = 'https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io';
    // We'll search for the dub specifically
    const query = 'spy x family season 3 dub';
    
    console.log(`Searching for: ${query}`);

    try {
        const searchUrl = `${baseUrl}/api/anime/search?q=${encodeURIComponent(query)}&source=Gogoanime`;
        const searchResp = await axios.get(searchUrl);
        console.log(`Found ${searchResp.data.results.length} results`);
        
        if (searchResp.data.results.length > 0) {
            const animeId = searchResp.data.results[0].id;
            console.log(`Testing anime ID: ${animeId}`);
            
            const episodesUrl = `${baseUrl}/api/anime/episodes?id=${encodeURIComponent(animeId)}&source=Gogoanime`;
            const epResp = await axios.get(episodesUrl);
            console.log(`Found ${epResp.data.episodes.length} episodes`);
            
            if (epResp.data.episodes.length > 0) {
                const epId = epResp.data.episodes[0].id;
                console.log(`Testing episode ID: ${epId}`);
                
                const streamUrl = `${baseUrl}/api/stream/watch/${encodeURIComponent(epId)}?category=dub&server=Gogoanime`;
                const streamResp = await axios.get(streamUrl);
                console.log('\nStream Response:');
                console.log(JSON.stringify(streamResp.data, null, 2));
                
                if (streamResp.data.sources && streamResp.data.sources.length > 0) {
                    console.log('✅ SUCCESS: Gogoanime has Dub!');
                } else {
                    console.log('❌ Gogoanime has no Dub sources for this ep');
                }
            }
        }
    } catch (error: any) {
        console.error('\n❌ ERROR:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testGogoDub();
