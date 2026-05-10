import { AniwavesSource } from '../server/src/sources/aniwaves-source.js';

async function test() {
    const source = new AniwavesSource();
    console.log('Searching for A Silent Voice...');
    const results = await source.search('A Silent Voice');
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
            
            if (servers.length > 0) {
                const server = servers[0];
                console.log('Getting streaming links for server:', server.name);
                const links = await source.getStreamingLinks(ep.id, server.url);
                console.log('Links:', JSON.stringify(links, null, 2));
            }
        }
    }
}

test().catch(console.error);
