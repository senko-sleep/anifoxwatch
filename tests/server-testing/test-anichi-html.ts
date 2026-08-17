import axios from 'axios';
import * as cheerio from 'cheerio';

async function testAnichiHtml() {
    console.log('--- Inspecting Anichi Page Source ---');
    const targetUrl = 'https://anichi.to/watch/chainsmoker-cat/ep-1';
    const resp = await axios.get(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        }
    });

    const $ = cheerio.load(resp.data);
    console.log('Page title:', $('title').text().trim());

    // Search for data attributes or script variables containing mal_id, anime_id, episode_id
    const scripts = $('script').map((_, el) => $(el).html()).get();
    console.log(`Found ${scripts.length} script elements.`);

    scripts.forEach((s, idx) => {
        if (s && (s.includes('mal') || s.includes('anime') || s.includes('ep') || s.includes('servers') || s.includes('sync') || s.includes('VRF') || s.includes('vrf') || s.includes('id'))) {
            console.log(`Script ${idx} sample:`, s.slice(0, 300));
        }
    });

    // Inspect elements with data-id or id
    $('[data-id], [id], div[class*="watch"]').each((_, el) => {
        const attrs = $(el).attr();
        if (attrs && (attrs['data-id'] || attrs['id']?.includes('anime') || attrs['id']?.includes('player') || attrs['id']?.includes('ep'))) {
            console.log('Element:', el.tagName, attrs);
        }
    });

    // Test search on anichi.to
    const searchUrl = 'https://anichi.to/ajax/anime/search?keyword=chainsmoker';
    console.log(`\nGET ${searchUrl}...`);
    const searchResp = await axios.get(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
        }
    }).catch(e => e.response);
    console.log('Search response status:', searchResp?.status);
    console.log('Search data snippet:', typeof searchResp?.data === 'string' ? searchResp.data.slice(0, 300) : JSON.stringify(searchResp?.data).slice(0, 300));
}

testAnichiHtml();
