import axios from 'axios';

async function test() {
    const id = 'anilist-269'; // Bleach
    const url = `http://localhost:3001/api/anime/episodes?id=${id}`;
    
    console.log(`Fetching episodes: ${url}`);
    try {
        const start = Date.now();
        const resp = await axios.get(url, { timeout: 30000 });
        console.log(`Done in ${Date.now() - start}ms`);
        const episodes = resp.data.episodes || [];
        console.log(`Found ${episodes.length} episodes`);
        if (episodes.length > 0) {
            console.log(`First Episode ID: ${episodes[0].id}`);
        }
    } catch (err: any) {
        console.error(`Error: ${err.message}`);
    }
}

test();
