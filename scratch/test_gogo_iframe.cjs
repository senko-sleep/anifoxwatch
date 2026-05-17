const https = require('https');
const cheerio = require('cheerio');

async function testIframe() {
    const url = 'https://gogoanime.me.uk/newplayer.php?id=boruto-naruto-next-generations-8143?ep=99728&type=hd-1&category=dub';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
            console.log('Iframe status:', res.statusCode);
            console.log('Iframe snippet:', d.substring(0, 300));
            
            // Try to find m3u8 or mp4 in the source
            const m3u8 = d.match(/https?:\/\/[^\"]+\.m3u8/);
            const mp4 = d.match(/https?:\/\/[^\"]+\.mp4/);
            const source = d.match(/sources:\s*\[\{file:\s*['"]([^'"]+)['"]/);
            
            console.log('Found m3u8?', !!m3u8, m3u8 ? m3u8[0] : '');
            console.log('Found mp4?', !!mp4, mp4 ? mp4[0] : '');
            console.log('Found JWPlayer source?', !!source, source ? source[1] : '');
        });
    });
}
testIframe();
