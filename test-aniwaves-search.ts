import { AniwavesSource } from './server/src/sources/aniwaves-source.js';

async function test() {
    const src = new AniwavesSource();
    console.log('Testing Aniwaves search for "Re:Zero 4th season"...');
    try {
        const res = await src.search('Re:Zero 4th season');
        console.log('Results found:', res.results?.length || 0);
        if (res.results?.length) {
            console.log('First result:', res.results[0].title, res.results[0].id);
        }
    } catch (e: any) {
        console.log('Error:', e.message);
    }
}

test();
