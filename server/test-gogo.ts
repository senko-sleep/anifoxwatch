import { GogoanimeSource } from './src/sources/gogoanime-source.js';

async function testGogo() {
    const gogo = new GogoanimeSource();
    console.log('Searching Gogoanime for "Baka to Test to Shoukanjuu"...');
    const search = await gogo.search('Baka to Test to Shoukanjuu');
    console.log('Results:', search.results.map(r => ({ title: r.title, id: r.id })));
    
    if (search.results.length > 0) {
        const id = search.results[0].id;
        console.log(`Getting episodes for ${id}...`);
        const eps = await gogo.getEpisodes(id);
        console.log(`Found ${eps.length} episodes`);
        
        const ep4 = eps.find(e => e.number === 4);
        if (ep4) {
            console.log(`Getting streaming links for ep 4 (ID: ${ep4.id})...`);
            const links = await gogo.getStreamingLinks(ep4.id);
            console.log('Links found:', links.sources.length);
            if (links.sources.length > 0) {
                console.log('First link:', links.sources[0].url);
            }
        }
    }
}

testGogo().catch(console.error);
