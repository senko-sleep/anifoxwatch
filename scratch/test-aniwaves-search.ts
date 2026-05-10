import { AniwavesSource } from '../server/src/sources/aniwaves-source.js';

async function test() {
    const source = new AniwavesSource();
    const query = 'A Silent Voice vwmk';
    console.log(`Searching for "${query}"...`);
    const results = await source.search(query);
    console.log('Results count:', results.results.length);
}

test().catch(console.error);
