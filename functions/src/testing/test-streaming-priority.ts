
import { sourceManager } from '../src/services/source-manager';
import { logger } from '../src/utils/logger';

// Mock logger to avoid clutter
logger.info = console.log;
logger.warn = console.warn;
logger.error = console.error;

async function testStreamingPriority() {
    const animeId = 'hianime-one-piece-100'; // Using popular anime likely to have sources
    const episodeId = `${animeId}?ep=10065`; // Specific episode (One Piece Ep 1)

    console.log(`\nTesting streaming priority for ${episodeId}...`);

    try {
        // 1. Check Episode Servers
        console.log('\n1. Fetching Episode Servers...');
        const servers = await sourceManager.getEpisodeServers(episodeId);
        console.log('Servers found:', servers.length);
        console.log('Server order:', servers.map(s => s.name).join(', '));

        if (servers.length > 0 && servers[0].name === 'hd-2') {
            console.log('✅ PASS: hd-2 is the first server');
        } else {
            console.log('❌ FAIL: hd-2 is NOT the first server');
        }

        // 2. Check Streaming Links for hd-2
        console.log('\n2. Fetching Streaming Links for hd-2...');
        const links = await sourceManager.getStreamingLinks(episodeId, 'hd-2', 'sub');
        console.log('Sources found:', links.sources.length);

        if (links.sources.length > 0) {
            console.log('✅ PASS: Successfully retrieved sources from hd-2');
            links.sources.forEach(s => {
                console.log(`- ${s.quality}: ${s.url.substring(0, 50)}...`);
            });
        } else {
            console.log('⚠️ WARN: No sources found for hd-2 (might be region locked or temporary issue)');
        }

    } catch (error: any) {
        console.error('❌ Error during test:', error.message);
    }
}

testStreamingPriority();
