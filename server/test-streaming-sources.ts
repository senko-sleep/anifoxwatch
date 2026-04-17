/**
 * Quick test of getStreamingLinks using direct source instances
 */

import { MiruroSource } from '../src/sources/miruro-source.js';
import { AnimeKaiSource } from '../src/sources/animekai-source.js';
import { KaidoSource } from '../src/sources/kaido-source.js';
import { ConsumetSource } from '../src/sources/consumet-source.js';
import { GogoanimeSource } from '../src/sources/gogoanime-source.js';

const sources = [
    { name: 'Miruro', src: new MiruroSource() },
    { name: 'AnimeKai', src: new AnimeKaiSource() },
    { name: 'Kaido', src: new KaidoSource() },
    { name: 'Consumet', src: new ConsumetSource() },
    { name: 'Gogoanime', src: new GogoanimeSource() },
];

const testEpisodes = [
    // Plain ?ep=N format (like the failing one)
    'spy-x-family-part-2-18152?ep=94682',
    // Miruro format with $ep=$token
    'spy-x-family-part-2-18152$ep=94682$token=abc',
    // animekai format
    'animekai-spy-x-family-part-2-18152$ep=1$token=abc',
    // kaido format
    'kaido-spy-x-family-part-2-18152?ep=94682',
];

async function test() {
    console.log('Testing getStreamingLinks for different episode ID formats...\n');

    for (const epId of testEpisodes) {
        console.log(`=== Testing episode ID: ${epId} ===`);

        for (const { name, src } of sources) {
            if (!src.getStreamingLinks) {
                console.log(`  ${name}: no getStreamingLinks`);
                continue;
            }

            try {
                const data = await Promise.race([
                    src.getStreamingLinks(epId, undefined, 'sub'),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
                ]);

                if (data.sources?.length > 0) {
                    console.log(`  ${name}: ✅ ${data.sources.length} sources found`);
                    console.log(`    First: ${data.sources[0].url.substring(0, 80)}...`);
                } else {
                    console.log(`  ${name}: ❌ no sources`);
                }
            } catch (err) {
                console.log(`  ${name}: ❌ ${err.message}`);
            }
        }

        console.log('');
    }
}

test();
