/**
 * Test fetching Boku no Pico JWPlayer page to extract the real stream URL
 */
import axios from 'axios';
import * as fs from 'fs';

async function testJWPlayerPage() {
    const output: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        output.push(msg);
    };

    log('Testing Boku no Pico JWPlayer page extraction...\n');

    // This is the player URL from the Boku no Pico page
    const playerUrl = 'https://watchhentai.net/jwplayer/?source=https%3A%2F%2Fhstorage.xyz%2Ffiles%2FB%2Fboku-no-piko%2Fboku-no-piko-1.mp4&id=7028&type=mp4';

    try {
        log(`Fetching player page: ${playerUrl}\n`);
        const response = await axios.get(playerUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://watchhentai.net/',
            },
            timeout: 30000
        });

        const html = response.data;
        log(`Got player HTML (${html.length} bytes)\n`);

        // Save the HTML for analysis
        fs.writeFileSync('testing/boku-player.html', html);
        log('Saved HTML to testing/boku-player.html\n');

        // Look for jwplayer setup
        const jwSetupMatch = html.match(/jwplayer\([^)]+\)\.setup\(\{[\s\S]*?sources\s*:\s*\[([^\]]+)\]/);
        if (jwSetupMatch) {
            log('Found JWPlayer setup sources:');
            log(jwSetupMatch[1]);
        } else {
            log('❌ No JWPlayer setup sources found with standard regex');
        }

        // Look for file: in jwplayer config - global search
        const fileMatches = html.match(/file\s*:\s*["']([^"']+)["']/g);
        if (fileMatches) {
            log('\nFound file URLs in jwplayer config:');
            fileMatches.forEach(m => log('  ' + m));
        }

        // Look for sources array - looser regex
        const sourcesMatch = html.match(/sources\s*:\s*\[([\s\S]*?)\]/);
        if (sourcesMatch) {
            log('\nFound sources array:');
            log(sourcesMatch[1].substring(0, 500));
        }

        // Parse extracted sources using the logic in the source handler
        const sources: any[] = [];
        const fileRegex = /file\s*:\s*["']([^"']+\.mp4)["'][^}]*label\s*:\s*["']([^"']+)["']/gi;
        const fileMatchesObj = html.matchAll(fileRegex);

        for (const match of fileMatchesObj) {
            const fileUrl = match[1];
            const label = match[2];
            sources.push({ url: fileUrl, label });
        }

        log(`\nExtracted ${sources.length} sources using current logic:`);
        sources.forEach(s => log(`  ${s.label}: ${s.url}`));

        // Look for any mp4/m3u8 URLs in the HTML
        const videoUrls = html.match(/https?:\/\/[^\s"'<>]*\.(mp4|m3u8)[^\s"'<>]*/gi);
        if (videoUrls) {
            log('\nAll video URLs found:');
            [...new Set(videoUrls)].forEach(url => log('  ' + url));
        }

    } catch (error: any) {
        log(`Error: ${error.message}`);
        if (error.response) {
            log(`Response status: ${error.response.status}`);
        }
    }

    // Write all output to file
    fs.writeFileSync('testing/boku-player-output.txt', output.join('\n'));
    console.log('\nAll output saved to testing/boku-player-output.txt');
}

testJWPlayerPage();
