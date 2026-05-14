import { AniwavesSource } from '../server/src/sources/aniwaves-source.js';

async function test() {
    const source = new AniwavesSource();
    const query = 'Re:Zero Season 4';
    console.log(`Searching for ${query}...`);
    const results = await source.search(query);
    console.log('Results:', JSON.stringify(results, null, 2));
    
    if (results.results.length > 0) {
        const anime = results.results[0];
        console.log('Getting episodes for:', anime.id);
        const episodes = await source.getEpisodes(anime.id);
        console.log('Episodes found:', episodes.length);
        
        if (episodes.length > 0) {
            const ep = episodes[0];
            console.log('Getting servers for:', ep.id);
            const servers = await source.getEpisodeServers(ep.id);
            console.log('Servers found:', servers.length);
            
            for (const server of servers) {
                console.log(`Server: ${server.name} (type: ${server.type})`);
            }
        }
    }
}

test().catch(console.error);
