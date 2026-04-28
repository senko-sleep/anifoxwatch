import { AnimeFLVSource } from './src/sources/animeflv-source.js';

async function testAnimeFLV() {
    console.log('🧪 Testing AnimeFLV source directly...\n');
    
    const source = new AnimeFLVSource();
    
    // Test with a known working episode ID format from the episodes endpoint
    const testCases = [
        { id: 'naruto-shippuden-1', description: 'Simple slug format' },
        { id: 'animeflv-naruto-shippuden-1', description: 'With prefix' },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.description}`);
        console.log(`   Episode ID: ${testCase.id}`);
        
        try {
            const result = await source.getStreamingLinks(testCase.id, undefined, 'sub', { timeout: 15000 });
            console.log(`   ✅ Sources found: ${result.sources.length}`);
            if (result.sources.length > 0) {
                console.log(`   📺 Qualities: ${result.sources.map(s => s.quality).join(', ')}`);
                console.log(`   🔗 First URL: ${result.sources[0].url.substring(0, 80)}...`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
            console.log(`   Stack: ${(error as Error).stack}`);
        }
    }
    
    // Test health check
    console.log('\n\n🔍 Testing health check...\n');
    try {
        const isHealthy = await source.healthCheck({ timeout: 10000 });
        console.log(`   ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    } catch (error) {
        console.log(`   ❌ Error: ${(error as Error).message}`);
    }
}

testAnimeFLV().catch(console.error);
