import axios from 'axios';
import * as cheerio from 'cheerio';

async function main() {
    const baseUrl = 'https://anitaku.to';
    const ajaxUrl = 'https://ajax.gogocdn.net/ajax';

    // 1. Search
    console.log('Searching naruto on anitaku.to...');
    const r = await axios.get(`${baseUrl}/search.html?keyword=naruto`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000,
    });
    const $ = cheerio.load(r.data);
    const firstHref = $('.last_episodes .items li').first().find('.name a').attr('href') || '';
    const animeSlug = firstHref.split('/category/')[1] || '';
    console.log('First result slug:', animeSlug);

    if (!animeSlug) { console.log('No results'); process.exit(1); }

    // 2. Get episodes
    console.log('\nGetting episodes...');
    const catR = await axios.get(`${baseUrl}/category/${animeSlug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000,
    });
    const $c = cheerio.load(catR.data);
    const movieId = $c('#movie_id').val();
    const alias = $c('#alias_anime').val();
    const epEnd = $c('#episode_page li').last().find('a').attr('ep_end') || '5';
    console.log('movieId:', movieId, 'alias:', alias, 'epEnd:', epEnd);

    const listUrl = `${ajaxUrl}/load-list-episode?ep_start=0&ep_end=${epEnd}&id=${movieId}&default_ep=0&alias=${alias}`;
    const listR = await axios.get(listUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
    const $l = cheerio.load(listR.data);
    const firstEpHref = $l('li a').last().attr('href')?.trim() || '';
    const epSlug = firstEpHref.startsWith('/') ? firstEpHref.substring(1) : firstEpHref;
    console.log('First episode slug:', epSlug);

    if (!epSlug) { console.log('No episodes'); process.exit(1); }

    // 3. Get streaming links
    console.log('\nGetting streaming page...');
    const epR = await axios.get(`${baseUrl}/${epSlug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': baseUrl }, timeout: 10000,
    });
    const $e = cheerio.load(epR.data);
    const iframeSrc = $e('#load_anime iframe').attr('src') ||
        $e('.play-video iframe').attr('src') ||
        $e('iframe[src*="streaming"]').attr('src') ||
        $e('iframe').first().attr('src');
    console.log('iframe src:', iframeSrc?.slice(0, 120));

    if (!iframeSrc) { console.log('No iframe found'); process.exit(1); }

    // 4. Fetch iframe content and extract m3u8
    let streamUrl = iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`;
    console.log('\nFetching iframe:', streamUrl.slice(0, 120));
    const ifR = await axios.get(streamUrl, {
        headers: { 'Referer': baseUrl, 'User-Agent': 'Mozilla/5.0' }, timeout: 10000,
    });
    const html = typeof ifR.data === 'string' ? ifR.data : JSON.stringify(ifR.data);
    
    const m3u8s = [...html.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)].map(m => m[1]).filter(u => u.startsWith('http'));
    const mp4s = [...html.matchAll(/file:\s*["']([^"']*\.mp4[^"']*)["']/g)].map(m => m[1]);
    
    console.log('m3u8 URLs found:', m3u8s.length);
    for (const u of m3u8s) console.log('  m3u8:', u.slice(0, 120));
    console.log('mp4 URLs found:', mp4s.length);
    for (const u of mp4s) console.log('  mp4:', u.slice(0, 120));

    if (m3u8s.length === 0 && mp4s.length === 0) {
        console.log('\nNo direct URLs found. Looking for encrypted data...');
        const cryptoMatch = html.match(/data-value="([^"]+)"/);
        if (cryptoMatch) console.log('  Found encrypted data-value (needs GogoPlay AES decryption)');
        const ajaxMatch = html.match(/encrypt-ajax\.php/);
        if (ajaxMatch) console.log('  Found encrypt-ajax.php reference (GogoPlay encryption)');
    }

    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
