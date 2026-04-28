import axios from 'axios';

async function testStreamingEndpoint() {
    console.log('🧪 Testing streaming endpoint...\n');
    
    const API_URL = 'http://localhost:3001/api/stream/watch';
    
    const testCases = [
        { id: 'one-piece', ep: 1, category: 'sub' },
        { id: 'naruto', ep: 1, category: 'sub' },
        { id: 'attack-on-titan', ep: 1, category: 'sub' },
        { id: 'demon-slayer', ep: 1, category: 'sub' },
    ];
    
    let successCount = 0;
    let failCount = 0;
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.id} episode ${testCase.ep} (${testCase.category})\n`);
        
        try {
            const response = await axios.get(`${API_URL}/${testCase.id}`, {
                params: { ep: testCase.ep, category: testCase.category },
                timeout: 30000
            });
            
            console.log(`   Status: ${response.status}`);
            console.log(`   ✅ Sources found: ${response.data.sources?.length || 0}`);
            
            if (response.data.sources && response.data.sources.length > 0) {
                console.log(`   📺 Qualities: ${response.data.sources.map((s: any) => s.quality).join(', ')}`);
                console.log(`   🔗 First URL: ${response.data.sources[0].url.substring(0, 80)}...`);
                console.log(`   🎉 SUCCESS!`);
                successCount++;
            } else {
                console.log(`   ❌ No sources found`);
                failCount++;
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
            if ((error as any).response) {
                console.log(`   Status: ${(error as any).response.status}`);
            }
            failCount++;
        }
    }
    
    console.log(`\n📊 Results: ${successCount} successful, ${failCount} failed`);
    
    if (successCount > 0) {
        console.log(`   🎉 Streaming is working!`);
    } else {
        console.log(`   ❌ Streaming failed for all tests`);
    }
}

testStreamingEndpoint().catch(console.error);
