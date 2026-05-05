import axios from 'axios';
import * as cheerio from 'cheerio';

// Test the iframe URL from the logs
const iframeUrl = 'https://animekai.to/iframe/Ksf-sOWq_1C7hntHyI7D-mpY4MILyRGQ7I9zzXl2cRT41Q_CtK2Qwh0raahTeg';

async function testIframe() {
    console.log('Testing iframe URL:', iframeUrl.substring(0, 70) + '...\n');
    
    try {
        const resp = await axios.get(iframeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://animekai.to/',
            },
            timeout: 15000,
        });
        
        const html = resp.data;
        console.log('Response length:', html.length);
        console.log('\n=== First 500 chars ===');
        console.log(html.substring(0, 500));
        
        // Look for iframes
        const $ = cheerio.load(html);
        console.log('\n=== IFRAMES ===');
        $('iframe').each((i, el) => {
            const src = $(el).attr('src') || '';
            console.log(`Iframe ${i}: ${src.substring(0, 80)}`);
        });
        
        // Look for any video URLs
        console.log('\n=== VIDEO URLS IN HTML ===');
        const videoMatches = html.match(/https?:\/\/[^\s"'<>]+\.(m3u8|mp4|webm)/gi) || [];
        videoMatches.slice(0, 5).forEach(url => console.log(' ', url.substring(0, 80)));
        
        // Look for megaup URLs specifically
        console.log('\n=== MEGAUP URLS ===');
        const megaupMatches = html.match(/https?:\/\/[^\s"'<>]*megaup[^\s"'<>]*/gi) || [];
        megaupMatches.slice(0, 5).forEach(url => console.log(' ', url.substring(0, 80)));
        
        // Look for any /e/ or /media/ URLs
        console.log('\n=== EMBED PATTERNS ===');
        const embedMatches = html.match(/["'][^"']*\/(e|embed|iframe|media)\/[^"']*["']/gi) || [];
        embedMatches.slice(0, 5).forEach(url => console.log(' ', url.substring(0, 80)));
        
    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) {
            console.log('Status:', err.response.status);
            console.log('Body:', err.response.data?.substring(0, 200));
        }
    }
}

testIframe();
