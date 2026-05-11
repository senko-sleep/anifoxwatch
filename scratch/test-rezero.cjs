
const { sourceManager } = require('./server/dist/services/source-manager.js');
const { logger } = require('./server/dist/utils/logger.js');

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
        }
    }
}

test().catch(console.error);
