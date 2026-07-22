const axios = require('axios');
const cheerio = require('cheerio');

async function testVideoPage() {
    const url = 'https://watchhentai.net/videos/overflow-episode-1-id-01/';
    console.log('Fetching episode page:', url);
    const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(res.data);

    console.log('--- IFRAMES & PLAYER OPTIONS ---');
    $('#playeroptionsul li, .dooplayer, iframe').each((_, el) => {
        const $el = $(el);
        console.log('Element:', el.name, '| id:', $el.attr('id'), '| data-post:', $el.attr('data-post'), '| data-type:', $el.attr('data-type'), '| data-nume:', $el.attr('data-nume'), '| src:', $el.attr('src'));
    });

    const postId = $('#playeroptionsul li').first().attr('data-post');
    const type = $('#playeroptionsul li').first().attr('data-type');
    const nume = $('#playeroptionsul li').first().attr('data-nume');

    console.log(`\nTesting Dooplayer API with post=${postId}, type=${type}, nume=${nume}...`);
    if (postId) {
        const formData = new URLSearchParams();
        formData.append('action', 'doo_player_ajax');
        formData.append('post', postId);
        formData.append('type', type || 'movie');
        formData.append('nume', nume || '1');

        const apiRes = await axios.post('https://watchhentai.net/wp-admin/admin-ajax.php', formData.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': url
            }
        });
        console.log('Dooplayer API Response:', JSON.stringify(apiRes.data, null, 2));
    }
}

testVideoPage();
