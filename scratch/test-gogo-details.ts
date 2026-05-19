import { GogoanimeSource } from '../server/src/sources/gogoanime-source.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
    console.log("Testing GogoanimeSource getStreamingLinks details...");
    const baseUrl = 'https://gogoanimes.fi';
    const subEpId = 're-zero-starting-life-in-another-world-season-3-episode-1';
    
    console.log(`GET ${baseUrl}/${subEpId}`);
    try {
        const response = await axios.get(`${baseUrl}/${subEpId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': baseUrl
            }
        });
        console.log(`Response status: ${response.status}`);
        const $ = cheerio.load(response.data);
        
        console.log("Servers elements in .anime_muti_link:");
        const embedUrls: any[] = [];
        $('.anime_muti_link ul li, .anime_video_body_watch_items li').each((i, el) => {
            const a = $(el).find('a');
            const dataVideo = a.attr('data-video') || '';
            const name = $(el).text().replace('Choose this server', '').trim();
            console.log(` - Server: name="${name}", dataVideo="${dataVideo}"`);
            if (dataVideo) {
                embedUrls.push({ name, url: dataVideo.startsWith('http') ? dataVideo : `https:${dataVideo}` });
            }
        });
        
        console.log("Found iframes:");
        $('iframe').each((i, el) => {
            console.log(` - Iframe src: "${$(el).attr('src')}"`);
        });
        
        if (embedUrls.length > 0) {
            const firstEmbed = embedUrls[0];
            console.log(`Fetching embed URL: ${firstEmbed.url}`);
            const embedResp = await axios.get(firstEmbed.url, {
                headers: {
                    'Referer': baseUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            console.log(`Embed status: ${embedResp.status}`);
            const html = embedResp.data;
            const m3u8Matches = [...html.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)]
                .map(m => m[1])
                .filter(u => u.startsWith('http'));
            console.log("Found m3u8 links in embed HTML:");
            console.log(m3u8Matches);
        }
    } catch (e: any) {
        console.error("Failed:", e.message);
    }
}

run();
