/**
 * Check WatchHentai video page for direct stream URL
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

async function checkVideoPage() {
    console.log('Checking video page structure...\n');

    const videoUrl = 'https://watchhentai.net/videos/asa-made-shirudaku-oyakodon-episode-1-id-01/';
    // Alternative: use anime page
    const animeUrl = 'https://watchhentai.net/series/boku-dake-no-hentai-kanojo-the-animation-id-01/';

    try {
        console.log(`Fetching: ${animeUrl}\n`);
        const response = await axios.get(animeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);

        console.log('Page title:', $('title').text().trim());

        // Look for video player or iframe
        console.log('\n--- Looking for video/iframe elements ---');
        const videos = $('video');
        const iframes = $('iframe');
        console.log(`Video elements: ${videos.length}`);
        console.log(`Iframe elements: ${iframes.length}`);

        if (iframes.length > 0) {
            iframes.each((i, iframe) => {
                const src = $(iframe).attr('src');
                console.log(`  Iframe ${i + 1}: ${src?.substring(0, 100)}...`);
            });
        }

        // Look for data-src or source elements
        console.log('\n--- Looking for source elements ---');
        const sources = $('source');
        console.log(`Source elements: ${sources.length}`);
        sources.each((i, source) => {
            const src = $(source).attr('src');
            const type = $(source).attr('type');
            console.log(`  Source ${i + 1}: src=${src?.substring(0, 100)}..., type=${type}`);
        });

        // Look for jwplayer or other video players
        console.log('\n--- Looking for script tags with stream URLs ---');
        const scripts = $('script');
        scripts.each((i, script) => {
            const src = $(script).attr('src') || '';
            const content = $(script).html() || '';
            if (content.includes('hstorage') || content.includes('.mp4') || content.includes('source')) {
                console.log(`  Script ${i + 1} (src=${src}):`);
                console.log(`    Content preview: ${content.substring(0, 200)}...`);
            }
        });

        // Look for any URL with .mp4
        console.log('\n--- Looking for .mp4 URLs in HTML ---');
        const html = $('html').html() || '';
        const mp4Matches = html.match(/https:\/\/[^\s"']*\.mp4[^\s"']*/g);
        if (mp4Matches) {
            console.log(`Found ${mp4Matches.length} MP4 URLs`);
            mp4Matches.slice(0, 3).forEach((url, i) => {
                console.log(`  ${i + 1}: ${url.substring(0, 100)}...`);
            });
        }

        // Look for hstorage.xyz URLs
        console.log('\n--- Looking for hstorage URLs ---');
        const hstorageMatches = html.match(/https:\/\/[^"'\s]*hstorage[^"'\s]*/g);
        if (hstorageMatches) {
            console.log(`Found ${hstorageMatches.length} hstorage URLs`);
            hstorageMatches.slice(0, 3).forEach((url, i) => {
                console.log(`  ${i + 1}: ${url.substring(0, 100)}...`);
            });
        }

        // Check for data attributes on elements
        console.log('\n--- Looking for data-* attributes with URLs ---');
        const dataElements = $('[data-src], [data-url], [data-video]');
        console.log(`Found ${dataElements.length} elements with data-* URL attributes`);
        dataElements.slice(0, 3).each((i, el) => {
            const dataSrc = $(el).attr('data-src');
            const dataUrl = $(el).attr('data-url');
            const dataVideo = $(el).attr('data-video');
            if (dataSrc || dataUrl || dataVideo) {
                console.log(`  Element ${i + 1}: data-src=${dataSrc?.substring(0, 80)}..., data-url=${dataUrl?.substring(0, 80)}..., data-video=${dataVideo?.substring(0, 80)}...`);
            }
        });

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

checkVideoPage();
