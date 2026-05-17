import { sourceManager } from '../server/src/services/source-manager.js';
import { anilistService } from '../server/src/services/anilist-service.js';

async function debugPlayback() {
    const anilistId = 6347;
    const epNum = 5;
    
    console.log(`🔍 Debugging playback for AniList ID: ${anilistId}, Ep: ${epNum}`);
    
    // 1. Get AniList data
    const anime = await anilistService.getAnimeById(anilistId);
    console.log(`   Title: ${anime?.title?.english || anime?.title?.romaji}`);
    
    // 2. Resolve to streaming ID
    const streamingId = await sourceManager.resolveAniListToStreamingId(anilistId);
    console.log(`   Streaming ID: ${streamingId || 'FAILED TO RESOLVE'}`);
    
    // 3. Try to get streaming links from different sources
    const sourcesToTest = ['Gogoanime', 'AnimeKai', 'Aniwaves'];
    for (const sourceName of sourcesToTest) {
        console.log(`\n   📡 Testing source: ${sourceName}`);
        try {
            const links = await sourceManager.getStreamingLinks(streamingId, sourceName, 'sub', epNum, anilistId);
            console.log(`      [${sourceName}] Links Found: ${links.sources?.length > 0}`);
            if (links.sources?.length > 0) {
                console.log(`      [${sourceName}] First Link: ${links.sources[0].url.substring(0, 100)}...`);
                console.log(`      [${sourceName}] Server: ${links.sources[0].server || 'unknown'}`);
            }
        } catch (e) {
            console.error(`      [${sourceName}] Error:`, e);
        }
    }
}

debugPlayback().catch(console.error);
