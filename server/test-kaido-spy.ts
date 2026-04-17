import { KaidoSource } from './src/sources/kaido-source.js';

const src = new KaidoSource();

async function test() {
    console.log('Searching for Spy x Family...');
    const sr = await src.search('spy x family', 1);
    
    for (const anime of sr.results || []) {
        console.log('Found:', anime.title, anime.id);
    }
    
    // Also search with exact match
    const sr2 = await src.search('spy x family part 2', 1);
    console.log('\nWith part 2:');
    for (const anime of sr2.results || []) {
        console.log('Found:', anime.title, anime.id);
    }
}

test().catch(e => console.error('Error:', e.message));
