import { GogoanimeSource } from '../server/src/sources/gogoanime-source.js';

async function run() {
    console.log("Testing GogoanimeSource with gogoanimes.fi...");
    const src = new GogoanimeSource();
    (src as any).baseUrl = 'https://gogoanimes.fi'; // override to gogoanimes.fi
    
    console.log("Checking health...");
    const health = await src.healthCheck();
    console.log("Health result:", health);
    
    console.log("Searching for 'Re:Zero'...");
    try {
        const searchRes = await src.search("Re:Zero", 1);
        console.log(`Found ${searchRes.results.length} results:`);
        for (const r of searchRes.results) {
            console.log(` - ID: ${r.id}, Title: ${r.title}`);
        }
        if (searchRes.results.length > 0) {
            const first = searchRes.results.find(x => x.title.includes('Season 3') || x.title.includes('3rd Season')) || searchRes.results[0];
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
    } catch (e: any) {
        console.error("Failed:", e.stack);
    }
}

run().catch(console.error);
