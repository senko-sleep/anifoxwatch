/**
 * Streaming Test v8 - Test Actual Production Endpoints
 * Tests the endpoints that the frontend uses
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

// Test the Cloudflare Worker API
async function testCFWorkerAPI(): Promise<void> {
    console.log('\n=== Test Cloudflare Worker API ===');
    
    // Test various streaming endpoints
    const endpoints = [
        { name: 'CF Health', url: 'https://anifoxwatch-api.anya-bot.workers.dev/health' },
        { name: 'CF Search', url: 'https://anifoxwatch-api.anya-bot.workers.dev/api/search?q=naruto' },
        { name: 'CF Trending', url: 'https://anifoxwatch-api.anya-bot.workers.dev/api/trending' },
        { name: 'CF Anime info', url: 'https://anifoxwatch-api.anya-bot.workers.dev/api/anime/20' },
    ];
    
    for (const ep of endpoints) {
        try {
            console.log(`\n${ep.name}: ${ep.url}`);
            const resp = await fetchWithTimeout(ep.url, {}, 8000);
            console.log(`  Status: ${resp.status}`);
            if (resp.ok) {
                const data = await resp.json();
                console.log(`  Data:`, JSON.stringify(data).slice(0, 150));
            }
        } catch (e) {
            console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

// Test the Render backend (Puppeteer) API
async function testRenderAPI(): Promise<void> {
    console.log('\n=== Test Render Backend API ===');
    
    const endpoints = [
        { name: 'Render Health', url: 'https://anifoxwatch-ci33.onrender.com/health' },
        { name: 'Render Search', url: 'https://anifoxwatch-ci33.onrender.com/api/search?q=demon%20slayer' },
    ];
    
    for (const ep of endpoints) {
        try {
            console.log(`\n${ep.name}: ${ep.url}`);
            const start = Date.now();
            const resp = await fetchWithTimeout(ep.url, {}, 15000);
            const ms = Date.now() - start;
            console.log(`  Status: ${resp.status} (${ms}ms)`);
            if (resp.ok) {
                const data = await resp.json();
                console.log(`  Data:`, JSON.stringify(data).slice(0, 200));
            }
        } catch (e) {
            console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

// Test the streaming watch endpoint specifically
async function testStreamingWatch(): Promise<void> {
    console.log('\n=== Test Streaming Watch Endpoint ===');
    
    // Try different episode ID formats
    const testIds = [
        'road-of-naruto-18220?ep=94736',  // 9Anime format
        'naruto.18691?ep=94736',         // Kaido format
        'naruto-18691?ep=1',            // HiAnime format
    ];
    
    for (const epId of testIds) {
        try {
            console.log(`\nTesting episode: ${epId}`);
            const url = `https://anifoxwatch-api.anya-bot.workers.dev/api/stream/watch/${encodeURIComponent(epId)}`;
            const resp = await fetchWithTimeout(url, {}, 15000);
            console.log(`  Status: ${resp.status}`);
            if (resp.ok) {
                const data = await resp.json();
                console.log(`  Sources: ${data.sources?.length || 0}`);
                if (data.sources?.[0]) {
                    console.log(`  First source:`, data.sources[0]);
                }
                if (data.error) {
                    console.log(`  Error: ${data.error}`);
                }
            }
        } catch (e) {
            console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

// Test the servers endpoint
async function testStreamingServers(): Promise<void> {
    console.log('\n=== Test Streaming Servers Endpoint ===');
    
    const testIds = [
        'road-of-naruto-18220?ep=94736',
        'naruto.18691?ep=94736',
    ];
    
    for (const epId of testIds) {
        try {
            console.log(`\nGetting servers for: ${epId}`);
            const url = `https://anifoxwatch-api.anya-bot.workers.dev/api/stream/servers/${encodeURIComponent(epId)}`;
            const resp = await fetchWithTimeout(url, {}, 10000);
            console.log(`  Status: ${resp.status}`);
            if (resp.ok) {
                const data = await resp.json();
                console.log(`  Servers:`, JSON.stringify(data).slice(0, 200));
            }
        } catch (e) {
            console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

// Test direct site extraction
async function testDirectSiteExtraction(): Promise<void> {
    console.log('\n=== Test Direct Site Extraction ===');
    
    // Test 9animetv directly
    try {
        console.log('\n1. 9animetv.to episode page...');
        const resp = await fetchWithTimeout('https://9animetv.to/watch/road-of-naruto-18220?ep=94736', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://9animetv.to/'
            }
        }, 10000);
        
        console.log(`  Status: ${resp.status}`);
        
        if (resp.ok) {
            const html = await resp.text();
            
            // Look for stream data in page
            const patterns = [
                /setOption\(\s*["']?sources["']?\s*,\s*\[[^\]]*\{[^}]*url["']?\s*:\s*["']([^"']+)["']/i,
                /sources\s*=\s*\[([^\]]+)\]/i,
                /videoSrc\s*=\s*["']([^"']+)["']/i,
            ];
            
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match) {
                    console.log(`  Found pattern: ${pattern.toString().slice(0, 50)}...`);
                    console.log(`  Value: ${match[1]?.slice(0, 150)}`);
                    break;
                }
            }
            
            // Check for embed iframes
            const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']*(?:embed|player)[^"']*)["']/i);
            if (iframeMatch) {
                console.log(`  Found iframe: ${iframeMatch[1]}`);
            }
        }
        
    } catch (e) {
        console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Test Kaido directly
    try {
        console.log('\n2. kaido.to episode page...');
        const resp = await fetchWithTimeout('https://kaido.to/watch/naruto.18691?ep=94736', {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://kaido.to/'
            }
        }, 10000);
        
        console.log(`  Status: ${resp.status}`);
        
    } catch (e) {
        console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function runTests(): Promise<void> {
    console.log('=== PRODUCTION API TEST v8 ===');
    console.log('Testing endpoints used by the frontend\n');
    
    await testCFWorkerAPI();
    await testRenderAPI();
    await testStreamingWatch();
    await testStreamingServers();
    await testDirectSiteExtraction();
    
    console.log('\n=== TESTS COMPLETE ===');
}

runTests().catch(console.error);