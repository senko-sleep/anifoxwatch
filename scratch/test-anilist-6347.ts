
import { sourceManager } from '../server/src/services/source-manager.js';
import axios from 'axios';

async function test() {
    const id = 'anilist-6347';
    const ep = 5;
    
    console.log(`\n--- Testing anilist-6347 Episode 5 ---`);
    
    for (const category of ['sub', 'dub'] as const) {
        console.log(`\nTesting ${category.toUpperCase()}...`);
        try {
            const result = await sourceManager.getStreamingLinks(id, undefined, category, ep, 6347);
            if (result.sources && result.sources.length > 0) {
                console.log(`✅ ${category.toUpperCase()} Working! Found ${result.sources.length} sources from ${result.source}`);
                for (const src of result.sources) {
                    console.log(`   - [${src.quality}] ${src.url.substring(0, 100)}...`);
                    // Probe
                    try {
                        const start = Date.now();
                        const probe = await axios.get(src.originalUrl || src.url, { 
                            headers: { Referer: result.headers?.Referer || 'https://gogoanime.run/' },
                            timeout: 10000,
                            validateStatus: () => true
                        });
                        console.log(`     Probed: ${probe.status} in ${Date.now() - start}ms`);
                    } catch (e) {
                        console.log(`     Probe FAILED: ${e instanceof Error ? e.message : e}`);
                    }
                }
            } else {
                console.log(`❌ ${category.toUpperCase()} Failed: No sources found`);
            }
        } catch (e) {
            console.log(`❌ ${category.toUpperCase()} Error: ${e instanceof Error ? e.message : e}`);
        }
    }
    process.exit(0);
}

test();
