import { AniwavesSource } from './server/src/sources/aniwaves-source.js';

async function test() {
    const src = new AniwavesSource();
    
    const searchTerms = [
        'Re:Zero kara Hajimeru Isekai Seikatsu 4th Season',
        'Re:Zero Season 4',
        'Re:ZERO -Starting Life in Another World- Season 4',
        'Re:Zero 4th season',
        'Re:Zero',
    ];
    
    for (const term of searchTerms) {
        console.log(`\nSearching for: "${term}"`);
        try {
            const res = await src.search(term);
            console.log(`  Results: ${res.results?.length || 0}`);
            if (res.results?.length) {
                res.results.slice(0, 3).forEach((r, i) => {
                    console.log(`    ${i+1}. ${r.title} (${r.id})`);
                });
            }
        } catch (e: any) {
            console.log(`  Error: ${e.message}`);
        }
    }
}

test();
