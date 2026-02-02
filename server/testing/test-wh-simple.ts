/**
 * Simple test for WatchHentai source
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { WatchHentaiSource } from '../src/sources/watchhentai-source.js';

async function test() {
    console.log('Testing WatchHentai search...\n');

    const source = new WatchHentaiSource();
    const result = await source.search('hentai', 1);

    console.log(`Found ${result.results.length} results\n`);

    if (result.results.length > 0) {
        const first = result.results[0];
        console.log('First result:');
        console.log(`  Title: ${first.title}`);
        console.log(`  ID: ${first.id}`);
        console.log(`  Image: ${first.image}`);
        console.log(`  Type: ${first.type}`);

        // Test getAnime
        console.log('\nTesting getAnime...');
        const detail = await source.getAnime(first.id);
        if (detail) {
            console.log(`  Title: ${detail.title}`);
            console.log(`  Image: ${detail.image}`);
        } else {
            console.log('  Failed to get details');
        }
    }
}

test().catch(console.error);
