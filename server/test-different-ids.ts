import { SourceManager } from './src/services/source-manager.js';

async function testDifferentEpisodeIds() {
    console.log('🧪 Testing different episode ID formats...\n');
    
    const sourceManager = new SourceManager();
    
    const testCases = [
        { id: 'animekai-one-piece-dk6r?ep=1', description: 'AnimeKai format with prefix' },
        { id: 'one-piece-dk6r?ep=1', description: 'AnimeKai format without prefix' },
        { id: 'one-piece?ep=1', description: 'Simple format' },
        { id: 'one-piece-1', description: '9Anime format' },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.description}`);
        console.log(`   Episode ID: ${testCase.id}`);
        
        try {
            const result = await sourceManager.getStreamingLinks(testCase.id, undefined, 'sub');
            console.log(`   ✅ Sources found: ${result.sources.length}`);
            if (result.sources.length > 0) {
                console.log(`   📺 Qualities: ${result.sources.map(s => s.quality).join(', ')}`);
                console.log(`   🔗 First URL: ${result.sources[0].url.substring(0, 80)}...`);
                console.log(`   🎉 SUCCESS! Streaming works!`);
                return; // Stop on first success
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
    
    console.log('\n❌ No episode ID format worked');
}

testDifferentEpisodeIds().catch(console.error);
