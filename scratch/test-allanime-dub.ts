import axios from 'axios';

async function testAllAnime() {
    try {
        const url = 'http://127.0.0.1:3001/api/stream/watch/rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0$ep=1$token=Ltfh8KXzuwau03VfhY-G?category=dub&ep_num=1&anilist_id=189046&server=AllAnime';
        console.log('Testing AllAnime DUB...');
        const resp = await axios.get(url, { timeout: 30000 });
        console.log(JSON.stringify(resp.data, null, 2));
    } catch (e: any) {
        console.log('Error:', e.response?.data || e.message);
    }
}

testAllAnime();
