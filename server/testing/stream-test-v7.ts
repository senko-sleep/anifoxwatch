/**
 * Streaming Test v7 - Get Actual Stream URLs
 * Tests getting actual streaming URLs from 9Anime/Kaido
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

async function get9AnimeStream(): Promise<void> {
    console.log('\n=== Get 9Anime Stream URLs ===');
    
    try {
        // Get episode servers
        console.log('1. Get servers for episode 94736...');
        const serverResp = await fetchWithTimeout(
            'https://9animetv.to/ajax/episode/servers?episodeId=94736',
            { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
        );
        
        if (!serverResp.ok) {
            console.log('Failed to get servers');
            return;
        }
        
        const serverHtml = await serverResp.text();
        console.log('Server HTML:', serverHtml.slice(0, 500));
        
        // Extract server IDs from the response
        // Pattern: data-id="123" for server items
        const serverIds = serverHtml.match(/data-id="(\d+)"/g);
        console.log('Found server IDs:', serverIds);
        
        // Try each server to get stream URL
        if (serverIds && serverIds.length > 0) {
            for (const idMatch of serverIds.slice(0, 3)) {
                const serverId = idMatch.match(/data-id="(\d+)"/)?.[1];
                if (!serverId) continue;
                
                console.log(`\n2. Get source for server ${serverId}...`);
                try {
                    const sourceResp = await fetchWithTimeout(
                        `https://9animetv.to/ajax/episode/sources/${serverId}`,
                        { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
                    );
                    
                    if (sourceResp.ok) {
                        const sourceData = await sourceResp.text();
                        console.log('Source data:', sourceData.slice(0, 300));
                        
                        // Try to extract video URL
                        const urlMatch = sourceData.match(/url["']?\s*:\s*["']([^"']+)["']/i);
                        if (urlMatch) {
                            console.log('Found URL:', urlMatch[1]);
                        }
                    }
                } catch (e) {
                    console.log('Error:', e instanceof Error ? e.message : String(e));
                }
            }
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function getKaidoStream(): Promise<void> {
    console.log('\n=== Get Kaido Stream URLs ===');
    
    try {
        console.log('1. Get servers for episode (need episode ID)...');
        
        // First search to find episode ID
        const searchResp = await fetchWithTimeout('https://kaido.to/search?keyword=naruto');
        if (!searchResp.ok) {
            console.log('Search failed');
            return;
        }
        
        const html = await searchResp.text();
        
        // Find anime ID from search results
        const animeIdMatch = html.match(/data-id="(\d+)"/);
        if (!animeIdMatch) {
            console.log('No anime ID found');
            return;
        }
        const animeId = animeIdMatch[1];
        console.log('Found anime ID:', animeId);
        
        // Get episodes to find episode ID
        console.log('\n2. Get episodes for anime', animeId, '...');
        const epResp = await fetchWithTimeout(
            `https://kaido.to/ajax/episode/list/${animeId}`,
            { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
        );
        
        if (!epResp.ok) {
            console.log('Failed to get episodes');
            return;
        }
        
        const epData = await epResp.json();
        console.log('Status:', epData.status);
        
        // Extract episode IDs
        if (epData.html) {
            const epIds = epData.html.match(/data-id="(\d+)"/g);
            console.log('Found episode IDs:', epIds?.slice(0, 5));
            
            if (epIds && epIds[0]) {
                const epId = epIds[0].match(/data-id="(\d+)"/)?.[1];
                if (epId) {
                    console.log('\n3. Get servers for episode', epId, '...');
                    
                    const serverResp = await fetchWithTimeout(
                        `https://kaido.to/ajax/episode/servers?episodeId=${epId}`,
                        { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
                    );
                    
                    if (serverResp.ok) {
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

async function testDirectServerSource(): Promise<void> {
    console.log('\n=== Test Direct Server Source URL ===');
    
    try {
        // Try a different approach - get the episode page itself and look for stream data
        console.log('1. Get episode page...');
        const epResp = await fetchWithTimeout('https://9animetv.to/watch/road-of-naruto-18220?ep=94736', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://9animetv.to/'
            }
        });
        
        if (!epResp.ok) {
            console.log('Failed to get episode page');
            return;
        }
        
        const html = await epResp.text();
        
        // Look for various stream URL patterns
        console.log('2. Looking for stream URLs in page...');
        
        const patterns = [
            /(?:sources|streams|files|video)["']?\s*:\s*(\[[^\]]+\])/i,
            /url["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
            /videoUrl["']?\s*:\s*["']([^"']+)["']/i,
            /embedUrl["']?\s*:\s*["']([^"']+)["']/i,
            /"link"\s*:\s*"([^"]+)"/i,
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                console.log(`Pattern ${pattern}: found`);
                console.log('  Value:', match[1]?.slice(0, 200));
            }
        }
        
        // Look for iframe src
        const iframeMatch = html.match(/iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            console.log('Iframe src:', iframeMatch[1]);
        }
        
        // Look for any .m3u8 URLs
        const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi);
        if (m3u8Match) {
            console.log('Found m3u8 URLs:', m3u8Match);
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function testJikanAsFallback(): Promise<void> {
    console.log('\n=== Jikan as Fallback Metadata ===');
    
    try {
        // Test using Jikan for metadata + try to find stream
        const animeIds = [20, 38000, 31964]; // Naruto, Demon Slayer, One Piece
        
        for (const malId of animeIds) {
            console.log(`\nTesting MAL ID: ${malId}`);
            
            const animeResp = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${malId}`);
            if (!animeResp.ok) continue;
            
            const animeData = await animeResp.json();
            const anime = animeData.data;
            console.log('Title:', anime.title);
            
            // Try to find on streaming sites
            const title = encodeURIComponent(anime.title.split(' ')[0].toLowerCase());
            
            console.log('Searching on streaming sites...');
            const searchResp = await fetchWithTimeout(`https://9animetv.to/search?keyword=${title}`);
            console.log(`  9animetv: ${searchResp.status}`);
            
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

async function runTests(): Promise<void> {
    console.log('=== STREAM URL TEST v7 ===\n');
    
    await get9AnimeStream();
    await getKaidoStream();
    await testDirectServerSource();
    await testJikanAsFallback();
    
    console.log('\n=== TESTS COMPLETE ===');
}

runTests().catch(console.error);