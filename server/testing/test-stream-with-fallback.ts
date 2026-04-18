/**
 * Test worker streaming after FALLBACK FIX
 */

async function testStreaming(): Promise<void> {
    console.log('=== TESTING STREAMING WITH RENDER FALLBACK ===');
    
    const testCases = [
        { id: 'road-of-naruto-18220?ep=94736', name: '9anime naruto' },
        { id: 'demon-slayer-kimetsu-no-yaiba-47?ep=1279', name: '9anime demon slayer' },
    ];
    
    for (const tc of testCases) {
        console.log(`\n--- ${tc.name} ---`);
        
        try {
            const url = `https://anifoxwatch-api.anya-bot.workers.dev/api/stream/watch/${encodeURIComponent(tc.id)}`;
            const start = Date.now();
            const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
            const ms = Date.now() - start;
            
            console.log(`Status: ${resp.status} (${ms}ms)`);
            
            if (resp.ok) {
                const data = await resp.json();
                console.log(`Sources: ${data.sources?.length || 0}`);
                if (data.sources?.[0]) {
                    console.log(`First URL: ${data.sources[0].url?.slice(0, 80)}`);
                    console.log('*** SUCCESS! ***');
                } else {
                    console.log('Data:', JSON.stringify(data).slice(0, 200));
                }
            }
        } catch (e) {
            console.log('Error:', e instanceof Error ? e.message : String(e));
        }
    }
    
    console.log('\n=== TEST RENDER DIRECT ===');
    for (const tc of testCases) {
        console.log(`\n--- Render: ${tc.name} ---`);
        
        try {
            const url = `https://anifoxwatch-ci33.onrender.com/api/stream/watch/${encodeURIComponent(tc.id)}`;
            const start = Date.now();
            const resp = await fetch(url, { signal: AbortSignal.timeout(45000) });
            const ms = Date.now() - start;
            
            console.log(`Status: ${resp.status} (${ms}ms)`);
            
            if (resp.ok) {
                const data = await resp.json();
                console.log(`Sources: ${data.sources?.length || 0}`);
                if (data.sources?.[0]) {
                    console.log(`First URL: ${data.sources[0].url?.slice(0, 80)}`);
                    console.log('*** SUCCESS! ***');
                }
            }
        } catch (e) {
            console.log('Error:', e instanceof Error ? e.message : String(e));
        }
    }
}

testStreaming().then(() => console.log('\n=== DONE ===')).catch(console.error);