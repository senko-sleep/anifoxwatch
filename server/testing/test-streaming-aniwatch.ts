/**
 * Test streaming extraction via aniwatch package
 */

async function testStreaming(): Promise<void> {
    console.log('=== Testing Streaming via aniwatch ===');
    
    try {
        const { HiAnime } = await import('aniwatch');
        const scraper = new HiAnime.Scraper();
        
        // 1. Search for anime
        console.log('\n1. Search for demon slayer...');
        const search = await scraper.search('demon slayer', 1);
        const anime = search.animes?.[0];
        console.log('Found anime:', anime?.id, anime?.name);
        
        if (!anime) {
            console.log('No anime found');
            return;
        }
        
        // 2. Get anime info (episodes)
        console.log('\n2. Get anime info...');
        const info = await scraper.getInfo(anime.id);
        console.log('Info:', info);
        
        const firstEp = info.episodes?.[0];
        console.log('First episode:', firstEp);
        
        if (!firstEp) {
            console.log('No episodes found');
            return;
        }
        
        // 3. Get episode servers
        console.log('\n3. Get episode servers...');
        const servers = await scraper.getEpisodeServers(firstEp.id);
        console.log('Sub servers:', servers.sub?.length);
        console.log('Dub servers:', servers.dub?.length);
        
        const serverToUse = servers.sub?.[0] || servers.dub?.[0];
        if (!serverToUse) {
            console.log('No servers found');
            return;
        }
        
        console.log('Using server:', serverToUse);
        
        // 4. Get episode sources (actual stream URLs)
        console.log('\n4. Get episode sources...');
        const sources = await scraper.getEpisodeSources(
            firstEp.id, 
            serverToUse.serverId?.toString() || 'vidstreaming', 
            'sub'
        );
        console.log('Sources:', sources.sources?.length || 0);
        console.log('Has Subtitles:', sources.subtitles?.length || 0);
        
        if (sources.sources?.[0]) {
            console.log('First source URL:');
            console.log('  URL:', sources.sources[0].url?.slice(0, 200));
            console.log('  Quality:', sources.sources[0].quality);
            console.log('  Is M3U8:', sources.sources[0].isM3U8);
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testStreaming().then(() => console.log('\n=== TEST COMPLETE ===')).catch(console.error);