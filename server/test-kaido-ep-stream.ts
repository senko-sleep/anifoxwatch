import { KaidoSource } from './src/sources/kaido-source.js';

const src = new KaidoSource();

async function test() {
    // Search first
    console.log('1. Searching...');
    const sr = await src.search('naruto', 1);
    console.log('Results:', sr.results?.length);
    
    if (!sr.results?.[0]) {
        console.log('No results');
        return;
    }
    
    const anime = sr.results[0];
    console.log('First result:', anime.title, anime.id);
    
    // Get episodes
    console.log('\n2. Getting episodes...');
    const eps = await src.getEpisodes(anime.id);
    console.log('Episodes:', eps.length);
    
    if (eps.length === 0) {
        console.log('No episodes');
        return;
    }
    
    // Get streaming links
    console.log('\n3. Getting streaming links for first episode...');
    const stream = await src.getStreamingLinks(eps[0].id, 'hd-1', 'sub');
    console.log('Sources:', stream.sources?.length);
    
    if (stream.sources?.[0]) {
        console.log('First source:', stream.sources[0].url.substring(0, 100));
    }
}

test().catch(e => console.error('Error:', e.message));
