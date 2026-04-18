/**
 * Test aniwatch package directly
 * This tests the HiAnime scraper that the worker uses
 */

const TIMEOUT = 10000;

async function testAniwatch(): Promise<void> {
    console.log('=== Testing aniwatch package ===');
    
    try {
        // Dynamic import to test the package
        const { HiAnime } = await import('aniwatch');
        console.log('Imported HiAnime:', Object.keys(HiAnime));
        
        // Create scraper
        const scraper = new HiAnime.Scraper();
        console.log('Created scraper');
        
        // Test search
        console.log('\n1. Testing search...');
        try {
            const search = await Promise.race(
                scraper.search('naruto', 1),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT))
            );
            console.log('Search results:', search.animes?.length || 0);
            if (search.animes?.[0]) {
                console.log('First result:', search.animes[0]);
            }
        } catch (e) {
            console.log('Search error:', e instanceof Error ? e.message : String(e));
        }
        
        // Test home page
        console.log('\n2. Testing getHomePage...');
        try {
            const home = await Promise.race(
                scraper.getHomePage(),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT))
            );
            console.log('Home page: OK');
            console.log('Featured:', home.featured?.length || 0);
            console.log('Trending:', home.trending?.length || 0);
        } catch (e) {
            console.log('Home error:', e instanceof Error ? e.message : String(e));
        }
        
        // Test getAnime for a specific anime
        console.log('\n3. Testing getAnime...');
        try {
            // First get anime ID from search
            const search = await scraper.search('naruto', 1);
            if (search.animes?.[0]) {
                const animeId = search.animes[0].id;
                console.log('Found anime ID:', animeId);
                
                const anime = await Promise.race(
                    scraper.getAnime(animeId),
                    new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT))
                );
                console.log('Anime:', anime);
                
                // Get episodes
                if (anime.episodes) {
                    console.log('Episodes:', anime.episodes.length);
                    if (anime.episodes[0]) {
                        const epId = anime.episodes[0].id;
                        console.log('First episode ID:', epId);
                        
                        // Test getEpisodeServers
                        console.log('\n4. Testing getEpisodeServers...');
                        const servers = await Promise.race(
                            scraper.getEpisodeServers(epId),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT))
                        );
                        console.log('Sub servers:', servers.sub?.length || 0);
                        console.log('Dub servers:', servers.dub?.length || 0);
                        if (servers.sub?.[0]) {
                            console.log('First sub server:', servers.sub[0]);
                            
                            // Test getEpisodeSources
                            console.log('\n5. Testing getEpisodeSources...');
                            const sources = await Promise.race(
                                scraper.getEpisodeSources(epId, servers.sub[0].serverId?.toString() || 'vidstreaming', 'sub'),
                                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT))
                            );
                            console.log('Sources:', sources.sources?.length || 0);
                            if (sources.sources?.[0]) {
                                console.log('First source URL:', sources.sources[0].url?.slice(0, 100));
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.log('Anime/Episode error:', e instanceof Error ? e.message : String(e));
        }
        
    } catch (e) {
        console.log('Import error:', e instanceof Error ? e.message : String(e));
    }
}

testAniwatch().then(() => console.log('\n=== TEST COMPLETE ===')).catch(console.error);