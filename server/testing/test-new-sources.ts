import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function testSite(name: string, url: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${name} — ${url}`);
    console.log('='.repeat(60));
    try {
        const r = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 10000, maxRedirects: 5 });
        console.log(`  Status: ${r.status}`);
        console.log(`  Final URL: ${r.request?.res?.responseUrl || url}`);
        const $ = cheerio.load(r.data);
        console.log(`  Title: ${$('title').text().trim().slice(0, 100)}`);
        
        // Look for video elements
        const videos = $('video').length;
        const iframes = $('iframe').length;
        console.log(`  <video>: ${videos}, <iframe>: ${iframes}`);
        
        // Print iframe srcs
        $('iframe').each((i, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || '';
            if (src) console.log(`    iframe[${i}]: ${src.slice(0, 120)}`);
        });
        
        // Look for server/embed lists
        const serverLis = $('.anime_muti_link li, .server-item, [data-video], .episodes a, .ep-item').length;
        console.log(`  Server/embed items: ${serverLis}`);
        
        // data-video attrs
        $('[data-video]').each((i, el) => {
            const dv = $(el).attr('data-video') || '';
            if (dv) console.log(`    data-video[${i}]: ${dv.slice(0, 120)}`);
        });
        
        // Links that look like episodes
        const epLinks: string[] = [];
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (href.includes('episode') || href.includes('/watch/') || href.includes('-ep-')) {
                epLinks.push(href.slice(0, 100));
            }
        });
        if (epLinks.length > 0) {
            console.log(`  Episode-like links (first 5): ${epLinks.slice(0, 5).join('\n    ')}`);
        }
        
        // Search for m3u8/mp4 in page source
        const html = r.data as string;
        const m3u8s = html.match(/https?:\/\/[^\s"'<>]*\.m3u8[^\s"'<>]*/gi) || [];
        const mp4s = html.match(/https?:\/\/[^\s"'<>]*\.mp4[^\s"'<>]*/gi) || [];
        if (m3u8s.length) console.log(`  M3U8 URLs found: ${m3u8s.slice(0, 3).join(', ')}`);
        if (mp4s.length) console.log(`  MP4 URLs found: ${mp4s.slice(0, 3).join(', ')}`);
        
        // Look for JSON-LD schema
        const jsonLd = $('script[type="application/ld+json"]').first().html();
        if (jsonLd) console.log(`  JSON-LD: ${jsonLd.slice(0, 200)}`);
        
        return r.data;
    } catch (e: unknown) {
        const err = e as { message?: string; response?: { status: number } };
        console.log(`  ERROR: ${err.message?.slice(0, 120)}`);
        if (err.response) console.log(`  Response status: ${err.response.status}`);
        return null;
    }
}

async function testSearch(name: string, baseUrl: string, searchPath: string, query: string) {
    console.log(`\n--- Search test: ${name} "${query}" ---`);
    try {
        const url = `${baseUrl}${searchPath}${encodeURIComponent(query)}`;
        console.log(`  URL: ${url}`);
        const r = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 10000 });
        const $ = cheerio.load(r.data);
        const title = $('title').text().trim().slice(0, 80);
        console.log(`  Title: ${title}`);
        
        // Count result items
        const items = $('.flw-item, .film_list-wrap .flw-item, .anime-list .item, .result-item, .anime-card, .ani_items .item').length;
        console.log(`  Result items: ${items}`);
        
        // First few result titles
        const titles: string[] = [];
        $('.flw-item .film-name a, .anime-card .title, .ani_items .item .title, .result-item .title').each((_, el) => {
            titles.push($(el).text().trim().slice(0, 60));
        });
        if (titles.length) console.log(`  Titles: ${titles.slice(0, 5).join(', ')}`);
    } catch (e: unknown) {
        const err = e as { message?: string };
        console.log(`  ERROR: ${err.message?.slice(0, 120)}`);
    }
}

async function main() {
    // Test all three sites
    await testSite('crazy-animetv (homepage)', 'https://crazy-animetv.net/');
    await testSite('gogoanime.by (spy x family s3)', 'https://gogoanime.by/series/spy-x-family-season-3/');
    await testSite('anikai.to (watch page)', 'https://anikai.to/watch/spy-x-family-season-3-v2q8#ep=1');
    
    // Test search
    await testSearch('crazy-animetv', 'https://crazy-animetv.net', '/?s=', 'spy x family');
    await testSearch('gogoanime.by', 'https://gogoanime.by', '/?s=', 'spy x family');
    await testSearch('anikai.to', 'https://anikai.to', '/search?keyword=', 'spy x family');
    
    // Test episode page on crazy-animetv
    console.log('\n--- Checking crazy-animetv for episode pages ---');
    try {
        const r = await axios.get('https://crazy-animetv.net/?s=spy+x+family', { headers: { 'User-Agent': UA }, timeout: 10000 });
        const $ = cheerio.load(r.data);
        // Find first anime link
        const firstLink = $('a[href]').filter((_, el) => {
            const href = $(el).attr('href') || '';
            return href.includes('crazy-animetv.net') && !href.includes('?s=') && href.length > 30;
        }).first().attr('href');
        if (firstLink) {
            console.log(`  First result link: ${firstLink}`);
            await testSite('crazy-animetv (anime page)', firstLink);
        }
    } catch (e: unknown) {
        console.log(`  ERROR: ${(e as Error).message?.slice(0, 100)}`);
    }

    // Test gogoanime.by episode page
    console.log('\n--- Checking gogoanime.by episode page ---');
    try {
        const r = await axios.get('https://gogoanime.by/series/spy-x-family-season-3/', { headers: { 'User-Agent': UA }, timeout: 10000 });
        const $ = cheerio.load(r.data);
        const firstEp = $('a[href*="episode"]').first().attr('href');
        if (firstEp) {
            console.log(`  First episode link: ${firstEp}`);
            await testSite('gogoanime.by (episode)', firstEp);
        } else {
            // Check for other episode structures
            const epLinks = $('a[href]').filter((_, el) => {
                const h = $(el).attr('href') || '';
                return h.includes('/episode/') || h.includes('-episode-');
            });
            console.log(`  Episode links found: ${epLinks.length}`);
            epLinks.each((i, el) => {
                if (i < 3) console.log(`    ${$(el).attr('href')}`);
            });
        }
    } catch (e: unknown) {
        console.log(`  ERROR: ${(e as Error).message?.slice(0, 100)}`);
    }

    // Test AkiH streaming (hentai)
    console.log('\n--- AkiH streaming test ---');
    await testSite('aki-h.com (homepage)', 'https://aki-h.com/');
    try {
        const r = await axios.get('https://aki-h.com/', { headers: { 'User-Agent': UA }, timeout: 10000 });
        const $ = cheerio.load(r.data);
        const firstVideo = $('a[href*="/videos/"]').first().attr('href');
        if (firstVideo) {
            const videoUrl = firstVideo.startsWith('http') ? firstVideo : `https://aki-h.com${firstVideo}`;
            console.log(`  First video link: ${videoUrl}`);
            await testSite('aki-h.com (video page)', videoUrl);
        }
    } catch (e: unknown) {
        console.log(`  ERROR: ${(e as Error).message?.slice(0, 100)}`);
    }

    process.exit(0);
}

main();
