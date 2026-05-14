import axios from 'axios';
import * as cheerio from 'cheerio';

async function searchGogo() {
    try {
        const resp = await axios.get('https://anitaku.to/search.html?keyword=classroom%20of%20the%20elite');
        const $ = cheerio.load(resp.data);
        $('.items li').each((_, el) => {
            const a = $(el).find('.name a');
            console.log(a.attr('title'), '->', a.attr('href')?.split('/').pop());
        });
    } catch (e: any) {
        console.error(e.message);
    }
}
searchGogo();
