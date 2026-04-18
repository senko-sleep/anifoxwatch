/**
 * Full streaming workflow test
 */

async function testFullWorkflow(): Promise<void> {
    console.log('=== FULL STREAMING WORKFLOW ===');
    
    try {
        const { HiAnime } = await import('aniwatch');
        const scraper = new HiAnime.Scraper();
        
        // 1. Search
        console.log('\n1. Search for anime...');
        const search = await scraper.search('demon slayer', 1);
        console.log('Found:', search.animes?.[0]?.id, search.animes?.[0]?.name);
        
        const animeId = search.animes?.[0]?.id;
        if (!animeId) {
            console.log('No anime found');
            return;
        }
        
        // 2. Get episodes
        console.log('\n2. Get episodes for', animeId, '...');
        const episodesResult = await scraper.getEpisodes(animeId);
        const episodes = episodesResult.episodes;
        console.log('Episodes found:', episodes?.length || 0);
        
        if (!episodes?.length) {
            console.log('No episodes');
            return;
        }
        
        // 3. Get stream for first episode
        const firstEp = episodes[0];
        console.log('\n3. Episode:', firstEp?.episodeId, firstEp?.number, firstEp?.title);
        
        // 4. Get servers for episode
        const servers = await scraper.getEpisodeServers(firstEp.episodeId);
        console.log('Servers (sub):', servers.sub?.length);
        console.log('Servers (dub):', servers.dub?.length);
        
        if (!servers.sub?.length) {
            console.log('No servers');
            return;
        }
        
        // 5. Get sources!
        console.log('\n4. Getting sources from server:', servers.sub[0].serverId);
        const sources = await scraper.getEpisodeSources(
            firstEp.episodeId, 
            servers.sub[0].serverId?.toString() || '4', 
            'sub'
        );
        
        console.log('Sources found:', sources.sources?.length);
        
        if (sources.sources?.[0]) {
            console.log('\n*** SUCCESS! ***');
            console.log('Stream URL:', sources.sources[0].url?.slice(0, 100));
        } else {
            console.log('No sources returned');
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testFullWorkflow().then(() => console.log('\n=== DONE ===')).catch(console.error);