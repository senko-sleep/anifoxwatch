/**
 * WORKAROUND: Try direct site scraping for streams
 * Since aniwatch package fails, we'll try hitting 9anime directly
 */

async function testDirect9animeStreaming(): Promise<void> {
    console.log('=== DIRECT 9ANIME STREAMING ===');
    
    try {
        // First search to get an anime ID with episodes
        console.log('\n1. Load 9anime episode page...');
        
        // Using exact format that works in our tests: /watch/slug?ep=episodeId
        const url = 'https://9animetv.to/watch/onigiri-9734?ep=49194';
        
        const resp = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://9animetv.to/'
            }
        });
        
        console.log('Status:', resp.status);
        
        if (resp.ok) {
            const html = await resp.text();
            console.log('HTML length:', html.length);
            
            //Look for stream URLs
            const patterns = [
                /\.m3u8/gi,
                /sources?\s*[:=]\s*\[[^\]]+/i,
                /videoUrl/i,
                /embedUrl/i,
            ];
            
            for (const p of patterns) {
                const match = html.match(p);
                if (match) {
                    console.log('Found pattern:', p.toString().slice(0, 30));
                }
            }
            
            // Look for server links
            const serverLinks = html.match(/data-server="(\d+)"/g);
            console.log('Server links:', serverLinks);
        }
        
        // Try getting servers via AJAX
        console.log('\n2. Try AJAX for servers...');
        try {
            const ajaxResp = await fetch('https://9animetv.to/ajax/episode/servers?episodeId=49194', {
                signal: AbortSignal.timeout(10000),
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            
            console.log('AJAX Status:', ajaxResp.status);
            if (ajaxResp.ok) {
                const data = await ajaxResp.text();
                console.log('Servers data:', data.slice(0, 200));
            }
        } catch (e) {
            console.log('AJAX Error:', e instanceof Error ? e.message : String(e));
        }
        
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testDirect9animeStreaming().then(() => console.log('\n=== DONE ===')).catch(console.error);