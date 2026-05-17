import { GogoOrAtSource } from '../server/src/sources/gogo-or-at-source.js';

async function test() {
    const src = new GogoOrAtSource();
    console.log('Searching Boruto...');
    const result = await src.search('Boruto');
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.results.length > 0) {
        console.log('Getting episodes...');
        const eps = await src.getEpisodes(result.results[0].id);
        console.log('Episodes count:', eps.length);
        console.log('First episode:', eps[0]);
    }
}
test().catch(console.error);
