import { SourceManager } from './src/services/source-manager.js';

async function testSourceManagerStreaming() {
    console.log('🧪 Testing SourceManager streaming with all sources...\n');
    
    const sourceManager = new SourceManager();
    
    // Test with the actual episode ID from the error
    const testCases = [
        { id: 'a-silent-voice-vwmk?ep=Jtnk9ab2qg28iQ', description: 'HiAnime format from error', category: 'sub' as const },
        { id: 'one-piece?ep=1', description: 'Simple format', category: 'sub' as const },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.description}`);
        console.log(`   Episode ID: ${testCase.id}`);
        
        try {
            const result = await sourceManager.getStreamingLinks(testCase.id, undefined, testCase.category);
            console.log(`   ✅ Sources found: ${result.sources.length}`);
            if (result.sources.length > 0) {
                console.log(`   📺 Qualities: ${result.sources.map(s => s.quality).join(', ')}`);
                console.log(`   🔗 First URL: ${result.sources[0].url.substring(0, 80)}...`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
}

testSourceManagerStreaming().catch(console.error);
