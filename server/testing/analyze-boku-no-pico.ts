/**
 * Analyze the boku-no-pico page HTML
 */
import axios from 'axios';
import * as fs from 'fs';

async function analyzePage() {
    const url = 'https://watchhentai.net/videos/boku-no-pico-episode-1-id-01/';

    console.log(`Fetching: ${url}\n`);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 15000
        });

        const html = response.data;
        console.log(`Got HTML (${html.length} bytes)\n`);

        // Save full HTML
        fs.writeFileSync('testing/boku-no-pico-page.html', html);
        console.log('Saved to testing/boku-no-pico-page.html\n');

        // Look for iframe patterns
        const iframeMatches = html.match(/iframe[^>]*>/gi);
        if (iframeMatches) {
            console.log('Found iframes:');
            iframeMatches.forEach((m: string) => console.log('  ' + m.substring(0, 150)));
        }

        // Look for jwplayer URLs
        const jwplayerMatches = html.match(/jwplayer[^"'\s]*/gi);
        if (jwplayerMatches) {
            console.log('\nFound jwplayer mentions:');
            jwplayerMatches.forEach((m: string) => console.log('  ' + m));
        }

        // Look for data-litespeed-src
        const litespeedMatches = html.match(/data-litespeed-src=['"][^'"]+['"]/gi);
        if (litespeedMatches) {
            console.log('\nFound data-litespeed-src:');
            litespeedMatches.forEach((m: string) => console.log('  ' + m));
        }

        // Look for any player URLs
        const playerUrls = html.match(/https:\/\/watchhentai\.net\/[^"'\s]*(jwplayer|plyr)[^"'\s]*/gi);
        if (playerUrls) {
            console.log('\nFound player URLs:');
            playerUrls.forEach((m: string) => console.log('  ' + m));
        }

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
    }
}

analyzePage();
