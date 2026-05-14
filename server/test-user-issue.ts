
import { sourceManager } from './src/services/source-manager.js';
import { logger } from './src/utils/logger.js';

// Disable logger noise but keep console.log
logger.level = 'warn';

async function testStreaming() {
    const anilistId = 'anilist-6347';
    const episodeNum = 4;

    try {
        console.log(`\n🔍 Fetching episodes for ${anilistId}...`);
        const episodes = await sourceManager.getEpisodes(anilistId);

        console.log(`✅ Found ${episodes.length} episodes`);

        const targetEp = episodes.find(e => e.number === episodeNum);
        if (!targetEp) {
            console.error(`❌ Episode ${episodeNum} not found in episode list`);
            return;
        }

        console.log(`\n🎯 Found episode ${episodeNum}:`, targetEp.id);

        console.log(`\n📡 Fetching streaming links for ${targetEp.id}...`);
        const streamData = await sourceManager.getStreamingLinks(targetEp.id, undefined, 'sub', episodeNum, 6347);

        console.log('\n🎬 Streaming Result:');
        console.log(JSON.stringify(streamData, null, 2));

        if (!streamData.sources || streamData.sources.length === 0) {
            console.error('\n❌ NO SOURCES FOUND');
        } else {
            console.log(`\n✅ Found ${streamData.sources.length} sources`);
        }

    } catch (error) {
        console.error('❌ Error during test:', error.message);
        console.error(error.stack);
    }
}

testStreaming();
