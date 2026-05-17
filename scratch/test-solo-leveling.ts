import { sourceManager } from '../server/src/services/source-manager.js';
import { logger } from '../server/src/utils/logger.js';

async function testSoloLeveling() {
    const sm = sourceManager;
    
    // Solo Leveling AniList ID
    const id = 'anilist-151807'; 
    const epNum = 1;
    
    console.log(`Testing Solo Leveling Ep ${epNum}...`);
    
    try {
        const episodes = await sm.getEpisodes(id);
        console.log(`Found ${episodes.length} episodes`);
        
        const ep1 = episodes.find(e => e.number === epNum);
        if (ep1) {
            console.log(`Ep 1 ID: ${ep1.id}`);
            console.log(`Fetching SUB streaming links...`);
            const sub = await sm.getStreamingLinks(ep1.id, undefined, 'sub', epNum);
            console.log(`SUB: ${sub.sources.length} sources found`);
            if (sub.sources.length > 0) {
                console.log(`First SUB URL: ${sub.sources[0].url}`);
            }
            
            console.log(`Fetching DUB streaming links...`);
            const dub = await sm.getStreamingLinks(ep1.id, undefined, 'dub', epNum);
            console.log(`DUB: ${dub.sources.length} sources found`);
             if (dub.sources.length > 0) {
                console.log(`First DUB URL: ${dub.sources[0].url}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

testSoloLeveling().catch(console.error);
