import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
    try {
        const url = 'https://vidnest.fun/animepahe/189046/11/sub';
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        const html = resp.data;
        console.log('HTML length:', html.length);
        const m3u8s = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g);
        console.log('Direct m3u8s:', m3u8s);
        
        const $ = cheerio.load(html);
        $('iframe').each((i, el) => {
            console.log('Iframe src:', $(el).attr('src'));
        });
    } catch (e) {
        console.error('Err:', e);
    }
}

test();
