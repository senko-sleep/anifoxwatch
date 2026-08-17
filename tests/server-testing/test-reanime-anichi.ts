import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

async function testReAnime() {
    console.log('\n--- Testing ReAnime ---');
    const targetUrl = 'https://reanime.to/watch/chainsmoker-cat-9dyhxc?ep=1&lang=sub';
    try {
        const resp = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 10000
        });
        console.log('ReAnime HTTP Status:', resp.status);
        const $ = cheerio.load(resp.data);
        console.log('Title:', $('title').text().trim());
        
        // Inspect scripts, iframes, player elements, data attributes
        const scripts: string[] = [];
        $('script').each((_, el) => {
            const h = $(el).html();
            const src = $(el).attr('src');
            if (h) scripts.push(h);
            if (src) console.log('Script src:', src);
        });
        console.log(`Found ${scripts.length} inline script tags.`);
        
        scripts.forEach((s, idx) => {
            if (s && (s.includes('player') || s.includes('stream') || s.includes('sources') || s.includes('episodes') || s.includes('sub') || s.includes('dub') || s.includes('window.') || s.includes('__NEXT_DATA__') || s.includes('__NUXT__'))) {
                console.log(`Script ${idx} sample:`, s.slice(0, 400));
            }
        });

        $('iframe, video, source, div[data-id], a[href*="watch"]').each((i, el) => {
            console.log('Element:', el.tagName, $(el).attr());
        });

        // Let's also check search URL or API format for reanime.to
        const searchUrl = 'https://reanime.to/search?keyword=chainsmoker';
        console.log('\nTesting ReAnime search request to:', searchUrl);
        const searchResp = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            },
            timeout: 10000
        }).catch(err => ({ status: err.response?.status, data: err.response?.data || err.message }));
        console.log('Search HTTP status:', searchResp.status);
        if (typeof searchResp.data === 'string') {
            const $search = cheerio.load(searchResp.data);
            console.log('Search page title:', $search('title').text().trim());
            console.log('Search result items:', $search('a[href*="/watch/"]').map((_, e) => $search(e).attr('href')).get().slice(0, 10));
        }

    } catch (err: any) {
        console.error('ReAnime fetch error:', err.message);
    }
}

async function testAnichi() {
    console.log('\n--- Testing Anichi (Puppeteer) ---');
    const targetUrl = 'https://anichi.to/watch/chainsmoker-cat/ep-1';
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        page.on('request', req => {
            const url = req.url();
            if (url.includes('m3u8') || url.includes('api') || url.includes('embed') || url.includes('stream') || url.includes('episode') || url.includes('sub') || url.includes('dub') || url.includes('ajax')) {
                console.log('[Anichi Req]:', req.method(), url);
            }
        });

        page.on('response', async res => {
            const url = res.url();
            if (url.includes('api') || url.includes('episode') || url.includes('stream') || url.includes('sources') || url.includes('ajax')) {
                try {
                    const text = await res.text();
                    console.log('[Anichi Res]:', url, text.slice(0, 300));
                } catch (e) {}
            }
        });

        console.log('Navigating to', targetUrl);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        console.log('Page Title:', await page.title());

        // Extract HTML / state
        const content = await page.content();
        const $ = cheerio.load(content);
        console.log('Iframes:', $('iframe').map((_, el) => $(el).attr('src')).get());
        console.log('Video sources:', $('video, source').map((_, el) => $(el).attr('src')).get());

        // Print buttons or tabs
        const episodeButtons: any[] = [];
        $('button, a, div[data-id], div[data-number], li').each((_, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            const dataId = $(el).attr('data-id') || $(el).attr('data-ep') || $(el).attr('data-num');
            if (href || dataId || text.includes('Ep') || text.includes('SUB') || text.includes('DUB')) {
                episodeButtons.push({ tag: el.tagName, text: text.slice(0, 40), href, dataId, class: $(el).attr('class') });
            }
        });
        console.log(`Found ${episodeButtons.length} relevant elements. Sample:`, episodeButtons.slice(0, 15));

    } catch (err: any) {
        console.error('Anichi puppeteer error:', err.message);
    } finally {
        if (browser) await browser.close();
    }
}

async function run() {
    await testReAnime();
    await testAnichi();
}

run();
