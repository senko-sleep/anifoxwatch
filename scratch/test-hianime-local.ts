import { HiAnime } from 'aniwatch';

async function run() {
    console.log("Testing in-process HiAnime (aniwatch)...");
    const scraper = new HiAnime.Scraper();
    
    console.log("Searching for 'Re:Zero'...");
    try {
        const searchRes = await scraper.search("Re:Zero", 1);
        console.log(`Found ${searchRes.animes.length} results:`);
        for (const a of searchRes.animes) {
            console.log(` - ID: ${a.id}, Name: ${a.name}`);
        }
        
        if (searchRes.animes.length > 0) {
            const first = searchRes.animes[0];
            console.log(`Getting episodes for: ${first.name} (${first.id})`);
            const epsRes = await scraper.getEpisodes(first.id);
            console.log(`Found ${epsRes.episodes.length} episodes`);
            if (epsRes.episodes.length > 0) {
                const firstEp = epsRes.episodes[0];
                console.log(`Getting servers for: Ep ${firstEp.number} (${firstEp.episodeId})`);
                const servers = await scraper.getEpisodeServers(firstEp.episodeId);
                console.log("Servers:", JSON.stringify(servers, null, 2));
                
                console.log("Getting sources for server 'megacloud' (sub)...");
                const sources = await scraper.getEpisodeSources(firstEp.episodeId, 'megacloud', 'sub');
                console.log("Sources:", JSON.stringify(sources, null, 2));
            }
        }
    } catch (e: any) {
        console.error("Failed:", e.message);
    }
}

run().catch(console.error);
