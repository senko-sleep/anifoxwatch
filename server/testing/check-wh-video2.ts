/**
 * Check WatchHentai video page for direct stream URL
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

async function checkVideoPage() {
    console.log('Checking video page structure...\n');

    const videoUrl = 'https://watchhentai.net/videos/asa-made-shirudaku-oyakodon-episode-1-id-01/';

    try {
        console.log(`Fetching: ${videoUrl}\n`);
        const response = await axios.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);

        console.log('Page title:', $('title').text().trim());

        // Look for iframes
        console.log('\n--- Looking for iframe elements ---');
        const iframes = $('iframe');
        console.log(`Iframe elements: ${iframes.length}`);
        iframes.each((i, iframe) => {
            const src = $(iframe).attr('src');
            const srcdoc = $(iframe).attr('srcdoc') || '';
            console.log(`  Iframe ${i + 1}:`);
            console.log(`    src: ${src?.substring(0, 150)}...`);
            if (srcdoc) {
                const decoded = srcdoc.replace(/"/g, '"').replace(/&#039;/g, "'").replace(/&/g, '&');
                console.log(`    srcdoc preview: ${decoded.substring(0, 300)}...`);
            }
        });

        // Look for all script tags and check for URLs
        console.log('\n--- Looking for script tags with URLs ---');
        const scripts = $('script');
        scripts.each((i, script) => {
            const src = $(script).attr('src') || '';
            const content = $(script).html() || '';
            if (content.includes('hstorage') || content.includes('mp4') || content.includes('source') || content.includes('jwplayer')) {
                console.log(`  Script ${i + 1} (src=${src}):`);
                console.log(`    Content preview: ${content.substring(0, 400)}...`);
            }
        });

        // Look for any URLs in the HTML
        console.log('\n--- Looking for .mp4 URLs in HTML ---');
        const html = $('html').html() || '';
        const mp4Matches = html.match(/https:\/\/[^\s"']*\.mp4[^\s"']*/g);
        if (mp4Matches) {
            console.log(`Found ${mp4Matches.length} MP4 URLs`);
            [...new Set(mp4Matches)].slice(0, 5).forEach((url, i) => {
                console.log(`  ${i + 1}: ${url.substring(0, 150)}...`);
            });
        }

        // Look for hstorage URLs
        console.log('\n--- Looking for hstorage URLs ---');
        const hstorageMatches = html.match(/https:\/\/[^"'\s]*hstorage[^"'\s]*/g);
        if (hstorageMatches) {
            console.log(`Found ${hstorageMatches.length} hstorage URLs`);
            [...new Set(hstorageMatches)].slice(0, 5).forEach((url, i) => {
                console.log(`  ${i + 1}: ${url.substring(0, 150)}...`);
            });
        }

        // Look for jwplayer config
        console.log('\n--- Looking for jwplayer config ---');
        const jwplayerMatches = html.match(/jwplayer\([^)]+\)/g);
        if (jwplayerMatches) {
            console.log(`Found ${jwplayerMatches.length} jwplayer configs`);
            jwplayerMatches.slice(0, 3).forEach((match, i) => {
                const decoded = match.replace(/"/g, '"').replace(/&#039;/g, "'").replace(/&/g, '&');
                console.log(`  ${i + 1}: ${decoded.substring(0, 300)}...`);
            });
        }

        // Look for any URL that looks like a video source
        console.log('\n--- Looking for encoded URLs (source=) ---');
        const sourceMatches = html.match(/source=https%3A%2F%2F[^\s"']+/g);
        if (sourceMatches) {
            console.log(`Found ${sourceMatches.length} encoded source URLs`);
            [...new Set(sourceMatches)].slice(0, 5).forEach((url, i) => {
                const decoded = decodeURIComponent(url);
                console.log(`  ${i + 1}: ${url.substring(0, 100)}...`);
                console.log(`     Decoded: ${decoded.substring(0, 150)}...`);
            });
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

checkVideoPage();
