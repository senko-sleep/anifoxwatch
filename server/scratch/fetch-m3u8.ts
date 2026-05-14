import axios from 'axios';
import * as cheerio from 'cheerio';

async function fetchM3u8() {
    const epId = 'classroom-of-the-elite-iv-episode-1';
    const baseUrl = 'https://anitaku.to';
    
    const response = await axios.get(`${baseUrl}/${epId}`);
    const $ = cheerio.load(response.data);
    const embeds: string[] = [];
    $('.anime_muti_link ul li a').each((i, el) => {
        const url = $(el).attr('data-video');
        if (url) embeds.push(url.startsWith('http') ? url : `https:${url}`);
    });
    
    console.log("Embeds:", embeds);
    
    for (const embed of embeds) {
        if (!embed.includes('vibeplayer') && !embed.includes('embtaku')) continue;
        console.log(`\nFetching embed: ${embed}`);
        const resp = await axios.get(embed);
        const m3u8 = resp.data.match(/["']([^"']*\.m3u8[^"']*?)["']/);
        if (m3u8) {
            console.log("Found m3u8:", m3u8[1]);
            const m3u8Resp = await axios.get(m3u8[1]);
            const lines = typeof m3u8Resp.data === 'string' ? m3u8Resp.data.split('\n') : [];
            let variant = lines.find((l: string) => l.startsWith('http') || l.includes('.m3u8'));
            if (variant) {
                if (!variant.startsWith('http')) {
                    const base = m3u8[1].substring(0, m3u8[1].lastIndexOf('/') + 1);
                    variant = base + variant;
                }
                console.log("Fetching variant:", variant);
                const varResp = await axios.get(variant);
                const varLines = typeof varResp.data === 'string' ? varResp.data.split('\n') : [];
                const segments = varLines.filter((l: string) => l.trim() && !l.startsWith('#'));
                console.log(`Segments count: ${segments.length}`);
                if (segments.length > 0) {
                    console.log("First 3 segments:");
                    console.log(segments.slice(0, 3));
                }
            }
        }
    }
}
fetchM3u8();
