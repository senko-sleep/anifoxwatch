/**
 * Test fetching WatchHentai's jwplayer page to extract the real stream URL
 * Write output to file for complete analysis
 */
import axios from 'axios';
import * as fs from 'fs';

async function testJWPlayerPage() {
    const output: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        output.push(msg);
    };

    log('Testing WatchHentai JWPlayer page extraction...\n');

    // This is the player URL format from the main video page
    const playerUrl = 'https://watchhentai.net/jwplayer/?source=https%3A%2F%2Fhstorage.xyz%2Ffiles%2FA%2Fasa-made-shirudaku-oyakodon%2Fasa-made-shirudaku-oyakodon-1.mp4&id=39389&type=mp4&quality=1080p,480p,720p';

    try {
        log(`Fetching player page: ${playerUrl}\n`);
        const response = await axios.get(playerUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://watchhentai.net/',
            },
            timeout: 30000
        });

        const html = response.data;
        log(`Got player HTML (${html.length} bytes)\n`);

        // Save the HTML for analysis
        fs.writeFileSync('testing/jwplayer-page.html', html);
        log('Saved HTML to testing/jwplayer-page.html\n');

        // Look for jwplayer setup
        const jwSetupMatch = html.match(/jwplayer\([^)]+\)\.setup\(\{[\s\S]*?sources\s*:\s*\[([^\]]+)\]/);
        if (jwSetupMatch) {
            log('Found JWPlayer setup sources:');
            log(jwSetupMatch[1]);
        }

        // Look for file: in jwplayer config
        const fileMatches = html.match(/file\s*:\s*["']([^"']+)["']/g);
        if (fileMatches) {
            log('\nFound file URLs in jwplayer config:');
            fileMatches.forEach(m => log('  ' + m));
        }

        // Look for sources array
        const sourcesMatch = html.match(/sources\s*:\s*\[([\s\S]*?)\]/);
        if (sourcesMatch) {
            log('\nFound sources array:');
            log(sourcesMatch[1].substring(0, 500));
        }

        // Look for any mp4/m3u8 URLs in the HTML
        const videoUrls = html.match(/https?:\/\/[^\s"'<>]*\.(mp4|m3u8)[^\s"'<>]*/gi);
        if (videoUrls) {
            log('\nAll video URLs found:');
            [...new Set(videoUrls)].forEach(url => log('  ' + url));
        }

        // Test if any of the URLs work
        if (videoUrls && videoUrls.length > 0) {
            log('\n\n=== Testing URL accessibility ===');
            for (const testUrl of [...new Set(videoUrls)].slice(0, 3)) {
                try {
                    log(`\nTesting: ${testUrl}`);
                    const headResp = await axios.head(testUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://watchhentai.net/',
                        },
                        timeout: 10000,
                        maxRedirects: 5
                    });
                    log(`✅ Accessible! Status: ${headResp.status}, Content-Type: ${headResp.headers['content-type']}`);
                } catch (err: any) {
                    log(`❌ Failed: ${err.message}, Status: ${err.response?.status}`);
                }
            }
        }

    } catch (error: any) {
        log(`Error: ${error.message}`);
        if (error.response) {
            log(`Response status: ${error.response.status}`);
        }
    }

    // Write all output to file
    fs.writeFileSync('testing/jwplayer-test-output.txt', output.join('\n'));
    console.log('\nAll output saved to testing/jwplayer-test-output.txt');
}

testJWPlayerPage();
