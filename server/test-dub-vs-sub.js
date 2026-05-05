import axios from 'axios';
import * as cheerio from 'cheerio';

const epId = 'one-piece-dk6r$ep=1$token=coDh9_Ly6U1W8Visvd';

async function checkPage(category) {
    const watchUrl = `https://animekai.to/watch/${epId}`;
    console.log(`\n=== Checking ${category.toUpperCase()} ===`);
    console.log('URL:', watchUrl);
    
    try {
        const resp = await axios.get(watchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://animekai.to/',
                'Cookie': `category=${category}`, // Try setting category cookie
            },
            timeout: 15000,
        });
        
        const $ = cheerio.load(resp.data);
        
        // Look for active/selected server indicators
        console.log('\nServer buttons found:');
        $('[data-server], .server-item, .server, button[class*="server"]').each((i, el) => {
            const serverUrl = $(el).attr('data-server') || $(el).attr('data-link') || '';
            const serverName = $(el).text().trim() || $(el).attr('title') || `Server ${i + 1}`;
            const isActive = $(el).hasClass('active') || $(el).attr('data-active') === 'true' || $(el).css('background-color');
            const dataType = $(el).attr('data-type') || $(el).attr('data-category') || '';
            console.log(`  ${isActive ? '[ACTIVE]' : ''} ${serverName} (${dataType})`);
            console.log(`    URL: ${serverUrl.substring(0, 80)}`);
        });
        
        // Look for dub/sub toggle
        console.log('\nDub/Sub toggles:');
        $('[class*="dub"], [class*="sub"], [data-type="dub"], [data-type="sub"]').each((i, el) => {
            console.log(`  ${$(el).prop('tagName')}: ${$(el).text().trim()} (class: ${$(el).attr('class')})`);
        });
        
        // Check scripts for stream data
        const scripts = $('script').map((i, s) => $(s).html()).get().filter(s => s && (s.includes('iframe') || s.includes('stream') || s.includes('megaup')));
        console.log('\nRelevant scripts:', scripts.length);
        scripts.slice(0, 2).forEach((s, i) => {
            const iframeMatch = s.match(/iframe[^]*?src=["']([^"']+)["']/);
            if (iframeMatch) console.log(`Script ${i} iframe src: ${iframeMatch[1].substring(0, 80)}`);
        });
        
    } catch (err) {
        console.error('Error:', err.message);
    }
}

// Check both sub and dub
checkPage('sub').then(() => checkPage('dub'));
