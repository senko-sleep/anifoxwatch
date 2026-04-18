/**
 * Streaming Test Suite v2 - Focus on working sites
 * Tests streaming extraction from confirmed working sites
 */

const TIMEOUT = 5000;
const STREAM_TIMEOUT = 8000;

function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT ${ms}ms`)), ms));
}

async function fetchWithTimeout(url: string, opts?: { method?: string; body?: string; headers?: Record<string, string> }, ms: number = TIMEOUT): Promise<Response> {
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

async function testHiAnimeAPI(): Promise<void> {
    console.log('\n=== Testing HiAnime API (hianime.to) ===');
    try {
        // Try search
        console.log('Testing search...');
        const searchResp = await Promise.race([
            fetch('https://hianime.to/search?keyword=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('Search page:', searchResp?.status === 200 ? 'OK' : `HTTP ${searchResp?.status}`);
        
        // Try API endpoint (aniwatch-compatible)
        console.log('Testing episode list API...');
        try {
            const epResp = await Promise.race([
                fetch('https://hianime.to/ajax/anime/slug/naruto-18691', { signal: AbortSignal.timeout(TIMEOUT) }),
                timeout(TIMEOUT)
            ]);
            console.log('Episode list:', epResp?.status === 200 ? 'OK' : `HTTP ${epResp?.status}`);
            if (epResp?.ok) {
                const data = await epResp.text();
                console.log('Sample:', data.slice(0, 200));
            }
        } catch {}
        
    } catch (e) {
        console.log('HiAnime error:', e instanceof Error ? e.message : String(e));
    }
}

async function testMiruroAPI(): Promise<void> {
    console.log('\n=== Testing Miruro API (miruro.tv) ===');
    try {
        const endpoints = [
            'https://miruro.tv/api/anime/trending',
            'https://api.miruro.tv/anime/trending',
            'https://miruro.tv/search?q=naruto'
        ];
        
        for (const url of endpoints) {
            try {
                console.log(`Trying: ${url}`);
                const resp = await Promise.race([
                    fetch(url, { signal: AbortSignal.timeout(TIMEOUT) }),
                    timeout(TIMEOUT)
                ]);
                if (resp.ok) {
                    console.log(`  OK: ${resp.status}`);
                    const data = await resp.json();
                    console.log('  Data:', JSON.stringify(data).slice(0, 200));
                    break;
                } else {
                    console.log(`  HTTP ${resp.status}`);
                }
            } catch (e) {
                console.log(`  Error:`, e instanceof Error ? e.message : String(e));
            }
        }
    } catch (e) {
        console.log('Miruro error:', e instanceof Error ? e.message : String(e));
    }
}

async function testKaidoStreaming(): Promise<void> {
    console.log('\n=== Testing Kaido Streaming ===');
    try {
        // Search for anime
        console.log('Searching for naruto...');
        const searchResp = await Promise.race([
            fetch('https://kaido.to/search?keyword=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('Search:', searchResp?.status === 200 ? 'OK' : `HTTP ${searchResp?.status}`);
        
        if (searchResp?.ok) {
            const html = await searchResp.text();
            // Extract first anime slug
            const match = html.match(/\/watch\/([a-z0-9-]+)/);
            if (match) {
                const slug = match[1];
                console.log('Found slug:', slug);
                
                // Get episodes
                console.log('Getting episodes...');
                try {
                    const epResp = await Promise.race([
                        fetch(`https://kaido.to/ajax/episode/list/${slug.split('-').pop()}`, {
                            signal: AbortSignal.timeout(TIMEOUT),
                            headers: { 'X-Requested-With': 'XMLHttpRequest' }
                        }),
                        timeout(TIMEOUT)
                    ]);
                    console.log('Episodes:', epResp?.status === 200 ? 'OK' : `HTTP ${epResp?.status}`);
                    if (epResp?.ok) {
                        const epData = await epResp.text();
                        console.log('Episodes sample:', epData.slice(0, 200));
                    }
                } catch (e) {
                    console.log('Episodes error:', e instanceof Error ? e.message : String(e));
                }
            }
        }
    } catch (e) {
        console.log('Kaido error:', e instanceof Error ? e.message : String(e));
    }
}

async function test9AnimeStreaming(): Promise<void> {
    console.log('\n=== Testing 9Anime Streaming ===');
    try {
        console.log('Testing 9animetv.to...');
        const searchResp = await Promise.race([
            fetch('https://9animetv.to/search?keyword=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('Search:', searchResp?.status === 200 ? 'OK' : `HTTP ${searchResp?.status}`);
        
        if (searchResp?.ok) {
            const html = await searchResp.text();
            const match = html.match(/\/watch\/([a-z0-9-]+)/);
            if (match) {
                console.log('Found slug:', match[1]);
            }
        }
    } catch (e) {
        console.log('9Anime error:', e instanceof Error ? e.message : String(e));
    }
}

async function testConsumetGogoanime(): Promise<void> {
    console.log('\n=== Testing Consumet Gogoanime ===');
    
    // Try different Consumet instances
    const endpoints = [
        'https://api.consumet.org/anime/gogoanime/top-airing?page=1',
        'https://consumet-api-main.fly.dev/anime/gogoanime/top-airing?page=1',
        'https://api.consumet.tech/anime/gogoanime/top-airing?page=1',
    ];
    
    for (const url of endpoints) {
        try {
            console.log(`Trying: ${url}`);
            const resp = await Promise.race([
                fetch(url, { signal: AbortSignal.timeout(TIMEOUT) }),
                timeout(TIMEOUT)
            ]);
            console.log(`  Status: ${resp.status}`);
            if (resp.ok) {
                const data = await resp.json();
                console.log('  Results:', JSON.stringify(data).slice(0, 300));
                break;
            }
        } catch (e) {
            console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

async function testStreamProviders(): Promise<void> {
    console.log('\n=== Testing Stream Providers ===');
    
    // Test stream hosts that are commonly used
    const hosts = [
        { name: 'Streamtape', url: 'https://streamtape.com/e/XDkGmY1lkvf73' },
        { name: 'DoodStream', url: 'https://doodstream.com/e/abc123' },
        { name: 'MegaUp', url: 'https://megaup.nl/embed/abc123' },
        { name: 'VidPlay', url: 'https://vidplay.site/e/abc123' },
    ];
    
    for (const host of hosts) {
        try {
            const resp = await Promise.race([
                fetch(host.url, { signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' }),
                timeout(TIMEOUT)
            ]);
            console.log(`${host.name}: HTTP ${resp.status} (${resp.headers.get('content-type')})`);
        } catch (e) {
            console.log(`${host.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

async function testAllAnimeGraphQL(): Promise<void> {
    console.log('\n=== Testing AllAnime GraphQL ===');
    
    const query = `
        query {
            animeSearch(query: "naruto", limit: 10) {
                results {
                    _id
                    name
                    thumbnail
                    episodes(sub: true)
                }
            }
        }
    `;
    
    try {
        const resp = await Promise.race([
            fetch('https://allanime.ai/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
                signal: AbortSignal.timeout(TIMEOUT)
            }),
            timeout(TIMEOUT)
        ]);
        console.log('GraphQL:', resp?.status === 200 ? 'OK' : `HTTP ${resp?.status}`);
        if (resp?.ok) {
            const data = await resp.json();
            console.log('Data:', JSON.stringify(data).slice(0, 400));
        }
    } catch (e) {
        console.log('AllAnime error:', e instanceof Error ? e.message : String(e));
    }
}

async function testAniwatchProxies(): Promise<void> {
    console.log('\n=== Testing Aniwatch Proxies ===');
    
    const sites = [
        'https://aniwatchtv.to',
        'https://aniwatchtv.tv',
        'https://aniwatchtv.me',
        'https://aniwatchtv.pro',
    ];
    
    for (const site of sites) {
        try {
            const resp = await Promise.race([
                fetch(site, { signal: AbortSignal.timeout(TIMEOUT) }),
                timeout(TIMEOUT)
            ]);
            console.log(`${site}:`, resp?.status === 200 ? 'OK' : `HTTP ${resp?.status}`);
            if (resp?.ok) break;
        } catch (e) {
            console.log(`${site}:`, e instanceof Error ? e.message : String(e));
        }
    }
}

async function runTests(): Promise<void> {
    console.log('=== STREAMING API TEST SUITE v2 ===');
    console.log('Focus: Working streaming sites');
    console.log('Timeout: 5s per request\n');
    
    await testHiAnimeAPI();
    await testMiruroAPI();
    await testKaidoStreaming();
    await test9AnimeStreaming();
    await testConsumetGogoanime();
    await testStreamProviders();
    await testAllAnimeGraphQL();
    await testAniwatchProxies();
    
    console.log('\n=== TESTS COMPLETE ===');
}

runTests().catch(console.error);