import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

async function testAnichiPuppeteer() {
    console.log('--- Testing Anichi Puppeteer Scraping ---');
    const targetUrl = 'https://anichi.to/watch/chainsmoker-cat/ep-1';
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

        const streams: any[] = [];
        const episodeList: any[] = [];

        page.on('response', async res => {
            const url = res.url();
            if (url.includes('ajax/episode/list')) {
                try {
                    const data = await res.json();
                    if (data.result) {
                        const $ = cheerio.load(data.result);
                        $('a, button, [data-id]').each((_, el) => {
                            episodeList.push({
                                num: $(el).text().trim(),
                                id: $(el).attr('data-id') || $(el).attr('data-ep-id'),
                                href: $(el).attr('href')
                            });
                        });
                    }
                } catch (e) {}
            }

            if (url.includes('m3u8') || url.includes('mapper.nekostream') || url.includes('embed') || url.includes('api/mal') || url.includes('pahe.nekostream')) {
                console.log('[Anichi Stream Network Match]:', url);
                streams.push(url);
            }
        });

        console.log('Navigating to', targetUrl);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // Click on SUB/DUB tabs if present or iframe player
        const iframes = await page.$$eval('iframe', els => els.map(e => e.src));
        console.log('Iframes on page:', iframes);

        // Check DOM server list
        const servers = await page.evaluate(() => {
            const list: any[] = [];
            document.querySelectorAll('.servers [data-type], .servers [data-sv-id], .servers li').forEach(el => {
                list.push({
                    text: el.textContent?.trim(),
                    type: el.getAttribute('data-type') || el.closest('[data-type]')?.getAttribute('data-type'),
                    epId: el.getAttribute('data-ep-id'),
                    svId: el.getAttribute('data-sv-id'),
                    linkId: el.getAttribute('data-link-id')
                });
            });
            return list;
        });

        console.log('Servers found in DOM:', servers.slice(0, 10));
        console.log('Captured streams:', streams);

    } catch (err: any) {
        console.error('Anichi puppeteer error:', err.message);
    } finally {
        if (browser) await browser.close();
    }
}

testAnichiPuppeteer();
