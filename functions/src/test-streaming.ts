
import { HiAnimeSource } from './src/sources/hianime-source.js';
import { logger } from './src/utils/logger.js';

// Setup logging for test
process.env.LOG_LEVEL = 'DEBUG';

async function testStreaming() {
    console.log('🚀 Starting HiAnime Source Test...\n');

    // Test parameters (using a known popular anime)
    // Frieren: frieren-beyond-journeys-end-18542
    // Episode 1 ID from previous successful requests or logical guess
    const animeId = 'frieren-beyond-journeys-end-18542';
    // Usually episode ID is like "$animeId?ep=$number" for some sources, 
    // or just a number for others. The user example showed: "?ep=107257"
    // Let's try to get episodes first to find a valid episode ID

    const source = new HiAnimeSource();

    try {
        // 1. Get Anime Details
        console.log(`\n1️⃣  Fetching anime info for: ${animeId}`);
        const anime = await source.getAnime(`hianime-${animeId}`);
        if (!anime) {
            console.error('❌ Failed to find anime');
            return;
        }
        console.log(`✅ Found: ${anime.title} (${anime.id})`);

        // 2. Get Episodes
        console.log(`\n2️⃣  Fetching episodes...`);
        const episodes = await source.getEpisodes(`hianime-${animeId}`);
        if (episodes.length === 0) {
            console.error('❌ No episodes found');
            return;
        }
        console.log(`✅ Found ${episodes.length} episodes`);

        const firstEpisode = episodes[0];
        console.log(`   Testing Episode 1: ID=${firstEpisode.id}`);

        // 3. Get Stream Servers
        console.log(`\n3️⃣  Fetching servers for episode: ${firstEpisode.id}`);
        // The episode.id from getEpisodes already contains the necessary format usually
        const servers = await source.getEpisodeServers(firstEpisode.id);

        if (servers.length === 0) {
            console.error('❌ No servers found');
            return;
        }
        console.log(`✅ Found ${servers.length} servers:`);
        servers.forEach(s => console.log(`   - ${s.name} (${s.type})`));

        // 4. Get Streaming Link
        const targetServer = servers.find(s => s.type === 'sub') || servers[0];
        console.log(`\n4️⃣  Fetching stream from server: ${targetServer.name} (${targetServer.type})`);

        const streamData = await source.getStreamingLinks(firstEpisode.id, targetServer.name, targetServer.type as 'sub' | 'dub');

        if (streamData.sources.length === 0) {
            console.error('❌ No streaming links found');
            console.log('Debug of streamData:', JSON.stringify(streamData, null, 2));
        } else {
            console.log('✅ Success! Stream found:');
            console.log(`   URL: ${streamData.sources[0].url}`);
            console.log(`   Quality: ${streamData.sources[0].quality}`);
            console.log(`   IsM3U8: ${streamData.sources[0].isM3U8}`);
        }

    } catch (error) {
        console.error('🚨 Test Failed:', error);
    }
}

testStreaming();
