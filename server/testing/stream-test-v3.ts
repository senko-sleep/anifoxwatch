/**
 * Streaming Test Suite v3 - Actual Stream Extraction
 * Tests actual stream URL extraction from working sites
 */

const TIMEOUT = 5000;

function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT ${ms}ms`)), ms));
}

async function testHiAnimeStreamExtraction(): Promise<void> {
    console.log('\n=== Testing HiAnime Stream Extraction ===');
    
    try {
        // Get anime page to extract episode list
        console.log('1. Fetching anime page...');
        const animeResp = await Promise.race([
            fetch('https://hianime.to/watch/naruto.18691', { 
                signal: AbortSignal.timeout(TIMEOUT),
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }),
            timeout(TIMEOUT)
        ]);
        
        if (!animeResp?.ok) {
            console.log('Failed to load anime page');
            return;
        }
        
        const html = await animeResp.text();
        console.log('Page loaded, extracting episode data...');
        
        // Look for episode IDs in the page
        const epMatch = html.match(/episodeId\s*[=:]\s*["']([^"']+)["']/);
        if (epMatch) {
            console.log('Found episode ID:', epMatch[1]);
        }
        
        // Look for anime ID
        const animeIdMatch = html.match(/anime\s*[=:]\s*["']?([a-z0-9-]+)["']?/i);
        if (animeIdMatch) {
            console.log('Found anime ID:', animeIdMatch[1]);
        }
        
        // Try the AJAX endpoints directly
        console.log('\n2. Testing AJAX endpoints...');
        
        // Get episodes via AJAX
        const epsResp = await Promise.race([
            fetch('https://hianime.to/ajax/anime/naruto-18691', {
                signal: AbortSignal.timeout(TIMEOUT),
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            }),
            timeout(TIMEOUT)
        ]);
        
        if (epsResp?.ok) {
            console.log('Episodes AJAX: OK');
            const epHtml = await epsResp.text();
            console.log('Sample:', epHtml.slice(0, 300));
            
            // Extract episode links
            const epIds = epHtml.match(/ep[^"']*?(\d+)/g);
            if (epIds) {
                console.log('Found episodes:', epIds.slice(0, 10).join(', '));
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testKaidoStreamExtraction(): Promise<void> {
    console.log('\n=== Testing Kaido Stream Extraction ===');
    
    try {
        // Search for naruto
        console.log('1. Searching for naruto...');
        const searchResp = await Promise.race([
            fetch('https://kaido.to/search?keyword=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        
        if (!searchResp?.ok) {
            console.log('Search failed');
            return;
        }
        
        const searchHtml = await searchResp.text();
        
        // Find first anime ID
        const idMatch = searchHtml.match(/data-id=["']([^"']+)["']/);
        if (idMatch) {
            console.log('Found anime ID:', idMatch[1]);
        }
        
        // Get episode list via AJAX
        console.log('\n2. Getting episode list...');
        const epResp = await Promise.race([
            fetch('https://kaido.to/ajax/episode/list/18691', {
                signal: AbortSignal.timeout(TIMEOUT),
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            }),
            timeout(TIMEOUT)
        ]);
        
        if (epResp?.ok) {
            console.log('Episodes: OK');
            const epHtml = await epResp.text();
            console.log('Sample:', epHtml.slice(0, 300));
            
            // Extract episode IDs
            const epIds = epHtml.match(/data-id=["']([^"']+)["']/g);
            if (epIds) {
                console.log('Found episode IDs:', epIds.slice(0, 5).join(', '));
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function test9AnimeStreamExtraction(): Promise<void> {
    console.log('\n=== Testing 9Anime Stream Extraction ===');
    
    try {
        // Search
        console.log('1. Searching for naruto...');
        const searchResp = await Promise.race([
            fetch('https://9animetv.to/search?keyword=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        
        if (searchResp?.ok) {
            const html = await searchResp.text();
            console.log('Search OK, finding anime link...');
            
            // Find anime link
            const slugMatch = html.match(/\/watch\/([a-z0-9-]+-\d+)/);
            if (slugMatch) {
                console.log('Found slug:', slugMatch[1]);
                
                // Get episode list
                console.log('\n2. Getting episode list...');
                const epResp = await Promise.race([
                    fetch(`https://9animetv.to/ajax/episode/list/${slugMatch[1].split('-').pop()}`, {
                        signal: AbortSignal.timeout(TIMEOUT),
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    }),
                    timeout(TIMEOUT)
                ]);
                
                if (epResp?.ok) {
                    console.log('Episodes: OK');
                    const epHtml = await epResp.text();
                    console.log('Sample:', epHtml.slice(0, 300));
                }
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testAniwatchTV(): Promise<void> {
    console.log('\n=== Testing AniwatchTV.to ===');
    
    try {
        console.log('1. Searching for naruto...');
        const searchResp = await Promise.race([
            fetch('https://aniwatchtv.to/search?keyword=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        
        if (searchResp?.ok) {
            console.log('Search OK');
            const html = await searchResp.text();
            
            // Find anime link
            const slugMatch = html.match(/\/watch\/([a-z0-9-]+)/);
            if (slugMatch) {
                console.log('Found slug:', slugMatch[1]);
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testDirectStreamAPIs(): Promise<void> {
    console.log('\n=== Testing Direct Stream APIs ===');
    
    // Test direct HLS stream URLs (if any can be found)
    const streamTests = [
        { name: 'VidPlay', url: 'https://vidplay.site/embed/placeholder' },
        { name: 'Filemoon', url: 'https://filemoon.in/e/placeholder' },
        { name: 'StreamWish', url: 'https://streamwish.to/e/placeholder' },
        { name: 'Uploadsnack', url: 'https://uploadsnack.com/e/placeholder' },
    ];
    
    for (const test of streamTests) {
        try {
            const resp = await Promise.race([
                fetch(test.url, { signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' }),
                timeout(TIMEOUT)
            ]);
            console.log(`${test.name}: ${resp.status} - ${resp.headers.get('content-type')}`);
        } catch (e) {
            console.log(`${test.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

async function runTests(): Promise<void> {
    console.log('=== STREAM EXTRACTION TEST SUITE v3 ===');
    console.log('Testing actual stream URL extraction\n');
    
    await testHiAnimeStreamExtraction();
    await testKaidoStreamExtraction();
    await test9AnimeStreamExtraction();
    await testAniwatchTV();
    await testDirectStreamAPIs();
    
    console.log('\n=== TESTS COMPLETE ===');
}

runTests().catch(console.error);