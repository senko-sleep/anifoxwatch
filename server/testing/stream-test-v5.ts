/**
 * Streaming Test v5 - Focus on working APIs
 * Jikan (MyAnimeList) for metadata + find working stream sources
 */

const TIMEOUT = 5000;

function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT ${ms}ms`)), ms));
}

async function testJikanAPI(): Promise<void> {
    console.log('\n=== Jikan (MyAnimeList) API ===');
    
    try {
        // Search for anime
        console.log('Searching for naruto...');
        const searchResp = await Promise.race([
            fetch('https://api.jikan.moe/v4/anime?q=naruto&limit=5', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        
        if (searchResp?.ok) {
            const data = await searchResp.json();
            console.log('Found', data.data?.length, 'results');
            
            if (data.data?.[0]) {
                const anime = data.data[0];
                console.log('First result:', anime.title, anime.mal_id);
                console.log('  Images:', anime.images?.jpg?.image_url);
                console.log('  Episodes:', anime.episodes);
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testStreamingDirect(): Promise<void> {
    console.log('\n=== Testing Stream Direct URLs ===');
    
    // Test known working stream hosts
    const hosts = [
        { name: 'VidPlay', url: 'https://vidplay.site' },
        { name: 'StreamWish', url: 'https://streamwish.to' },
        { name: 'Filemoon', url: 'https://filemoon.in' },
        { name: 'Streamtape', url: 'https://streamtape.com' },
        { name: 'DoodStream', url: 'https://doodstream.com' },
        { name: 'MegaUp', url: 'https://megaup.nl' },
        { name: 'Voe', url: 'https://voe.sx' },
        { name: 'Vidguard', url: 'https://vidguard.to' },
        { name: 'Highload', url: 'https://highload.to' },
    ];
    
    for (const host of hosts) {
        try {
            const start = Date.now();
            const resp = await Promise.race([
                fetch(host.url, { 
                    signal: AbortSignal.timeout(TIMEOUT),
                    redirect: 'follow'
                }),
                timeout(TIMEOUT)
            ]);
            const ms = Date.now() - start;
            console.log(`${host.name}: ${resp.status} (${ms}ms) - ${resp.headers.get('content-type')?.split(';')[0]}`);
        } catch (e) {
            console.log(`${host.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

async function testAnimeSiteHomepages(): Promise<void> {
    console.log('\n=== Testing Anime Site Homepages ===');
    
    const sites = [
        { name: '9animetv', url: 'https://9animetv.to' },
        { name: 'kaido', url: 'https://kaido.to' },
        { name: 'animekisa', url: 'https://animekisa.tv' },
        { name: 'animesuge', url: 'https://animesuge.to' },
        { name: 'animeflv', url: 'https://animeflv.io' },
        { name: 'yugenanime', url: 'https://yugenanime.tv' },
    ];
    
    for (const site of sites) {
        try {
            const start = Date.now();
            const resp = await Promise.race([
                fetch(site.url, { signal: AbortSignal.timeout(TIMEOUT) }),
                timeout(TIMEOUT)
            ]);
            const ms = Date.now() - start;
            console.log(`${site.name}: ${resp.status} (${ms}ms)`);
        } catch (e) {
            console.log(`${site.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

async function testJikanWithStreaming(): Promise<void> {
    console.log('\n=== Full Streaming Test with Jikan ===');
    
    try {
        // 1. Get anime ID from Jikan
        const searchResp = await Promise.race([
            fetch('https://api.jikan.moe/v4/anime?q=demon%20slayer&limit=3', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        
        if (!searchResp?.ok) {
            console.log('Search failed');
            return;
        }
        
        const data = await searchResp.json();
        const anime = data.data?.[0];
        if (!anime) {
            console.log('No results');
            return;
        }
        
        console.log('Found anime:', anime.title, '(MAL ID:', anime.mal_id, ')');
        console.log('  Year:', anime.year);
        console.log('  Episodes:', anime.episodes);
        console.log('  Status:', anime.status);
        
        // 2. Test streaming sites with this anime name
        console.log('\nTesting streaming sites with:', anime.title);
        
        const query = encodeURIComponent(anime.title.toLowerCase().replace(/\s+/g, ' '));
        
        const streamTests = [
            { name: '9animetv search', url: `https://9animetv.to/search?keyword=${query}` },
            { name: 'kaido search', url: `https://kaido.to/search?keyword=${query}` },
            { name: 'animekisa', url: `https://animekisa.tv/search?term=${query}` },
        ];
        
        for (const test of streamTests) {
            try {
                const resp = await Promise.race([
                    fetch(test.url, { signal: AbortSignal.timeout(TIMEOUT) }),
                    timeout(TIMEOUT)
                ]);
                console.log(`${test.name}: ${resp.status}`);
            } catch (e) {
                console.log(`${test.name}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testAnimeFreak(): Promise<void> {
    console.log('\n=== Testing animefreak.tv ===');
    
    try {
        const sites = [
            'https://animefreak.tv',
            'https://www.animefreak.tv',
            'https://animefreak.site'
        ];
        
        for (const url of sites) {
            try {
                const resp = await Promise.race([
                    fetch(url, { signal: AbortSignal.timeout(TIMEOUT) }),
                    timeout(TIMEOUT)
                ]);
                console.log(`${url}: ${resp.status}`);
                if (resp.ok) break;
            } catch {}
        }
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testZoroHomepage(): Promise<void> {
    console.log('\n=== Testing Zoro sites ===');
    
    const sites = [
        'https://zoro.to',
        'https://zoroxtv.to',
        'https://zoro.black',
    ];
  
    for (const url of sites) {
        try {
            const resp = await Promise.race([
                fetch(url, { signal: AbortSignal.timeout(TIMEOUT) }),
                timeout(TIMEOUT)
            ]);
            console.log(`${url}: ${resp.status}`);
            if (resp.ok) break;
        } catch {}
    }
}

async function runTests(): Promise<void> {
    console.log('=== STREAMING TEST v5 - Working APIs ===\n');
    console.log('Timestamp:', new Date().toISOString());
    
    await testJikanAPI();
    await testStreamingDirect();
    await testAnimeSiteHomepages();
    await testJikanWithStreaming();
    await testAnimeFreak();
    await testZoroHomepage();
    
    console.log('\n=== TESTS COMPLETE ===');
}

runTests().catch(console.error);