import axios from 'axios';
import * as cheerio from 'cheerio';

const epId = 'one-piece-dk6r$ep=1$token=coDh9_Ly6U1W8Visvd';

async function scrapeWebsite() {
    const watchUrl = `https://animekai.to/watch/${epId}`;
    console.log('Fetching:', watchUrl);
    
    try {
        const resp = await axios.get(watchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://animekai.to/',
            },
            timeout: 15000,
        });
        
        const $ = cheerio.load(resp.data);
        const html = resp.data;
        
        // Look for server elements
        console.log('\n=== ALL ELEMENTS WITH data-server ===');
        $('[data-server]').each((i, el) => {
            const $el = $(el);
            const attrs = Object.keys(el.attribs || {}).reduce((acc, key) => {
                acc[key] = $el.attr(key);
                return acc;
            }, {});
            console.log(`Element ${i}:`, JSON.stringify(attrs, null, 2)?.substring(0, 200));
        });
        
        // Look for elements with 'dub' or 'sub' in class
        console.log('\n=== ELEMENTS WITH dub/sub CLASS ===');
        $('[class*="dub"], [class*="sub"]').each((i, el) => {
            const className = $(el).attr('class') || '';
            const tagName = $(el).prop('tagName');
            const text = $(el).text().trim().substring(0, 30);
            console.log(`${tagName}.${className}: "${text}"`);
        });
        
        // Look for iframe URLs in scripts
        console.log('\n=== IFRAME URLs IN PAGE ===');
        const iframeMatches = html.match(/iframe[^]*?src=["']([^"']+)["']/gi) || [];
        iframeMatches.slice(0, 5).forEach(url => console.log(' ', url.substring(0, 100)));
        
        // Look for /iframe/ links
        console.log('\n=== ALL /iframe/ LINKS ===');
        const allIframeLinks = [];
        $('a, button, [data-server], [onclick]').each((i, el) => {
            const href = $(el).attr('href') || $(el).attr('data-server') || $(el).attr('onclick') || '';
            if (href.includes('/iframe/')) {
                allIframeLinks.push({
                    tag: $(el).prop('tagName'),
                    text: $(el).text().trim().substring(0, 30),
                    href: href.substring(0, 80),
                    class: $(el).attr('class') || 'no-class'
                });
            }
        });
        console.log(`Found ${allIframeLinks.length} iframe links:`);
        allIframeLinks.slice(0, 10).forEach(link => {
            console.log(`  ${link.tag}: "${link.text}" (${link.class})`);
            console.log(`    URL: ${link.href}`);
        });
        
    } catch (err) {
        console.error('Error:', err.message);
    }
}

scrapeWebsite();
