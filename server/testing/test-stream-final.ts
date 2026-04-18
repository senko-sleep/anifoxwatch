/**
 * Test streaming - GET STREAMS NOW
 */

async function testStreaming(): Promise<void> {
    console.log('=== TESTING STREAMS NOW ===');
    
    try {
        const { HiAnime } = await import('aniwatch');
        const scraper = new HiAnime.Scraper();
        
        // Get episode ID for demon slayer episode 1
        const animeId = 'demon-slayer-kimetsu-no-yaiba-47';
        const episodeId = `${animeId}?ep=1279`;
        
        console.log('Episode ID:', episodeId);
        
        // Get servers
        console.log('\n1. Get servers...');
        const servers = await scraper.getEpisodeServers(episodeId);
        console.log('Sub servers:', servers.sub?.length);
        console.log('Dub servers:', servers.dub?.length);
        
        if (!servers.sub?.length && !servers.dub?.length) {
            console.log('No servers found');
            return;
        }
        
        const serverInfo = servers.sub[0];
        console.log('First server:', serverInfo);
        
        // Get sources
        console.log('\n2. Get sources...');
        const serverId = serverInfo.serverId?.toString() || 'vidstreaming';
        console.log('Using server ID:', serverId);
        
        const sources = await scraper.getEpisodeSources(episodeId, serverId, 'sub');
        console.log('Sources:', sources.sources?.length || 0);
        
        if (sources.sources?.[0]) {
            console.log('\n*** SUCCESS - STREAM URL FOUND ***');
            const src = sources.sources[0];
            console.log('URL:', src.url?.slice(0, 150));
            console.log('Quality:', src.quality);
            console.log('Is M3U8:', src.isM3U8);
        } else {
            console.log('No sources returned');
            console.log('Full response:', JSON.stringify(sources).slice(0, 300));
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testStreaming().then(() => console.log('\n=== DONE ===')).catch(console.error);