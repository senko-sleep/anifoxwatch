import axios from 'axios';
import * as cheerio from 'cheerio';

async function inspectSite(url: string, siteName: string) {
    console.log(`\nInspecting ${siteName} structure...`);

    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        console.log('Page title:', $('title').text());
        console.log('H1 tags:', $('h1').map((i, el) => $(el).text()).get());
        console.log('Meta description:', $('meta[name="description"]').attr('content'));
        console.log('Video iframes:', $('iframe').length);
        console.log('Video elements:', $('video').length);
        console.log('Script tags with src:', $('script[src]').length);

        // Look for episode selectors
        console.log('Episode selectors found:', $('.episode, .ep-item, .episodes a').length);

        // Look for streaming related elements
        const scripts = $('script').toArray().map(s => $(s).html()).join('\n');
        const hasM3u8 = scripts.includes('.m3u8');
        const hasMp4 = scripts.includes('.mp4');
        console.log('Contains .m3u8 references:', hasM3u8);
        console.log('Contains .mp4 references:', hasMp4);

        // Look for player-related content
        const playerDiv = $('#player, .player, #video-player').html();
        console.log('Player div exists:', !!playerDiv);
        if (playerDiv) {
            console.log('Player div length:', playerDiv.length);
        }

        // Look for data attributes
        const dataAttrs = $('[data-player], [data-video], [data-src]').toArray();
        console.log('Data attributes found:', dataAttrs.length);
        dataAttrs.slice(0, 3).forEach((el, i) => {
            console.log(`  Data attr ${i}:`, $(el).attr());
        });

        // Check for external scripts
        const scriptSrcs = $('script[src]').toArray().map(s => $(s).attr('src')).filter(Boolean);
        console.log('External scripts:', scriptSrcs.length);
        scriptSrcs.slice(0, 3).forEach(src => console.log('  Script:', src));
    } catch (error: any) {
        console.error(`Failed to fetch ${siteName}:`, error.message);
    }
}

async function main() {
    // Test anikai.to
    await inspectSite('https://anikai.to/watch/spy-x-family-season-3-v2q8', 'anikai.to');

    // Test gogoanime.by
    await inspectSite('https://gogoanime.by/', 'gogoanime.by');

    // Test crazy-animetv.net series
    await inspectSite('https://crazy-animetv.net/series/spy-x-family-season-3', 'crazy-animetv.net series');

    // Test gogoanime.by without https
    await inspectSite('http://gogoanime.by/', 'gogoanime.by (http)');
}

main();