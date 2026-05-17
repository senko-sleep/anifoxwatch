
import { MiruroSource } from '../src/sources/miruro-source.js';
import { logger } from '../src/utils/logger.js';

async function testMiruroDub() {
    const miruro = new MiruroSource();
    const animeId = 'miruro-baka-to-test-to-shoukanjuu-80914'; // Baka to Test
    const epId = 'baka-to-test-to-shoukanjuu-80914?ep=94388'; // Ep 1 or similar

    console.log('🧪 TESTING MIRURO DUB');
    console.log('====================\n');

    try {
        console.log(`🔍 Fetching episodes for ${animeId}...`);
        const episodes = await miruro.getEpisodes(animeId);
        console.log(`✅ Found ${episodes.length} episodes`);
        
        if (episodes.length > 0) {
            const firstEp = episodes[0];
            console.log(`🎬 Fetching DUB links for Ep ${firstEp.number} (${firstEp.id})...`);
            
            const links = await miruro.getStreamingLinks(firstEp.id, undefined, 'dub');
            
            if (links.sources.length > 0) {
                console.log(`✅ SUCCESS: Found ${links.sources.length} DUB sources`);
                console.log(`🔗 First URL: ${links.sources[0].url.substring(0, 100)}...`);
            } else {
                console.log(`❌ FAILED: No DUB sources found`);
            }
        }
    } catch (err) {
        console.error(`❌ ERROR: ${err instanceof Error ? err.message : err}`);
    }
}

testMiruroDub();
