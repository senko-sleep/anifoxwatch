/**
 * Detailed extraction test for WatchHentai
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function analyzeWatchHentaiPage() {
    console.log('Analyzing WatchHentai page structure...\n');

    const videoUrl = 'https://watchhentai.net/videos/asa-made-shirudaku-oyakodon-episode-1-id-01/';

    try {
        const response = await axios.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 30000
        });

        const html = response.data;

        // Save HTML to file for analysis
        fs.writeFileSync('testing/wh-page.html', html);
        console.log('Saved HTML to testing/wh-page.html');

        const $ = cheerio.load(html);

        // Find all iframes
        console.log('\n=== IFRAMES ===');
        $('iframe').each((i, el) => {
            const src = $(el).attr('src') || '';
            const srcdoc = $(el).attr('srcdoc') || '';
            console.log(`\nIframe ${i + 1}:`);
            console.log(`  src: ${src}`);
            if (srcdoc) {
                // Decode and look for player URLs
                const decoded = srcdoc
                    .replace(/&quot;/g, '"')
                    .replace(/&#039;/g, "'")
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>');

                // Save decoded srcdoc
                fs.writeFileSync(`testing/wh-iframe-${i + 1}.html`, decoded);
                console.log(`  Saved srcdoc to testing/wh-iframe-${i + 1}.html`);

                // Look for player embed URLs
                const embedUrls = decoded.match(/src=["']([^"']+)["']/gi);
                if (embedUrls) {
                    console.log('  Embed URLs:');
                    embedUrls.forEach(u => {
                        const url = u.replace(/src=["']/, '').replace(/["']$/, '');
                        console.log(`    ${url}`);
                    });
                }
            }
        });

        // Look for script tags with video config
        console.log('\n=== SCRIPTS WITH VIDEO CONFIG ===');
        $('script').each((i, el) => {
            const content = $(el).html() || '';
            if (content.includes('player') || content.includes('video') || content.includes('source')) {
                if (content.length < 5000) {
                    console.log(`Script ${i + 1} (${content.length} chars):`);
                    console.log(content.substring(0, 500));
                    console.log('...\n');
                }
            }
        });

        // Look for any embed/player URLs
        console.log('\n=== EMBED URLs ===');
        const embedPatterns = [
            /https?:\/\/[^\s"'<>]*embed[^\s"'<>]*/gi,
            /https?:\/\/[^\s"'<>]*player[^\s"'<>]*/gi,
            /https?:\/\/[^\s"'<>]*stream[^\s"'<>]*/gi,
        ];

        for (const pattern of embedPatterns) {
            const matches = html.match(pattern);
            if (matches) {
                console.log(`Pattern ${pattern}:`);
                [...new Set(matches)].slice(0, 5).forEach(m => console.log(`  ${m}`));
            }
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

analyzeWatchHentaiPage();
