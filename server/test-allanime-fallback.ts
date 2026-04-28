import { SourceManager } from './src/services/source-manager.js';

async function testAllAnimeFallback() {
    console.log('🧪 Testing AllAnime fallback...\n');
    
    const sourceManager = new SourceManager();
    
    // Test with a simple query
    const testCases = [
        { query: 'one piece', episode: 1 },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.query} episode ${testCase.episode}`);
        
        try {
            const result = await sourceManager.tryAllAnimeFallback(testCase.query, testCase.episode);
            if (!result) {
                console.log(`   ❌ No result returned`);
                continue;
            }
            console.log(`   ✅ Sources found: ${result.sources.length}`);
            if (result.sources.length > 0) {
                console.log(`   📺 Qualities: ${result.sources.map(s => s.quality).join(', ')}`);
                console.log(`   🔗 First URL: ${result.sources[0].url.substring(0, 80)}...`);
                console.log(`   🎉 SUCCESS! Streaming works!`);
                return;
            } else {
                console.log(`   ❌ No sources in result`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
    
    console.log('\n❌ AllAnime fallback failed');
}

testAllAnimeFallback().catch(console.error);
