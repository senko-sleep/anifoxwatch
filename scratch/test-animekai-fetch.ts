import { AnimeKaiFetchSource } from '../server/src/sources/animekai-fetch-source.js';

async function run() {
    console.log("Testing AnimeKaiFetchSource...");
    const src = new AnimeKaiFetchSource();
    
    console.log("Checking health...");
    const health = await src.healthCheck();
    console.log("Health result:", health);
    
    console.log("Searching for 'Re:Zero'...");
    const searchRes = await src.search("Re:Zero", 1);
    console.log(`Found ${searchRes.results.length} results:`);
    for (const r of searchRes.results) {
        console.log(` - ID: ${r.id}, Title: ${r.title}`);
    }
    
    if (searchRes.results.length > 0) {
        const first = searchRes.results[0];
        console.log(`Getting episodes for: ${first.title} (${first.id})`);
        const eps = await src.getEpisodes(first.id);
        console.log(`Found ${eps.length} episodes`);
        if (eps.length > 0) {
            const firstEp = eps[0];
            console.log(`Getting streaming links for: Ep ${firstEp.number} (${firstEp.id})`);
            const streams = await src.getStreamingLinks(firstEp.id, undefined, 'sub');
            console.log("Streaming links:", JSON.stringify(streams, null, 2));
        }
    }
}

run().catch(console.error);
