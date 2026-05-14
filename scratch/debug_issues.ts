
import { sourceManager } from '../server/src/services/source-manager.js';
import { logger } from '../server/src/utils/logger.js';

async function test() {
    const id1 = 'anilist-189046';
    console.log(`\n--- Testing ${id1} ---`);
    const eps1 = await sourceManager.getEpisodes(id1);
    console.log(`Found ${eps1.length} episodes for ${id1}`);
    if (eps1.length > 0) {
        console.log(`First episode:`, eps1[0]);
    }

    const id2 = 'animekai-spy-x-family-season-3-v2q8';
    console.log(`\n--- Testing ${id2} ---`);
    const eps2 = await sourceManager.getEpisodes(id2);
    console.log(`Found ${eps2.length} episodes for ${id2}`);
    
    console.log(`\nFetching stream for ${id2} ep 1...`);
    const stream = await sourceManager.getStreamingLinks(id2, undefined, 'sub', 1);
    console.log(`Stream found:`, stream.sources.length, `sources`);
    if (stream.sources.length > 0) {
        console.log(`First source:`, stream.sources[0].url);
    }
}

test().catch(console.error);
