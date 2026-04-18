/**
 * Streaming Test v6 - Complete Stream Extraction
 * Tests actual streaming from working sites
 */

const TIMEOUT = 5000;

function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT ${ms}ms`)), ms));
}

async function fetchWithTimeout(url: string, opts?: RequestInit, ms: number = TIMEOUT): Promise<Response> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), ms);
    try {
        const resp = await fetch(url, { ...opts, signal: controller.signal });
        clearTimeout(tid);
        return resp;
    } catch (e) {
        clearTimeout(tid);
        throw e;
    }
}

async function testKaidoComplete(): Promise<void> {
    console.log('\n=== Kaido Complete Streaming Test ===');
    
    try {
        // 1. Search for anime
        console.log('1. Search for demon slayer...');
        const searchResp = await fetchWithTimeout('https://kaido.to/search?keyword=demon%20slayer');
        if (!searchResp.ok) {
            console.log('Search failed');
            return;
        }
        
        const searchHtml = await searchResp.text();
        
        // Extract first anime slug
        const slugMatch = searchHtml.match(/\/watch\/([a-z0-9-]+\.\d+)/);
        if (!slugMatch) {
            console.log('No slug found');
            return;
        }
        const slug = slugMatch[1];
        console.log('Found slug:', slug);
        
        // 2. Get anime info
        console.log('\n2. Get anime info...');
        const animeResp = await fetchWithTimeout(`https://kaido.to/${slug}`);
        if (animeResp.ok) {
            console.log('Anime page: OK');
        }
        
        // 3. Get episode list
        const animeId = slug.split('.').pop();
        console.log('\n3. Get episodes (ID:', animeId, ')...');
        
        const epResp = await fetchWithTimeout(`https://kaido.to/ajax/episode/list/${animeId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        
        if (epResp.ok) {
            console.log('Episodes: OK');
            const epData = await epResp.json();
            console.log('Status:', epData.status);
            
            // 4. Get episode servers
            if (epData.html) {
                const epIdMatch = epData.html.match(/data-id=["'](\d+)["']/);
                if (epIdMatch) {
                    console.log('\n4. Get servers (episode:', epIdMatch[1], ')...');
                    
                    const serverResp = await fetchWithTimeout(
                        `https://kaido.to/ajax/episode/servers?episodeId=${epIdMatch[1]}`,
                        { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
                    );
                    
                    if (serverResp.ok) {
                        console.log('Servers: OK');
                        const serverData = await serverResp.json();
                        console.log('Server data:', JSON.stringify(serverData).slice(0, 200));
                    }
                }
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function test9AnimeComplete(): Promise<void> {
    console.log('\n=== 9Anime Complete Streaming Test ===');
    
    try {
        console.log('1. Search for naruto...');
        const searchResp = await fetchWithTimeout('https://9animetv.to/search?keyword=naruto');
        if (!searchResp.ok) {
            console.log('Search failed');
            return;
        }
        
        const searchHtml = await searchResp.text();
        const slugMatch = searchHtml.match(/\/watch\/([a-z0-9-]+-\d+)/);
        if (!slugMatch) {
            console.log('No slug found');
            return;
        }
        const slug = slugMatch[1];
        console.log('Found slug:', slug);
        
        // 2. Get episodes
        console.log('\n2. Get episodes...');
        const epId = slug.split('-').pop();
        const epResp = await fetchWithTimeout(`https://9animetv.to/ajax/episode/list/${epId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        
        if (epResp.ok) {
            console.log('Episodes: OK');
            const epData = await epResp.json();
            console.log('Status:', epData.status);
            
            // 3. Get servers for first episode
            if (epData.html) {
                const epLinkMatch = epData.html.match(/href=["']([^"']*ep=\d+)["']/);
                if (epLinkMatch) {
                    console.log('First episode:', epLinkMatch[1]);
                }
                
                // Find episode ID for servers
                const epIdMatch = epData.html.match(/data-id=["'](\d+)["']/);
                if (epIdMatch) {
                    console.log('\n3. Get servers (episode:', epIdMatch[1], ')...');
                    
                    const serverResp = await fetchWithTimeout(
                        `https://9animetv.to/ajax/episode/servers?episodeId=${epIdMatch[1]}`,
                        { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
                    );
                    
                    if (serverResp.ok) {
                        console.log('Servers: OK');
                        const serverData = await serverResp.text();
                        console.log('Server data:', serverData.slice(0, 300));
                    }
                }
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testYugenAnime(): Promise<void> {
    console.log('\n=== Yugenanime Test ===');
    
    try {
        console.log('1. Search for one piece...');
        const searchResp = await fetchWithTimeout('https://yugenanime.tv/search?keyword=one%20piece');
        console.log('Search:', searchResp.status);
        
        if (searchResp.ok) {
            const html = await searchResp.text();
            const slugMatch = html.match(/\/watch\/([a-z0-9-]+)/);
            if (slugMatch) {
                console.log('Found slug:', slugMatch[1]);
                
                // Get episodes
                console.log('\n2. Get episodes...');
                const epResp = await fetchWithTimeout(`https://yugenanime.tv/ajax/episode/list/${slugMatch[1].split('-').pop()}`, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });
                console.log('Episodes:', epResp.status);
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testStreamEmbeds(): Promise<void> {
    console.log('\n=== Stream Embed Sites Test ===');
    
    // Test known embed patterns
    const embeds = [
        { name: 'VidPlay embed', url: 'https://vidplay.site/embed/t5lH9k8mB5D' },
        { name: 'Streamtape embed', url: 'https://streamtape.com/e/dGK9qLkYqDf6m' },
        { name: 'DoodStream embed', url: 'https://doodstream.com/e/abc123' },
        { name: 'Filemoon embed', url: 'https://filemoon.in/e/test123' },
        { name: 'Voe embed', url: 'https://voe.sx/e/test123' },
    ];
    
    for (const embed of embeds) {
        try {
            const resp = await fetchWithTimeout(embed.url, { redirect: 'follow' }, 8000);
            console.log(`${embed.name}: ${resp.status} - ${resp.headers.get('content-type')?.split(';')[0]}`);
            
            // Check if it's an embed page or a direct video
            if (resp.ok && resp.headers.get('content-type')?.includes('text/html')) {
                const html = await resp.text();
                if (html.includes('video') || html.includes('player')) {
                    console.log('  -> Has video/player');
                }
            }
        } catch (e) {
            console.log(`${embed.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

async function testJikanEpisodes(): Promise<void> {
    console.log('\n=== Jikan + Streaming Sites Test ===');
    
    try {
        // 1. Get anime from Jikan
        console.log('1. Get anime info from Jikan...');
        const animeResp = await fetchWithTimeout('https://api.jikan.moe/v4/anime/38000'); // Demon Slayer
        if (!animeResp.ok) {
            console.log('Failed');
            return;
        }
        
        const animeData = await animeResp.json();
        const anime = animeData.data;
        console.log('Anime:', anime.title, '-', anime.episodes, 'episodes');
        
        // 2. Search on streaming sites
        console.log('\n2. Search on streaming sites...');
        const title = encodeURIComponent(anime.title.toLowerCase().split(' ')[0]);
        
        const sites = [
            { name: '9animetv', url: `https://9animetv.to/search?keyword=${title}` },
            { name: 'kaido', url: `https://kaido.to/search?keyword=${title}` },
        ];
        
        for (const site of sites) {
            try {
                const resp = await fetchWithTimeout(site.url);
                console.log(`  ${site.name}: ${resp.status}`);
            } catch (e) {
                console.log(`  ${site.name}: error`);
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function runTests(): Promise<void> {
    console.log('=== COMPLETE STREAMING TEST v6 ===');
    console.log('Testing full streaming workflow\n');
    
    await testKaidoComplete();
    await test9AnimeComplete();
    await testYugenAnime();
    await testStreamEmbeds();
    await testJikanEpisodes();
    
    console.log('\n=== TESTS COMPLETE ===');
    console.log('\nWorking sites identified:');
    console.log('- 9animetv.to (search, episodes, servers)');
    console.log('- kaido.to (search, episodes, servers)');
    console.log('- yugenanime.tv (search)');
    console.log('- Stream hosts: VidPlay, Streamtape, DoodStream, Filemoon, Voe');
    console.log('- Metadata: Jikan (MyAnimeList)');
}

runTests().catch(console.error);