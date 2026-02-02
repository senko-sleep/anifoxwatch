/**
 * Test script for WatchHentai source
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { WatchHentaiSource } from '../src/sources/watchhentai-source.js';

async function testWatchHentai() {
    console.log('Testing WatchHentai source...\n');

    const source = new WatchHentaiSource();

    // Test health check
    console.log('1. Health check...');
    const isHealthy = await source.healthCheck();
    console.log(`   Health: ${isHealthy ? '✓ Online' : '✗ Offline'}\n`);

    // Test search for hentai
    console.log('2. Testing search for "hentai"...');
    try {
        const searchResult = await source.search('hentai', 1);
        console.log(`   Found ${searchResult.results.length} results`);

        if (searchResult.results.length > 0) {
            console.log('\n   First 3 results:');
            searchResult.results.slice(0, 3).forEach((anime, i) => {
                console.log(`   ${i + 1}. ${anime.title}`);
                console.log(`      ID: ${anime.id}`);
                console.log(`      Image: ${anime.image}`);
                console.log(`      Type: ${anime.type}`);
            });

            // Test getAnime with first result
            if (searchResult.results.length > 0) {
                const firstAnime = searchResult.results[0];
                console.log(`\n3. Testing getAnime for: ${firstAnime.id}`);
                const animeDetail = await source.getAnime(firstAnime.id);
                if (animeDetail) {
                    console.log(`   Title: ${animeDetail.title}`);
                    console.log(`   Image: ${animeDetail.image}`);
                    console.log(`   Description: ${animeDetail.description?.slice(0, 100)}...`);
                } else {
                    console.log('   ✗ Failed to get anime details');
                }

                // Test getEpisodes
                console.log(`\n4. Testing getEpisodes for: ${firstAnime.id}`);
                const episodes = await source.getEpisodes(firstAnime.id);
                console.log(`   Found ${episodes.length} episodes`);

                // Test getStreamingLinks
                if (episodes.length > 0) {
                    console.log(`\n5. Testing getStreamingLinks for episode: ${episodes[0].id}`);
                    const streamData = await source.getStreamingLinks(episodes[0].id);
                    console.log(`   Sources: ${streamData.sources.length}`);
                    if (streamData.sources.length > 0) {
                        console.log(`   First source URL: ${streamData.sources[0].url.substring(0, 80)}...`);
                    }
                }
            }
        }
    } catch (error: any) {
        console.error('Search error:', error.message);
    }

    // Test with a specific anime ID
    console.log('\n6. Testing with specific ID: watchhentai-series/boku-no-pico-id-01');
    try {
        const anime = await source.getAnime('watchhentai-series/boku-no-pico-id-01');
        if (anime) {
            console.log(`   ✓ Found: ${anime.title}`);
            console.log(`   Image: ${anime.image}`);
        } else {
            console.log('   ✗ Anime not found (this is expected if the ID changed)');
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

testWatchHentai().catch(console.error);
