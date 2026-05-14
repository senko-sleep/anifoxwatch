import axios from 'axios';

async function testAllAnimeScrape() {
    const url = 'https://allanime.day/anime/SyR2K6bGYfKSE6YMm/episodes/sub/1';
    console.log(`Fetching: ${url}`);
    
    try {
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
            },
            timeout: 10000
        });
        
        console.log(`Status: ${resp.status}`);
        const html = resp.data;
        console.log(`HTML Length: ${html.length}`);
        
        // Look for JSON data in the page
        if (html.includes('window.__NUXT__')) {
            console.log('Found window.__NUXT__');
            // Extract a bit of it
            const start = html.indexOf('window.__NUXT__');
            console.log(`Snippet: ${html.substring(start, start + 500)}...`);
        }
    } catch (e: any) {
        console.log(`Error: ${e.message}`);
    }
}

testAllAnimeScrape();
