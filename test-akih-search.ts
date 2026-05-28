import axios from 'axios';
import * as cheerio from 'cheerio';

async function testSearch() {
    const response = await axios.post('https://aki-h.com/search/', new URLSearchParams({ q: 'Jimihen!!' }), {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    const $ = cheerio.load(response.data);
    
    $('.flw-item').each((i, el) => {
        const link = $(el).find('.film-name a, .film-poster-ahref').first();
        console.log(`Result ${i}:`);
        console.log(`  Title: ${link.attr('title') || link.text().trim()}`);
        console.log(`  Href: ${link.attr('href')}`);
    });
}

testSearch().catch(console.error);
