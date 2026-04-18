/**
 * Debug - check exact ID format from CF worker search
 */

async function testSearchFormat(): Promise<void> {
    console.log('=== CHECK EXACT ID FORMAT FROM SEARCH ===');
    
    try {
        // Search via CF worker
        const resp = await fetch('https://anifoxwatch-api.anya-bot.workers.dev/api/search?q=demon%20slayer', {
            signal: AbortSignal.timeout(10000)
        });
        
        if (resp.ok) {
            const data = await resp.json();
            console.log('Search result:');
            const anime = data.data?.animes?.[0];
            if (anime) {
                console.log('Anime ID:', anime.id);
                console.log('Anime:', JSON.stringify(anime).slice(0, 300));
            }
        }
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
    
    // Also test the /home endpoint
    console.log('\n=== CHECK HOME/TRENDING ===');
    try {
        const resp = await fetch('https://anifoxwatch-api.anya-bot.workers.dev/api/home', {
            signal: AbortSignal.timeout(10000)
        });
        
        console.log('Home status:', resp.status);
        
        if (resp.ok) {
            const data = await resp.json();
            const anime = data.data?.trendingAnimes?.[0];
            console.log('First trending:', anime?.id || 'none');
        }
    } catch (e) {
        console.log('Error:', e instanceof Error ? e.message : String(e));
    }
}

testSearchFormat().then(() => console.log('\n=== DONE ===')).catch(console.error);