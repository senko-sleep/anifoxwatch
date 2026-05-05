import axios from 'axios';
import * as cheerio from 'cheerio';

const epId = 'one-piece-dk6r$ep=1$token=coDh9_Ly6U6v1W8Visvd';
const url = 'https://animekai.to/watch/' + epId;

console.log('Fetching:', url);
try {
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000
    });
    const $ = cheerio.load(res.data);
    
    // Look for server buttons or iframe links
    console.log('Looking for servers...');
    const servers = [];
    $('a, button, iframe, [data-server], .server').each((i, el) => {
        const href = $(el).attr('href') || $(el).attr('src') || $(el).attr('data-server') || '';
        const text = $(el).text().trim();
        const dataId = $(el).attr('data-id') || '';
        if (href.includes('iframe') || href.includes('embed') || text.toLowerCase().includes('server') || $(el).hasClass('server')) {
            servers.push({ text: text || $(el).attr('title') || 'no text', href: href.substring(0, 100), dataId });
        }
    });
    
    console.log('Servers found:', servers.length);
    servers.slice(0, 10).forEach(s => console.log('  -', s.text, ':', s.href, '(data-id:', s.dataId + ')'));
    
    // Look for script data with server info
    const scripts = $('script').map((i, s) => $(s).html()).get().filter(s => s && s.includes('server'));
    console.log('\nScript references to servers:', scripts.length);
    scripts.slice(0, 2).forEach((s, i) => console.log(`Script ${i}:`, s.substring(0, 200)));
} catch(e) {
    console.error('Error:', e.message);
}
