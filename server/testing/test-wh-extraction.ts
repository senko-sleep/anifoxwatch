/**
 * Test the fixed WatchHentai stream extraction
 */
import { WatchHentaiSource } from '../src/sources/watchhentai-source.js';
import * as fs from 'fs';

async function testStreamExtraction() {
    const output: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        output.push(msg);
    };

    log('Testing WatchHentai stream extraction after fix...\n');

    const source = new WatchHentaiSource();

    // Test with a known video page
    const episodeId = 'videos/asa-made-shirudaku-oyakodon-episode-1-id-01';
    log(`Getting streams for: ${episodeId}\n`);

    try {
        const result = await source.getStreamingLinks(episodeId);

        log('=== RESULT ===');
        log(`Source: ${result.source}`);
        log(`Number of sources: ${result.sources.length}`);
        log('\nSources:');
        result.sources.forEach((s, i) => {
            log(`  ${i + 1}. [${s.quality}] ${s.url}`);
        });

        if (result.sources.length > 0) {
            log('\n✅ SUCCESS! Stream URLs extracted correctly.');

            // Verify first URL is accessible
            log('\n=== Verifying URL accessibility ===');
            const axios = (await import('axios')).default;

            for (const src of result.sources) {
                try {
                    const headResp = await axios.head(src.url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://watchhentai.net/',
                        },
                        timeout: 10000,
                    });
                    log(`✅ [${src.quality}] Status: ${headResp.status}, Content-Type: ${headResp.headers['content-type']}`);
                } catch (err: any) {
                    log(`❌ [${src.quality}] Failed: ${err.message}`);
                }
            }
        } else {
            log('\n❌ FAILED: No stream URLs found.');
        }
    } catch (error: any) {
        log('Error: ' + error.message);
    }

    // Write all output to file
    fs.writeFileSync('testing/extraction-test-results.txt', output.join('\n'));
    console.log('\nFull results saved to testing/extraction-test-results.txt');
}

testStreamExtraction();
