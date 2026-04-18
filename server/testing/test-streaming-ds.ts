/**
 * Test streaming - demonslayer directly
 */

async function testStreaming(): Promise<void> {
    console.log('=== Testing Streaming - Demon Slayer ===');
    
    try {
        const { HiAnime } = await import('aniwatch');
        const scraper = new HiAnime.Scraper();
        
        // Use the correct ID for demon slayer
        const animeId = 'demon-slayer-kimetsu-no-yaiba-47';
        
        // 2. Get anime info (episodes)
        console.log('\n1. Get anime info for', animeId, '...');
        const info = await scraper.getInfo(animeId);
        console.log('Info keys:', Object.keys(info));
        console.log('Anime info:', info.anime?.info?.name);
        
        const episodes = info.anime?.episodes || [];
        console.log('Episodes found:', episodes.length);
        
        if (!episodes.length) {
            // Try different structure
            console.log('\n1b. Try getEpisodes method...');
            const eps = await scraper.getEpisodes(animeId);
            console.log('getEpisodes result:', typeof eps, Array.isArray(eps) ? eps.length : 'not array');
            return;
        }
        
        const firstEp = episodes[0];
        console.log('First episode keys:', Object.keys(firstEp));
        console.log('First episode:', firstEp);
        
        if (!firstEp) {
            console.log('No episode found');
            return;
        }
        
        const epId = typeof firstEp === 'string' ? firstEp : firstEp.id;
        console.log('Episode ID to use:', epId);
        
        // 3. Get episode servers
        console.log('\n2. Get episode servers...');
        const servers = await scraper.getEpisodeServers(epId);
        console.log('Servers keys:', Object.keys(servers));
        console.log('Has sub:', servers.sub?.length);
        console.log('Has dub:', servers.dub?.length);
        
        const serverToUse = servers.sub?.[0] || servers.dub?.[0];
        if (!serverToUse) {
            console.log('No servers found');
            return;
        }
        
        console.log('Server to use:', serverToUse);
        
        // 4. Get episode sources (actual stream URLs)
        console.log('\n3. Get episode sources...');
        const serverId = serverToUse.serverId?.toString() || 'vidstreaming';
        console.log('Using server:', serverId);
        
        const sources = await scraper.getEpisodeSources(epId, serverId, 'sub');
        console.log('Sources:', sources.sources?.length || 0);
        
        if (sources.sources?.[0]) {
            console.log('\n4. SUCCESS - Got stream URL!');
            console.log('First source:');
            console.log('  URL:', sources.sources[0].url);
            console.log('  Quality:', sources.sources[0].quality);
            console.log('  Is M3U8:', sources.sources[0].isM3U8);
        } else {
            console.log('No sources found');
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testStreaming().then(() => console.log('\n=== TEST COMPLETE ===')).catch(console.error);