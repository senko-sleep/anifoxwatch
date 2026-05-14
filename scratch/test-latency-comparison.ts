import axios from 'axios';

async function measureLatency(url: string) {
    const start = Date.now();
    try {
        const response = await axios.get(url);
        const duration = Date.now() - start;
        return { duration, data: response.data, success: true };
    } catch (error: any) {
        const duration = Date.now() - start;
        return { duration, error: error.message, success: false };
    }
}

async function runTest() {
    const baseUrl = 'https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io';
    // Use an anime that likely has both or is good for testing fallback
    const slug = 'spy-x-family-season-3-v2q8';
    const ep = '1';

    console.log(`🚀 Starting Latency Test for: ${slug} (EP ${ep})`);
    console.log(`API: ${baseUrl}\n`);

    // 1. Test SUB
    console.log('Testing [SUB] resolution...');
    const subResult = await measureLatency(`${baseUrl}/api/stream/watch/${slug}?ep=${ep}&category=sub`);
    
    // 2. Test DUB
    console.log('Testing [DUB] resolution (with patience window)...');
    const dubResult = await measureLatency(`${baseUrl}/api/stream/watch/${slug}?ep=${ep}&category=dub`);

    console.log('\n' + '='.repeat(50));
    console.log('            STREAM RESOLUTION SUMMARY');
    console.log('='.repeat(50));
    
    // SUB Report
    console.log(`[SUB] Status: ${subResult.success ? '✅ OK' : '❌ FAIL'}`);
    console.log(`      Duration: ${subResult.duration}ms`);
    if (subResult.success) {
        console.log(`      Source: ${subResult.data.source || 'auto'}`);
        console.log(`      Count: ${subResult.data.sources?.length || 0} sources`);
    }

    console.log('-'.repeat(50));

    // DUB Report
    console.log(`[DUB] Status: ${dubResult.success ? '✅ OK' : '❌ FAIL'}`);
    console.log(`      Duration: ${dubResult.duration}ms`);
    if (dubResult.success) {
        const isFallback = dubResult.data.dubFallback === true;
        console.log(`      Type: ${isFallback ? '⚠️ SUB (Fallback)' : '✅ DUB (Original)'}`);
        console.log(`      Source: ${dubResult.data.source || 'auto'}`);
        console.log(`      Count: ${dubResult.data.sources?.length || 0} sources`);
        
        if (isFallback) {
            console.log('\n💡 Note: The server waited for DUB sources, but fell back to SUB when none were found within the patience window.');
        }
    }
    
    console.log('='.repeat(50));
    
    if (dubResult.duration > subResult.duration + 2000) {
        console.log('\n📊 INSIGHT: DUB resolution is significantly slower, confirming the DUB_PATIENCE window is active.');
    } else if (dubResult.duration < 1000) {
        console.log('\n📊 INSIGHT: Resolution was very fast, likely hit the server-side cache.');
    }
}

runTest();
