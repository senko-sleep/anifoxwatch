import { SourceManager } from '../server/src/services/source-manager';
import { logger } from '../server/src/services/logger';

async function test() {
    const sm = SourceManager.getInstance();
    const animeId = 'anilist-189046'; // Re:ZERO S4
    const episodeNum = 2;
    
    console.log(`Testing SourceManager for ${animeId} EP ${episodeNum}...`);
    
    // We need to find the actual episode ID first
    const episodes = await sm.getEpisodes(animeId);
    const ep = episodes.find(e => e.number === episodeNum);
    
    if (!ep) {
        console.error('Episode not found');
        return;
    }
    
    console.log(`Found episode: ${ep.id}`);
    
    const stream = await sm.getStreamingLinks(ep.id, { category: 'dub' });
    
    console.log('\n--- Stream Data ---');
    console.log(`Source count: ${stream.sources.length}`);
    console.log(`Servers:`, stream.servers);
    console.log(`Primary source: ${stream.source}`);
    
    if (stream.sources.length > 0) {
        console.log(`First URL: ${stream.sources[0].url.substring(0, 100)}...`);
    }
    
    process.exit(0);
}

test().catch(console.error);
