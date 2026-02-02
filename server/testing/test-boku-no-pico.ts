/**
 * Test why boku-no-pico is failing
 */
import { WatchHentaiSource } from '../src/sources/watchhentai-source.js';
import * as fs from 'fs';

async function testBokuNoPico() {
    const output: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        output.push(msg);
    };

    log('Testing boku-no-pico stream extraction...\n');

    const source = new WatchHentaiSource();
    const episodeId = 'videos/boku-no-pico-episode-1-id-01';

    log(`Episode ID: ${episodeId}\n`);

    try {
        const result = await source.getStreamingLinks(episodeId);

        log('=== RESULT ===');
        log(`Source: ${result.source}`);
        log(`Number of sources: ${result.sources.length}`);

        if (result.sources.length > 0) {
            log('\nSources:');
            result.sources.forEach((s, i) => {
                log(`  ${i + 1}. [${s.quality}] ${s.url}`);
            });
        } else {
            log('\n❌ No sources found - this video may not exist or have a different URL structure');
        }
    } catch (error: any) {
        log(`Error: ${error.message}`);
        log(`Stack: ${error.stack}`);
    }

    fs.writeFileSync('testing/boku-no-pico-test.txt', output.join('\n'));
    console.log('\nResults saved to testing/boku-no-pico-test.txt');
}

testBokuNoPico();
