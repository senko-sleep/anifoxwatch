/**
 * Test WatchHentai URL extraction and verify the stream works
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

async function testWatchHentaiStream() {
    console.log('Testing WatchHentai stream extraction...\n');

    // Test with a known video URL
    const videoUrl = 'https://watchhentai.net/videos/asa-made-shirudaku-oyakodon-episode-1-id-01/';

    try {
        console.log(`1. Fetching video page: ${videoUrl}\n`);
        const response = await axios.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://watchhentai.net/'
            },
            timeout: 30000
        });

        const html = response.data;
        console.log(`2. Got HTML (${html.length} bytes)\n`);

        // Method 1: Find hstorage URLs in source= params
        const sourceMatches = html.match(/source=https%3A%2F%2F[^\s"'\&]+/g);
        if (sourceMatches) {
            console.log('3. Found encoded source URLs:');
            for (const match of [...new Set(sourceMatches)]) {
                const decoded = decodeURIComponent(match.replace('source=', ''));
                console.log(`   - ${decoded}`);
            }
            console.log('');
        }

        // Method 2: Look for direct mp4/m3u8 URLs
        const directUrls = html.match(/https:\/\/[^\s"'<>]*\.(mp4|m3u8)[^\s"'<>]*/gi);
        if (directUrls) {
            console.log('4. Found direct video URLs:');
            for (const url of [...new Set(directUrls)].slice(0, 5)) {
                console.log(`   - ${url}`);
            }
            console.log('');
        }

        // Method 3: Look for iframe srcdoc with embedded player
        const $ = cheerio.load(html);
        const iframes = $('iframe');
        console.log(`5. Found ${iframes.length} iframe(s)\n`);

        iframes.each((i, iframe) => {
            const src = $(iframe).attr('src');
            const srcdoc = $(iframe).attr('srcdoc');

            if (src) {
                console.log(`   Iframe ${i + 1} src: ${src}`);
            }
            if (srcdoc) {
                // Decode HTML entities
                const decoded = srcdoc
                    .replace(/&quot;/g, '"')
                    .replace(/&#039;/g, "'")
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>');

                // Extract URLs from srcdoc
                const srcdocUrls = decoded.match(/https:\/\/[^\s"'<>]+/gi);
                if (srcdocUrls) {
                    console.log(`   Iframe ${i + 1} embedded URLs:`);
                    for (const url of [...new Set(srcdocUrls)].slice(0, 5)) {
                        console.log(`     - ${url}`);
                    }
                }

                // Look for source= encoded URLs in srcdoc
                const srcDocSourceMatches = decoded.match(/source=https?%3A[^\s"'&]+/gi);
                if (srcDocSourceMatches) {
                    console.log(`   Iframe ${i + 1} source= URLs:`);
                    for (const match of srcDocSourceMatches) {
                        const url = decodeURIComponent(match.replace('source=', ''));
                        console.log(`     - ${url}`);
                    }
                }
            }
        });

        // Test if the extracted URL works
        console.log('\n6. Testing stream URL accessibility...');

        // Extract first viable URL
        let testUrl = null;
        if (sourceMatches && sourceMatches.length > 0) {
            testUrl = decodeURIComponent(sourceMatches[0].replace('source=', ''));
        }

        if (testUrl) {
            console.log(`   Testing: ${testUrl.substring(0, 100)}...`);

            try {
                const streamTest = await axios.head(testUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://watchhentai.net/'
                    },
                    timeout: 10000,
                    maxRedirects: 5
                });
                console.log(`   ✅ Stream accessible! Status: ${streamTest.status}`);
                console.log(`   Content-Type: ${streamTest.headers['content-type']}`);
                console.log(`   Content-Length: ${streamTest.headers['content-length']}`);
            } catch (streamErr: any) {
                console.log(`   ❌ Stream not directly accessible: ${streamErr.message}`);
                console.log(`   Response status: ${streamErr.response?.status}`);
            }
        }

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
        }
    }
}

testWatchHentaiStream();
