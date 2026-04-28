import { SourceManager } from './src/services/source-manager.js';

async function testStreamingSources() {
    console.log('🧪 Testing streaming sources...\n');
    
    const sourceManager = new SourceManager();
    
    // Test with different episode ID formats
    const testCases = [
        { id: 'naruto?ep=1', description: 'Simple slug?ep=N format' },
        { id: 'one-piece?ep=1', description: 'Another simple format' },
        { id: 'a-silent-voice-vwmk?ep=Jtnk9ab2qg28iQ', description: 'HiAnime format with token' },
        { id: 'animekai-naruto$ep=1$token=test', description: 'AnimeKai compound format' },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.description}`);
        console.log(`   Episode ID: ${testCase.id}`);
        
        try {
            const result = await sourceManager.getStreamingLinks(testCase.id);
            console.log(`   ✅ Sources found: ${result.sources.length}`);
            if (result.sources.length > 0) {
                console.log(`   📺 Qualities: ${result.sources.map(s => s.quality).join(', ')}`);
                console.log(`   🔗 First URL: ${result.sources[0].url.substring(0, 60)}...`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
    
    // Test individual source health
    console.log('\n\n🔍 Testing individual source health checks...\n');
    const sources = sourceManager.getAvailableSources();
    console.log(`Available sources: ${sources.join(', ')}`);
    
    for (const sourceName of sources.slice(0, 5)) {
        console.log(`\n📍 Testing ${sourceName} health...`);
        try {
            const isHealthy = await sourceManager.healthCheck(sourceName, { timeout: 5000 });
            console.log(`   ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
}

testStreamingSources().catch(console.error);
