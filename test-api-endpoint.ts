async function test() {
    const baseUrl = 'http://localhost:3001/api/stream/watch/anilist-189046';
    const url = `${baseUrl}?ep=11`;
    
    console.log(`Testing API endpoint: ${url}`);
    
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(65000) // 65s timeout
        });
        
        const data = await response.json();
        
        console.log(`\nStatus: ${response.status}`);
        console.log(`Data:`, JSON.stringify(data, null, 2));
        
        if (data.sources?.length > 0) {
            console.log(`\n✅ SUCCESS! Found ${data.sources.length} streaming sources`);
            console.log(`   Source: ${data.source || 'unknown'}`);
            console.log(`   First: ${data.sources[0].quality} - ${data.sources[0].url.substring(0, 60)}...`);
        } else {
            console.log(`\n❌ FAILED - No sources found`);
        }
    } catch (e: any) {
        console.log(`\n❌ ERROR: ${e.message}`);
    }
}

test();
