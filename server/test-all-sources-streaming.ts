import { SourceManager } from './src/services/source-manager.js';

async function testAllSourcesStreaming() {
    console.log('🧪 Testing all sources for streaming...\n');
    
    const sourceManager = new SourceManager();
    
    // Test with different episode ID formats that might work
    const testCases = [
        { id: 'one-piece-1', description: 'Simple slug-ep format' },
        { id: 'animeflv-one-piece-1', description: 'AnimeFLV prefix' },
        { id: 'animekai-one-piece$ep=1$token=test', description: 'AnimeKai format' },
        { id: 'one-piece?ep=1', description: 'Query param format' },
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
                console.log(`   🏷️  Source: ${result.source}`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
    
    // Test individual sources directly - skip this for now since sources is private
}

testAllSourcesStreaming().catch(console.error);
