const https = require('https');
const cheerio = require('cheerio');

https.get('https://gogoanime.or.at/?s=test', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        const $ = cheerio.load(d);
        console.log('Article HTML:');
        console.log($('article').first().html());
    });
});
