import { MiruroSource } from './src/sources/miruro-source.js';

async function testMiruroWithPuppeteer() {
    console.log('🧪 Testing Miruro with Puppeteer enabled...\n');
    
    // Set environment variable
    process.env.ENABLE_MIRO_PUPPETEER = '1';
    
    const source = new MiruroSource();
    
    // Test with a simple episode ID
    const testCases = [
        { id: 'one-piece?ep=1', description: 'Simple format' },
    ];
    
    for (const testCase of testCases) {
        console.log(`\n📍 Testing: ${testCase.description}`);
        console.log(`   Episode ID: ${testCase.id}`);
        
        try {
            const result = await source.getStreamingLinks(testCase.id, undefined, 'sub', { timeout: 45000 });
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

testMiruroWithPuppeteer().catch(console.error);
