import { MiruroSource } from './src/sources/miruro-source.js';

async function testMiruro() {
    console.log('🧪 Testing Miruro source directly...\n');
    
    const source = new MiruroSource();
    
    // Test with the actual episode ID from the error
    const testCases = [
        { id: 'a-silent-voice-vwmk?ep=Jtnk9ab2qg28iQ', description: 'HiAnime format from error' },
        { id: 'miruro-a-silent-voice-vwmk?ep=Jtnk9ab2qg28iQ', description: 'With miruro prefix' },
        { id: 'one-piece?ep=1', description: 'Simple format' },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.description}`);
        console.log(`   Episode ID: ${testCase.id}`);
        
        try {
            const result = await source.getStreamingLinks(testCase.id, undefined, 'sub', { timeout: 20000 });
            console.log(`   ✅ Sources found: ${result.sources.length}`);
            if (result.sources.length > 0) {
                console.log(`   📺 Qualities: ${result.sources.map(s => s.quality).join(', ')}`);
                console.log(`   🔗 First URL: ${result.sources[0].url.substring(0, 80)}...`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
            console.log(`   Stack: ${(error as Error).stack?.substring(0, 200)}...`);
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

testMiruro().catch(console.error);
