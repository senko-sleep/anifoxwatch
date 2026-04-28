import { tryFetchHianimeRestStreamingData } from './src/services/hianime-rest-fallback.js';

async function testHiAnimeRest() {
    console.log('🧪 Testing HiAnime REST proxy...\n');
    
    // Test with the actual episode ID from the error
    const testCases = [
        { id: 'a-silent-voice-vwmk?ep=Jtnk9ab2qg28iQ', description: 'HiAnime format from error', category: 'sub' as const },
        { id: 'one-piece?ep=1', description: 'Simple format', category: 'sub' as const },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.description}`);
        console.log(`   Episode ID: ${testCase.id}`);
        
        try {
            const result = await tryFetchHianimeRestStreamingData({
                episodeId: testCase.id,
                category: testCase.category,
                perAttemptTimeoutMs: 20000,
                totalBudgetMs: 25000,
            });
            
            if (result) {
                console.log(`   ✅ Sources found: ${result.sources.length}`);
                if (result.sources.length > 0) {
                    console.log(`   📺 Qualities: ${result.sources.map(s => s.quality).join(', ')}`);
                    console.log(`   🔗 First URL: ${result.sources[0].url.substring(0, 80)}...`);
                }
            } else {
                console.log(`   ❌ No sources returned`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
}

testHiAnimeRest().catch(console.error);
