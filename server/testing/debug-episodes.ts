import { sourceManager } from '../src/services/source-manager.js';

async function debugEpisodes() {
    const id = 'animekai-bleach-re3j';
    console.log(`--- Debugging Episodes for "${id}" ---`);
    try {
        const eps = await sourceManager.getEpisodes(id);
        console.log(`Found ${eps.length} episodes`);
        if (eps.length > 0) {
            console.log(`First Episode: ${eps[0].id} (Number: ${eps[0].number})`);
        }
    } catch (err: any) {
        console.error(`Episodes error: ${err.message}`);
    }
}

debugEpisodes();
