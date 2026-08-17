import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';

async function inspectReAnime() {
    console.log('\n==========================================');
    console.log('       INSPECTING REANIME (reanime.to)      ');
    console.log('==========================================\n');
    
    const targetUrl = 'https://reanime.to/watch/chainsmoker-cat-9dyhxc?ep=1&lang=sub';
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

        const capturedRequests: { method: string; url: string; postData?: string }[] = [];
        const capturedResponses: { url: string; status: number; textSnippet: string }[] = [];

        page.on('request', req => {
            const url = req.url();
            if (!url.includes('.png') && !url.includes('.jpg') && !url.includes('.css') && !url.includes('font') && !url.includes('google')) {
                capturedRequests.push({ method: req.method(), url, postData: req.postData() });
            }
        });

        page.on('response', async res => {
            const url = res.url();
            if (url.includes('api') || url.includes('embed') || url.includes('stream') || url.includes('episode') || url.includes('ajax') || url.includes('player') || url.includes('source') || url.includes('m3u8')) {
                try {
                    const text = await res.text();
                    capturedResponses.push({ url, status: res.status(), textSnippet: text.slice(0, 500) });
                } catch (e) {}
            }
        });

        console.log(`[ReAnime] Navigating to ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000)); // wait for player hydration

        console.log(`[ReAnime] Title: ${await page.title()}`);

        const iframes = await page.$$eval('iframe', els => els.map(e => e.src));
        console.log(`[ReAnime] IFrames found:`, iframes);

        const videoSources = await page.$$eval('video, video source', els => els.map(e => (e as any).src));
        console.log(`[ReAnime] Video sources found:`, videoSources);

        // Extract DOM elements related to server / language / episodes
        const pageInfo = await page.evaluate(() => {
            const servers = Array.from(document.querySelectorAll('[class*="server"], [data-server], [id*="server"], button'))
                .map(e => ({ text: e.textContent?.trim(), class: e.className, id: e.id, data: (e as HTMLElement).dataset }));
            const episodes = Array.from(document.querySelectorAll('a[href*="/watch/"], [data-episode]'))
                .map(e => ({ text: e.textContent?.trim(), href: (e as HTMLAnchorElement).href, dataEp: (e as HTMLElement).dataset.episode }));
            const langs = Array.from(document.querySelectorAll('[class*="lang"], [data-lang], button, a'))
                .filter(e => e.textContent?.toLowerCase().includes('sub') || e.textContent?.toLowerCase().includes('dub'))
                .map(e => ({ text: e.textContent?.trim(), href: (e as HTMLAnchorElement).href }));
            return { servers: servers.slice(0, 15), episodes: episodes.slice(0, 15), langs };
        });

        console.log('[ReAnime] Server elements:', pageInfo.servers);
        console.log('[ReAnime] Language elements:', pageInfo.langs);
        console.log('[ReAnime] Episode links sample:', pageInfo.episodes);

        console.log('\n[ReAnime] Captured Interesting Responses:');
        capturedResponses.forEach(r => console.log(`  -> ${r.status} ${r.url}\n     Body snippet: ${r.textSnippet}`));

    } catch (err: any) {
        console.error('[ReAnime] Error:', err.message);
    } finally {
        if (browser) await browser.close();
    }
}

async function inspectAnichi() {
    console.log('\n==========================================');
    console.log('        INSPECTING ANICHI (anichi.to)       ');
    console.log('==========================================\n');

    const targetUrl = 'https://anichi.to/watch/chainsmoker-cat/ep-1';
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

        const capturedRequests: { method: string; url: string; postData?: string }[] = [];
        const capturedResponses: { url: string; status: number; textSnippet: string }[] = [];

        page.on('request', req => {
            const url = req.url();
            if (!url.includes('.png') && !url.includes('.jpg') && !url.includes('.css') && !url.includes('font') && !url.includes('google') && !url.includes('fontawesome')) {
                capturedRequests.push({ method: req.method(), url, postData: req.postData() });
            }
        });

        page.on('response', async res => {
            const url = res.url();
            if (url.includes('api') || url.includes('embed') || url.includes('stream') || url.includes('episode') || url.includes('ajax') || url.includes('player') || url.includes('source') || url.includes('m3u8')) {
                try {
                    const text = await res.text();
                    capturedResponses.push({ url, status: res.status(), textSnippet: text.slice(0, 500) });
                } catch (e) {}
            }
        });

        console.log(`[Anichi] Navigating to ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 4000)); // wait for client JS execution

        console.log(`[Anichi] Title: ${await page.title()}`);

        const iframes = await page.$$eval('iframe', els => els.map(e => e.src));
        console.log(`[Anichi] IFrames found:`, iframes);

        const videoSources = await page.$$eval('video, video source', els => els.map(e => (e as any).src));
        console.log(`[Anichi] Video sources found:`, videoSources);

        // Inspect DOM structure
        const pageInfo = await page.evaluate(() => {
            const servers = Array.from(document.querySelectorAll('[class*="server"], [data-server], [id*="server"], button, .server-item, .servers'))
                .map(e => ({ text: e.textContent?.trim(), class: e.className, id: e.id, data: (e as HTMLElement).dataset }));
            const episodes = Array.from(document.querySelectorAll('a[href*="/ep-"], a[href*="/watch/"], [data-id], .ep-item, .episodes'))
                .map(e => ({ text: e.textContent?.trim(), href: (e as HTMLAnchorElement).href, dataId: (e as HTMLElement).dataset.id, class: e.className }));
            const tabs = Array.from(document.querySelectorAll('[class*="sub"], [class*="dub"], [class*="tab"], .btn, button'))
                .map(e => ({ text: e.textContent?.trim(), class: e.className, data: (e as HTMLElement).dataset }));
            return { servers: servers.slice(0, 20), episodes: episodes.slice(0, 20), tabs: tabs.slice(0, 20) };
        });

        console.log('[Anichi] Server elements:', pageInfo.servers);
        console.log('[Anichi] Tabs/Sub/Dub elements:', pageInfo.tabs.filter(t => t.text?.toLowerCase().includes('sub') || t.text?.toLowerCase().includes('dub') || t.text?.toLowerCase().includes('ep')));
        console.log('[Anichi] Episode links sample:', pageInfo.episodes);

        console.log('\n[Anichi] Captured Interesting Responses:');
        capturedResponses.forEach(r => console.log(`  -> ${r.status} ${r.url}\n     Body snippet: ${r.textSnippet}`));

        // Try searching on anichi.to
        const searchUrl = 'https://anichi.to/search?keyword=chainsmoker';
        console.log(`\n[Anichi] Navigating to search URL: ${searchUrl}...`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000));
        const searchResults = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href*="/watch/"]')).map(e => ({
                text: e.textContent?.trim(),
                href: (e as HTMLAnchorElement).href
            }));
        });
        console.log('[Anichi] Search results:', searchResults);

    } catch (err: any) {
        console.error('[Anichi] Error:', err.message);
    } finally {
        if (browser) await browser.close();
    }
}

async function main() {
    await inspectReAnime();
    await inspectAnichi();
}

main();
