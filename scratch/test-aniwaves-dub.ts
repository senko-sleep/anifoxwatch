import { AniwavesSource } from '../server/src/sources/aniwaves-source.js';

async function testAniwavesDub() {
    const source = new AniwavesSource();
    const query = "Re:Zero kara Hajimeru Isekai Seikatsu 4th Season";
    
    console.log(`Searching for ${query}...`);
    const search = await source.search(query);
    console.log(`Results: ${search.results.length}`);
    
    // Find the best match
    const anime = search.results.find(a => a.title.includes('4th Season') && !a.title.includes('Break Time')) || search.results[0];
    
    if (!anime) {
        console.log('No anime found');
        return;
    }
    console.log(`Found: ${anime.title} (${anime.id})`);
    
    console.log('\nGetting episodes...');
    const episodes = await source.getEpisodes(anime.id);
    console.log(`Episodes found: ${episodes.length}`);
    
    const ep1 = episodes.find(e => e.number === 1);
    if (!ep1) {
        console.log('Episode 1 not found');
        if (episodes.length > 0) {
            console.log('Available episode numbers:', episodes.map(e => e.number).join(', '));
        }
        return;
    }
    console.log(`Episode 1: ${ep1.id} (Sub: ${ep1.hasSub}, Dub: ${ep1.hasDub})`);
    
    if (ep1.hasDub || true) { // Try anyway to see servers
        console.log('\nGetting DUB streaming links...');
        const dubLinks = await source.getStreamingLinks(ep1.id, undefined, 'dub');
        console.log(`DUB Sources: ${dubLinks.sources.length}`);
        if (dubLinks.sources.length > 0) {
            console.log(`DUB URL: ${dubLinks.sources[0].url.substring(0, 100)}...`);
        }
    }
}

testAniwavesDub().catch(console.error);
