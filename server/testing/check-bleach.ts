import axios from 'axios';

async function test() {
    const id = 'anilist-269'; // Bleach
    const url = `http://localhost:3001/api/anime?id=${id}`;
    
    console.log(`Fetching: ${url}`);
    try {
        const start = Date.now();
        const resp = await axios.get(url, { timeout: 30000 });
        console.log(`Done in ${Date.now() - start}ms`);
        console.log(`Episodes: ${resp.data.episodes?.length || 0}`);
        if (resp.data.episodes?.length > 0) {
            console.log(`First Episode: ${resp.data.episodes[0].id}`);
        }
    } catch (err: any) {
        console.error(`Error: ${err.message}`);
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error(`Data: ${JSON.stringify(err.response.data)}`);
        }
    }
}

test();
