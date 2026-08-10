import { WatchHentaiSource } from '../sources/watchhentai-source.js';

async function testWatchHentai() {
    console.log('=== Testing WatchHentai Source ===\n');
    const source = new WatchHentaiSource();

    console.log('1. Testing health check:');
    const isHealthy = await source.healthCheck();
    console.log(`   Healthy: ${isHealthy}`);

    if (isHealthy) {
        console.log('\n2. Testing getLatest:');
        const latest = await source.getLatest(1);
        console.log(`   Found ${latest.length} latest items`);
        if (latest.length > 0) {
            const sample = latest[0];
            console.log(`   Sample: ${sample.title} (ID: ${sample.id})`);
        }
    }
}

testWatchHentai().catch(console.error);