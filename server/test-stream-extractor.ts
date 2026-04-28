import { streamExtractor } from './src/services/stream-extractor.js';

async function testStreamExtractor() {
    console.log('🧪 Testing StreamExtractor service...\n');
    
    // Test extractFrom9Anime method
    console.log('📍 Testing extractFrom9Anime...\n');
    try {
        const result = await streamExtractor.extractFrom9Anime('one-piece', '1', 'https://9animetv.to');
        console.log(`   ✅ Success: ${result.success}`);
        console.log(`   📺 Streams: ${result.streams.length}`);
        if (result.streams.length > 0) {
            result.streams.forEach((s, i) => {
                console.log(`      ${i + 1}. ${s.quality}: ${s.url.substring(0, 60)}...`);
            });
        }
        console.log(`   📺 Subtitles: ${result.subtitles.length}`);
        if (result.error) {
            console.log(`   ⚠️ Error: ${result.error}`);
        }
    } catch (error) {
        console.log(`   ❌ Error: ${(error as Error).message}`);
        console.log(`   Stack: ${(error as Error).stack?.substring(0, 200)}...`);
    }
    
    // Test extractWithFallbacks method
    console.log('\n📍 Testing extractWithFallbacks...\n');
    try {
        const result = await streamExtractor.extractWithFallbacks('one-piece', '1');
        console.log(`   ✅ Success: ${result.success}`);
        console.log(`   📺 Streams: ${result.streams.length}`);
        if (result.streams.length > 0) {
            result.streams.forEach((s, i) => {
                console.log(`      ${i + 1}. ${s.quality}: ${s.url.substring(0, 60)}...`);
            });
        }
        console.log(`   📺 Subtitles: ${result.subtitles.length}`);
        if (result.error) {
            console.log(`   ⚠️ Error: ${result.error}`);
        }
    } catch (error) {
        console.log(`   ❌ Error: ${(error as Error).message}`);
        console.log(`   Stack: ${(error as Error).stack?.substring(0, 200)}...`);
    }
    
    // Close browser
    await streamExtractor.close();
}

testStreamExtractor().catch(console.error);
