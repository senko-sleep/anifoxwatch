import { AniwavesSource } from './src/sources/aniwaves-source.js';

async function testAniwaves() {
    const waves = new AniwavesSource();
    console.log('Searching Aniwaves for "Baka to Test to Shoukanjuu"...');
    const search = await waves.search('Baka to Test to Shoukanjuu');
    console.log('Results:', search.results.map(r => ({ title: r.title, id: r.id })));
    
    if (search.results.length > 0) {
        const id = search.results[0].id;
        console.log(`Getting episodes for ${id}...`);
        const eps = await waves.getEpisodes(id);
        console.log(`Found ${eps.length} episodes`);
        
        const ep4 = eps.find(e => e.number === 4);
        if (ep4) {
            console.log(`Getting streaming links for ep 4 (ID: ${ep4.id})...`);
            const links = await waves.getStreamingLinks(ep4.id);
            console.log('Links found:', links.sources.length);
            if (links.sources.length > 0) {
                console.log('First link:', links.sources[0].url);
            }
        }
    }
}

testAniwaves().catch(console.error);
