import axios from 'axios';
import * as cheerio from 'cheerio';

// Check if there's a dub-specific URL parameter
const baseId = 'one-piece-dk6r$ep=1$token=coDh9_Ly6U1W8Visvd';

async function getIframe(epId, label) {
    const watchUrl = `https://animekai.to/watch/${epId}`;
    console.log(`\n=== ${label} ===`);
    console.log('URL:', watchUrl);
    
    try {
        const resp = await axios.get(watchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://animekai.to/',
            },
            timeout: 15000,
        });
        
        const $ = cheerio.load(resp.data);
        
        // Look for the main iframe (current stream)
        const mainIframe = $('iframe').attr('src');
        console.log('Main iframe:', mainIframe || 'none found');
        
        // Look for server buttons with data-server
        console.log('\nAll servers:');
        $('[data-server]').each((i, el) => {
            const url = $(el).attr('data-server');
            const name = $(el).text().trim() || $(el).attr('title') || `Server ${i+1}`;
            const isDub = $(el).attr('data-dub') || $(el).attr('data-type') === 'dub';
            console.log(`  ${name} (dub=${isDub}): ${url?.substring(0, 80)}`);
        });
        
        // Check for any data-dub attributes
        console.log('\nElements with data-dub:');
        $('[data-dub]').each((i, el) => {
            console.log(`  ${$(el).prop('tagName')}: data-dub=${$(el).attr('data-dub')}, server=${$(el).attr('data-server')?.substring(0, 60)}`);
        });
        
        // Check URL patterns in the page
        const html = resp.data;
        const iframeMatches = html.match(/iframe[^]*?src=["']([^"']+)["']/g);
        console.log('\nAll iframe matches:', iframeMatches?.length || 0);
        iframeMatches?.slice(0, 3).forEach(m => console.log(' ', m.substring(0, 100)));
        
    } catch (err) {
        console.error('Error:', err.message);
    }
}

// Test both URLs - try adding &dub=1 parameter
getIframe(baseId, 'DEFAULT (no param)').then(() => {
    return getIframe(baseId + '&dub=1', 'WITH &dub=1');
}).then(() => {
    return getIframe(baseId.replace('$ep=1$', '$ep=1$dub=1$'), 'WITH $dub=1$ in ID');
});
