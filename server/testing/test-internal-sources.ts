import { SourceManager } from '../src/services/source-manager.js';
import { REGISTERED_SOURCE_NAMES } from '../src/registered-sources.js';

async function testSources() {
    console.log('🔍 Testing internal source availability...\n');
    
    const sm = new SourceManager();
    
    // Test each source
    const sourcesToTest = REGISTERED_SOURCE_NAMES;
    
    for (const name of sourcesToTest) {
        try {
            const source = sm.sources.get(name);
            if (!source) {
                console.log(`❌ ${name}: NOT REGISTERED`);
                continue;
            }
            
            const isAvailable = source.isAvailable;
            console.log(`   ${name}: ${isAvailable ? '✅ ONLINE' : '❌ OFFLINE'}`);
            
            // Test basic search for a working source
            if (isAvailable && source.search) {
                try {
                    const results = await Promise.race([
                        source.search('naruto', 1),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
                    ]);
                    console.log(`      Search returned ${results.results?.length || 0} results`);
                } catch (e: any) {
                    console.log(`      Search failed: ${e.message?.substring(0, 50)}`);
                }
            }
        } catch (e: any) {
            console.log(`❌ ${name}: ERROR - ${e.message?.substring(0, 50)}`);
        }
    }
    
    console.log('\n✅ Internal source check complete');
}

testSources().catch(console.error);