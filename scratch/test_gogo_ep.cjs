const https = require('https');
const cheerio = require('cheerio');

async function testEpisodePage() {
    const url = 'https://gogoanime.or.at/anime/boruto-naruto-next-generations-dub/';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
            const $ = cheerio.load(d);
            const eps = [];
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.includes('episode')) eps.push(href);
            });
            console.log('Episode links:', [...new Set(eps)].slice(0, 5));
            
            if (eps.length > 0) {
                const epUrl = eps[0];
                console.log('Testing episode URL:', epUrl);
                https.get(epUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
                    let d2 = '';
                    res2.on('data', c => d2 += c);
                    res2.on('end', () => {
                        const ep$ = cheerio.load(d2);
                        const iframes = [];
                        ep$('iframe').each((i, el) => iframes.push(ep$(el).attr('src')));
                        console.log('Iframes on actual episode page:', iframes);
                    });
                });
            }
        });
    });
}
testEpisodePage();
