import { sourceManager } from '../src/services/source-manager.js';

async function run() {
    const epId = 'anilist-6347';
    console.log(`Getting episodes for ${epId}...`);
    const eps = await sourceManager.getEpisodes(epId);
    console.log(`Found ${eps.length} episodes`);
    if (eps.length > 0) {
        console.log("First episode:", eps[0]);
    }
}
run();
