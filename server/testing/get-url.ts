import axios from 'axios';

// Test directly without truncated console output
(async () => {
    const searchRes = await axios.post('https://search.htv-services.com', {
        search_text: 'overflow',
        tags: [],
        tags_mode: 'AND',
        brands: [],
        blacklist: [],
        order_by: 'created_at_unix',
        ordering: 'desc',
        page: 0
    });

    let hits = searchRes.data.hits;
    if (typeof hits === 'string') hits = JSON.parse(hits);

    const slug = hits[0].slug;
    const videoRes = await axios.get(`https://hanime.tv/api/v8/video?id=${slug}`);
    const manifest = videoRes.data.videos_manifest;
    const firstStream = manifest?.servers?.[0]?.streams?.[0];

    if (firstStream) {
        console.log('STREAM_URL=' + firstStream.url);
    }
})();
