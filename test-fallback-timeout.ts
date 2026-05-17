import { SourceManager } from './server/src/services/source-manager.js';

async function main() {
    console.log('--- FALLBACK TIMEOUT TEST ---');
    const manager = new SourceManager();
    
    // This ID is for Baka to Test Episode 4 (DUB)
    const episodeId = 'animekai-baka-to-test-to-shoukanjuu-q5nq$ep=4$token=cYbzrPHyoQi9';
    const anilistId = 6347;
    
    console.log(`Testing streaming links for ${episodeId}...`);
    console.log('This may take up to 60 seconds due to Puppeteer extraction.');
    
    const startTime = Date.now();
    try {
        const streams = await manager.getStreamingLinks(episodeId, undefined, 'dub', 4, anilistId);
        const duration = Date.now() - startTime;
        
        if (streams && streams.sources && streams.sources.length > 0) {
            console.log(`\n✅ SUCCESS: Fetched ${streams.sources.length} sources in ${duration}ms`);
            console.log(`Primary source: ${streams.source || 'unknown'}`);
            console.log(`First URL: ${streams.sources[0].url.substring(0, 80)}...`);
        } else {
            console.log(`\n❌ FAILED: No sources found after ${duration}ms`);
        }
    } catch (e) {
        console.error('\n❌ ERROR:', e);
    }
    console.log('----------------------------');
}

main().catch(console.error);
