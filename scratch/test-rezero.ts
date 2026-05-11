
import { sourceManager } from '../server/src/services/source-manager.js';
import { logger } from '../server/src/utils/logger.js';

async function test() {
    console.log('Resolving anilist-189046...');
    const streamingId = await sourceManager.resolveAniListToStreamingId(189046);
    console.log('Resolved to:', streamingId);
    
    if (streamingId) {
        console.log('Fetching episodes for:', streamingId);
        const episodes = await sourceManager.getEpisodes(streamingId);
        console.log('Found', episodes.length, 'episodes');
        if (episodes.length > 0) {
            console.log('First 5 episodes:', episodes.slice(0, 5).map(e => ({ number: e.number, id: e.id, hasDub: e.hasDub })));
            
            // Try to fetch ep 2 stream if requested by user
            console.log('Fetching stream for episode 2...');
            const ep2 = episodes.find(e => e.number === 2) || episodes[1];
            if (ep2) {
                const subLinks = await sourceManager.getStreamingLinks(ep2.id, undefined, 'sub');
                console.log('Sub links:', subLinks.sources.length > 0 ? 'Found' : 'Not found');
                const dubLinks = await sourceManager.getStreamingLinks(ep2.id, undefined, 'dub');
                console.log('Dub links:', dubLinks.sources.length > 0 ? 'Found' : 'Not found');
            }
        }
    }
}

test().catch(console.error);
