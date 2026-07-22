const axios = require('axios');
const cheerio = require('cheerio');

async function testFullFlow(episodeId) {
    console.log(`\nTesting WatchHentai full flow for: ${episodeId}`);
    let cleanId = episodeId.replace(/^(watchhentai|hanime)-/, '');
    
    // Step 1: Resolve video page URL
    let videoUrl = '';
    if (cleanId.startsWith('videos/')) {
        videoUrl = `https://watchhentai.net/${cleanId}`;
    } else if (cleanId.startsWith('http')) {
        videoUrl = cleanId;
    } else {
        // Search watchhentai.net
        const searchTerm = cleanId.replace(/-episode-\d+/, '').replace(/-/g, ' ');
        console.log(`Searching watchhentai for "${searchTerm}"...`);
        const searchRes = await axios.get(`https://watchhentai.net/?s=${encodeURIComponent(searchTerm)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $s = cheerio.load(searchRes.data);
        const seriesUrl = $s('article a, .post a, .movie-item a').first().attr('href');
        console.log('Found series URL:', seriesUrl);

        if (seriesUrl) {
            const seriesRes = await axios.get(seriesUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const $page = cheerio.load(seriesRes.data);
            
            // Look for episode links
            const epNumMatch = cleanId.match(/episode-(\d+)/i);
            const targetEpNum = epNumMatch ? parseInt(epNumMatch[1]) : 1;
            
            let matchedEpUrl = '';
            $page('a[href*="/videos/"]').each((_, el) => {
                const href = $page(el).attr('href');
                const text = $page(el).text().trim();
                if (href && (text.includes(`Episode ${targetEpNum}`) || href.includes(`episode-${targetEpNum}`))) {
                    matchedEpUrl = href;
                }
            });
            if (!matchedEpUrl) {
                matchedEpUrl = $page('a[href*="/videos/"]').first().attr('href');
            }
            videoUrl = matchedEpUrl;
        }
    }

    if (!videoUrl) {
        videoUrl = `https://watchhentai.net/videos/${cleanId}/`;
    }

    console.log('Video page URL:', videoUrl);

    // Step 2: Fetch video page HTML & find Dooplayer options
    try {
        const pageRes = await axios.get(videoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $ = cheerio.load(pageRes.data);
        
        const sources = [];
        const playerOptions = $('#playeroptionsul li');
        console.log(`Found ${playerOptions.length} player options`);

        for (let i = 0; i < Math.min(3, playerOptions.length); i++) {
            const opt = playerOptions.eq(i);
            const post = opt.attr('data-post');
            const type = opt.attr('data-type');
            const nume = opt.attr('data-nume');

            if (post) {
                console.log(`Calling doo_player_ajax for post=${post}, type=${type}, nume=${nume}`);
                const params = new URLSearchParams();
                params.append('action', 'doo_player_ajax');
                params.append('post', post);
                params.append('type', type || 'tv');
                params.append('nume', nume || '1');

                const ajaxRes = await axios.post('https://watchhentai.net/wp-admin/admin-ajax.php', params.toString(), {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Referer': videoUrl
                    }
                });

                const embedUrl = ajaxRes.data?.embed_url;
                if (embedUrl) {
                    console.log(`✅ Extracted embed URL: ${embedUrl}`);
                    sources.push({
                        url: embedUrl,
                        quality: 'auto',
                        isM3U8: embedUrl.includes('.m3u8'),
                        isDirect: embedUrl.endsWith('.mp4')
                    });
                }
            }
        }

        console.log('Final extracted sources:', sources);
    } catch (err) {
        console.error('Error fetching video page:', err.message);
    }
}

testFullFlow('watchhentai-shoujo-ramune-episode-1');
testFullFlow('hanime-overflow-episode-1');
