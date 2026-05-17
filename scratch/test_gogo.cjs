const https = require('https');
const cheerio = require('cheerio');

async function search(query) {
    return new Promise((resolve) => {
        https.get('https://gogoanime.or.at/?s=' + query, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
    });
}

async function run() {
    const html = await search('naruto');
    const $ = cheerio.load(html);
    const links = [];
    $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('naruto')) links.push(href);
    });
    console.log('Search links:', [...new Set(links)].slice(0, 5));
    
    // Test the typical /category/ or /watch/ endpoint if available
    console.log('Testing a typical episode path on this site to see if it embeds a video...');
    if (links.length > 0) {
        https.get(links[0], { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let epData = '';
            res.on('data', c => epData += c);
            res.on('end', () => {
                const ep$ = cheerio.load(epData);
                const iframes = [];
                ep$('iframe').each((i, el) => iframes.push(ep$(el).attr('src')));
                console.log('Iframes found on episode page:', iframes);
            });
        });
    }
}
run();
