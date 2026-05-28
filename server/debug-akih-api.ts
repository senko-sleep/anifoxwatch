import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugAkiHAPI() {
    console.log('Debugging AkiH for embed extraction...');

    const videoId = 'gVeegWqZIw';
    const watchUrl = `https://aki-h.com/watch/${videoId}/`;
    const embedVideoId = '16346'; // This is the actual video ID from displayvideo(0, 16346)
    const iframeUrl = `https://v.aki-h.com/v2/${embedVideoId}`;

    try {
        // Fetch the watch page
        console.log(`\n1. Fetching watch page: ${watchUrl}`);
        const response = await axios.get(watchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            }
        });

        const $ = cheerio.load(response.data);
        
        // Look for script tags with JSON data
        console.log('\n2. Checking script tags for JSON data...');
        $('script').each((i, el) => {
            const text = $(el).html() || '';
            if (text.includes('player') || text.includes('video') || text.includes('stream') || text.includes('m3u8')) {
                console.log(`\nScript ${i} (length: ${text.length}):`);
                console.log(text.substring(0, 500));
            }
        });

        // Extract complete iframe element
        console.log('\n3. Extracting complete iframe element...');
        const iframeElement = $('iframe[src*="v.aki-h.com"]');
        if (iframeElement.length > 0) {
            const iframeHtml = $.html(iframeElement[0]);
            console.log('Iframe HTML:');
            console.log(iframeHtml);
            
            const iframeSrc = iframeElement.attr('src');
            console.log(`\nIframe src: ${iframeSrc}`);
        }

        // Fetch the iframe HTML completely
        console.log(`\n4. Fetching complete iframe HTML: ${iframeUrl}`);
        try {
            const iframeResponse = await axios.get(iframeUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Referer': watchUrl,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                timeout: 15000
            });
            
            console.log(`Iframe status: ${iframeResponse.status}`);
            console.log(`Iframe content length: ${iframeResponse.data.length}`);
            
            // Extract the video-code2.js URL
            const jsMatch = iframeResponse.data.match(/src="(https:\/\/v\.aki-h\.com\/assets\/js\/video-code2\.js[^"]*)"/);
            if (jsMatch) {
                const jsUrl = jsMatch[1];
                console.log(`\n5. Found video-code2.js: ${jsUrl}`);
                
                // Fetch the JavaScript file
                const jsResponse = await axios.get(jsUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                        'Referer': iframeUrl,
                    },
                    timeout: 15000
                });
                
                console.log(`JS status: ${jsResponse.status}`);
                console.log(`JS content length: ${jsResponse.data.length}`);
                console.log('\nJavaScript content:');
                console.log(jsResponse.data);
                
                // The JS shows start() redirects to /e/ + vid
                console.log('\n6. The start() function redirects to /e/ + vid');
                console.log(`Trying to fetch: https://v.aki-h.com/e/${videoId}`);
                
                try {
                    const eResponse = await axios.get(`https://v.aki-h.com/e/${videoId}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                            'Referer': iframeUrl,
                        },
                        timeout: 15000
                    });
                    
                    console.log(`/e/ status: ${eResponse.status}`);
                    console.log(`/e/ content length: ${eResponse.data.length}`);
                    console.log('\n/e/ content:');
                    console.log(eResponse.data);
                    
                    // Save to file
                    const fs = await import('fs');
                    fs.writeFileSync('akih-e-page.html', eResponse.data);
                    console.log('\nSaved /e/ page to akih-e-page.html');
                    
                    // Look for stream URLs
                    if (eResponse.data.includes('.m3u8') || eResponse.data.includes('.mp4')) {
                        console.log('\n✅ Found potential stream URLs in /e/ page!');
                        const urlMatches = eResponse.data.match(/https?:\/\/[^\s"']+\.(m3u8|mp4)/g);
                        if (urlMatches) {
                            console.log('Stream URLs:', urlMatches);
                        }
                    }
                } catch (eError: any) {
                    console.log(`/e/ fetch error: ${eError.message}`);
                }
            }
            
        } catch (e: any) {
            console.log(`Iframe fetch error: ${e.message}`);
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

debugAkiHAPI().catch(error => {
    console.error('\nFatal error:', error);
});
