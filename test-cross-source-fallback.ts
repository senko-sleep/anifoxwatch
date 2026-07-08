import { SourceManager } from './server/src/services/source-manager.js';

async function test() {
    const sm = new SourceManager();
    
    console.log('Testing cross-source fallback for anilist-189046 episode 11...');
    
    try {
        const result = await sm.crossSourceStreamingFallback(
            'anilist-189046',
            undefined,
            'sub',
            11,
            189046
        );
        
        if (result) {
            console.log(`\n✅ SUCCESS!`);
            console.log(`   Source: ${result.source || 'unknown'}`);
            console.log(`   Sources found: ${result.sources.length}`);
            if (result.sources.length > 0) {
                console.log(`   First source: ${result.sources[0].quality} - ${result.sources[0].url.substring(0, 60)}...`);
            }
        } else {
            console.log(`\n❌ FAILED - No result returned`);
        }
    } catch (e: any) {
        console.log(`\n❌ ERROR: ${e.message}`);
    }
}

test();
