import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugAkiH() {
    const videoId = 'gVeegWqZIw';
    const url = `https://aki-h.com/videos/${videoId}/`;
    
    console.log(`Fetching: ${url}\n`);
    
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000
    });
    
    const html = response.data;
    console.log('HTML length:', html.length);
    
    const $ = cheerio.load(html);
    
    console.log('\n=== Looking for video sources ===');
    
    // Check player wrapper
    const playerWrapper = $('#player-wrapper');
    console.log('Player wrapper found:', playerWrapper.length > 0);
    if (playerWrapper.length > 0) {
        console.log('data-video:', playerWrapper.attr('data-video'));
        console.log('data-player:', playerWrapper.attr('data-player'));
        console.log('player-wrapper HTML snippet:', playerWrapper.html()?.substring(0, 300));
    }
    
    // Check all data attributes on player-wrapper
    console.log('\nAll attributes on player-wrapper:');
    playerWrapper.each((_, el) => {
        const $el = $(el);
        Object.keys($el[0].attribs || {}).forEach(attr => {
            console.log(`  ${attr}: ${$el.attr(attr)}`);
        });
    });
    
    // Check for iframes
    const iframes = $('iframe');
    console.log(`\nIframe elements found: ${iframes.length}`);
    iframes.each((i, f) => {
        console.log(`  Iframe ${i}: src=${$(f).attr('src')}`);
    });
    
    // Check for video elements
    const videos = $('video');
    console.log(`\nVideo elements found: ${videos.length}`);
    
    // Direct HTML search for URLs
    console.log('\n=== Direct HTML search ===');
    const hstorageMatches = html.match(/https?:\/\/hstorage[^\s"'<>]+\.mp4/gi);
    console.log(`HStorage URLs: ${hstorageMatches?.length || 0}`);
    if (hstorageMatches) {
        hstorageMatches.slice(0, 5).forEach(u => console.log(`  ${u}`));
    }
    
    const anyMp4Matches = html.match(/https?:\/\/[^\s"'<>]+\.mp4/gi);
    console.log(`\nAny MP4 URLs: ${anyMp4Matches?.length || 0}`);
    if (anyMp4Matches) {
        anyMp4Matches.slice(0, 10).forEach(u => console.log(`  ${u}`));
    }
}

debugAkiH().catch(console.error);