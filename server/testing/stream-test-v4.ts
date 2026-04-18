/**
 * Streaming Test v4 - Direct API approach
 * Tests direct streaming API calls that don't need Puppeteer
 */

const TIMEOUT = 5000;

function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT ${ms}ms`)), ms));
}

async function test9AnimeDirectAPI(): Promise<void> {
    console.log('\n=== 9Anime Direct API Test ===');
    
    try {
        // Get episode page and extract server info directly
        console.log('1. Loading episode page...');
        const epResp = await Promise.race([
            fetch('https://9animetv.to/watch/road-of-naruto-18220?ep=94736', {
                signal: AbortSignal.timeout(TIMEOUT),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://9animetv.to/'
                }
            }),
            timeout(TIMEOUT)
        ]);
        
        if (!epResp?.ok) {
            console.log('Failed to load episode page');
            return;
        }
        
        const html = await epResp.text();
        
        // Extract server data from page
        console.log('2. Extracting server data...');
        
        // Look for embedded video server URLs in various patterns
        const patterns = [
            /video["']?\s*:\s*["']([^"']+)["']/i,
            /sources?\s*:\s*\[([^\]]+)\]/i,
            /file["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
            /embedUrl["']?\s*:\s*["']([^"']+)["']/i,
            /"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/i,
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                console.log(`Found pattern: ${pattern}`, match[1]?.slice(0, 100));
            }
        }
        
        // Look for API endpoints in the page
        const apiPatterns = [
            /ajax\/episode\/server\/(\d+)/,
            /ajax\/episode\/servers/,
            /api\/episode\//,
        ];
        
        for (const pattern of apiPatterns) {
            const match = html.match(pattern);
            if (match) {
                console.log(`Found API pattern:`, match[0]);
            }
        }
        
        // Try to get server list via AJAX
        console.log('\n3. Getting server list...');
        try {
            // Look for episode ID in the page
            const epIdMatch = html.match(/data-id=["'](\d+)["']/);
            if (epIdMatch) {
                console.log('Episode ID:', epIdMatch[1]);
                
                const serverResp = await Promise.race([
                    fetch(`https://9animetv.to/ajax/episode/servers?episodeId=${epIdMatch[1]}`, {
                        signal: AbortSignal.timeout(TIMEOUT),
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    }),
                    timeout(TIMEOUT)
                ]);
                
                if (serverResp?.ok) {
                    console.log('Servers: OK');
                    const serverData = await serverResp.text();
                    console.log('Server data:', serverData.slice(0, 300));
                }
            }
        } catch (e) {
            console.log('Server list error:', e instanceof Error ? e.message : String(e));
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testKaidoDirectAPI(): Promise<void> {
    console.log('\n=== Kaido Direct API Test ===');
    
    try {
        console.log('1. Loading episode page...');
        const epResp = await Promise.race([
            fetch('https://kaido.to/watch/naruto.18691?ep=94736', {
                signal: AbortSignal.timeout(TIMEOUT),
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://kaido.to/'
                }
            }),
            timeout(TIMEOUT)
        ]);
        
        if (epResp?.ok) {
            const html = await epResp.text();
            console.log('Page loaded, extracting data...');
            
            // Look for server data
            const serverMatch = html.match(/data-id=["'](\d+)["']/);
            if (serverMatch) {
                console.log('Server ID found:', serverMatch[1]);
                
                // Try getting servers
                const serversResp = await Promise.race([
                    fetch(`https://kaido.to/ajax/episode/servers?episodeId=${serverMatch[1]}`, {
                        signal: AbortSignal.timeout(TIMEOUT),
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    }),
                    timeout(TIMEOUT)
                ]);
                
                if (serversResp?.ok) {
                    console.log('Servers: OK');
                    console.log(await serversResp.text());
                }
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testHiAnimeAPIEndpoints(): Promise<void> {
    console.log('\n=== HiAnime API Endpoints ===');
    
    // Try different known HiAnime API patterns
    const endpoints = [
        { name: 'Search', url: 'https://hianime.to/search?keyword=naruto' },
        { name: 'Anime info', url: 'https://hianime.to/ajax/anime/naruto-18691' },
        { name: 'Episodes', url: 'https://hianime.to/ajax/anime/episodes/naruto-18691' },
        { name: 'Servers', url: 'https://hianime.to/ajax/episode/servers/94736' },
        { name: 'Sources', url: 'https://hianime.to/ajax/episode/sources/94736' },
    ];
    
    for (const ep of endpoints) {
        try {
            console.log(`\n${ep.name}:`, ep.url);
            const resp = await Promise.race([
                fetch(ep.url, {
                    signal: AbortSignal.timeout(TIMEOUT),
                    headers: { 
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': 'Mozilla/5.0'
                    }
                }),
                timeout(TIMEOUT)
            ]);
            
            console.log(`  Status: ${resp?.status}`);
            if (resp?.ok) {
                const data = await resp.text();
                console.log(`  Data:`, data.slice(0, 200));
            }
        } catch (e) {
            console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

async function testConsumetProviders(): Promise<void> {
    console.log('\n=== Testing Alternative Consumet-like APIs ===');
    
    // Try different public anime APIs
    const apis = [
        { name: 'Anify', url: 'https://api.anify.tv/list' },
        { name: 'Anify Search', url: 'https://api.anify.tv/search?query=naruto' },
        { name: 'Kaguya API', url: 'https://api.kaguya.app/anime/trending' },
        { name: 'Jikan (MyAnimeList)', url: 'https://api.jikan.moe/v4/anime?q=naruto&limit=5' },
    ];
    
    for (const api of apis) {
        try {
            console.log(`\n${api.name}: ${api.url}`);
            const resp = await Promise.race([
                fetch(api.url, { signal: AbortSignal.timeout(TIMEOUT) }),
                timeout(TIMEOUT)
            ]);
            
            console.log(`  Status: ${resp?.status}`);
            if (resp?.ok) {
                const data = await resp.json();
                console.log(`  Data:`, JSON.stringify(data).slice(0, 150));
            }
        } catch (e) {
            console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

async function runTests(): Promise<void> {
    console.log('=== DIRECT API STREAMING TEST v4 ===\n');
    
    await test9AnimeDirectAPI();
    await testKaidoDirectAPI();
    await testHiAnimeAPIEndpoints();
    await testConsumetProviders();
    
    console.log('\n=== TESTS COMPLETE ===');
}

runTests().catch(console.error);