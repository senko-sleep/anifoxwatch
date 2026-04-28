import axios from 'axios';
import * as cheerio from 'cheerio';

async function main() {
    const baseUrl = 'https://anitaku.to';

    // Search for an actual series (not movie)
    console.log('Searching "one piece" on anitaku.to...');
    const r = await axios.get(`${baseUrl}/search.html?keyword=one+piece`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000,
    });
    const $ = cheerio.load(r.data);
    const items: string[] = [];
    $('.last_episodes .items li').each((i, el) => {
        const title = $(el).find('.name a').text().trim();
        const href = $(el).find('.name a').attr('href') || '';
        items.push(`${title} → ${href}`);
    });
    console.log('Results:', items.length);
    items.slice(0, 5).forEach(x => console.log('  ', x));

    // Get the category page for the first result
    const slug = items[0]?.split('→')[1]?.trim().split('/category/')[1];
    if (!slug) { console.log('No slug found'); process.exit(1); }

    console.log('\nGetting category page for:', slug);
    const catR = await axios.get(`${baseUrl}/category/${slug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000,
    });
    const $c = cheerio.load(catR.data);
    
    // Check for movie_id or other episode structures
    const movieId = $c('#movie_id').val();
    const alias = $c('#alias_anime').val();
    console.log('movie_id:', movieId);
    console.log('alias:', alias);
    
    // Check episode page links
    const epPages = $c('#episode_page li');
    console.log('Episode pages:', epPages.length);
    epPages.each((i, el) => {
        const a = $c(el).find('a');
        console.log(`  Page: ${a.attr('ep_start')}-${a.attr('ep_end')}`);
    });

    // Check for episode links on the page itself
    const epLinks = $c('a[class*="ep"]').length;
    console.log('Episode links:', epLinks);
    
    // Try to find alternative AJAX URL
    const scripts = $c('script').toArray().map(s => $c(s).html() || '');
    for (const script of scripts) {
        if (script.includes('ajax') || script.includes('episode')) {
            console.log('\nScript with ajax/episode:', script.slice(0, 300));
        }
    }

    // Now try episode page directly - One Piece ep 1
    const epUrl = `${baseUrl}/one-piece-episode-1`;
    console.log('\n\nDirect episode URL:', epUrl);
    try {
        const epR = await axios.get(epUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': baseUrl }, timeout: 10000,
        });
        const $e = cheerio.load(epR.data);
        
        // Find all iframes
        $e('iframe').each((i, el) => {
            console.log(`iframe[${i}]:`, $e(el).attr('src')?.slice(0, 120));
        });
        
        // Find video containers
        const vidDiv = $e('#load_anime, .play-video, .anime_video_body').length;
        console.log('Video containers:', vidDiv);
        
        // Find server list
        $e('.anime_muti_link ul li, .anime_video_body_watch_items li').each((i, el) => {
            const name = $e(el).text().trim().slice(0, 40);
            const dataVideo = $e(el).find('a').attr('data-video') || '';
            console.log(`Server ${i}: "${name}" → ${dataVideo.slice(0, 100)}`);
        });
    } catch (e: any) {
        console.log('Episode page error:', e.message?.slice(0, 100));
    }

    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
