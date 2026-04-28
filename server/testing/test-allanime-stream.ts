import { AllAnimeSource } from '../src/sources/allanime-source.js';

async function main() {
    const s = new AllAnimeSource();
    const sr = await s.search('naruto');
    const first = sr.results[0];
    console.log('First result:', first.id, first.title);
    const eps = await s.getEpisodes(first.id);
    console.log('Episodes:', eps.length, 'First:', eps[0]?.id);
    if (eps.length > 0) {
        const stream = await s.getStreamingLinks(eps[0].id);
        console.log('Stream sources:', stream.sources.length);
        for (const src of stream.sources) {
            console.log('  -', src.url?.slice(0, 120), 'isM3U8:', src.isM3U8);
        }
        if (stream.sources.length === 0) {
            console.log('\n--- Debugging: trying GQL directly ---');
            // Manually test the GQL call
            const withoutPrefix = eps[0].id.replace(/^allanime-/, '');
            const lastDash = withoutPrefix.lastIndexOf('-');
            const showId = withoutPrefix.slice(0, lastDash);
            const epNum = withoutPrefix.slice(lastDash + 1);
            console.log('showId:', showId, 'epNum:', epNum);

            const axios = (await import('axios')).default;
            const query = `{episode(showId:"${showId}",translationType:sub,episodeString:"${epNum}"){sourceUrls}}`;
            console.log('GQL query:', query);
            const resp = await axios.post('https://api.allanime.day/api', { query }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Referer': 'https://allmanga.to/',
                    'Origin': 'https://allmanga.to',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
                },
                timeout: 15000,
            });
            const data = resp.data?.data;
            console.log('Raw response keys:', Object.keys(data || {}));
            if (data?.tobeparsed) {
                console.log('Has tobeparsed! Length:', data.tobeparsed.length);
                console.log('First 100 chars:', data.tobeparsed.slice(0, 100));
                console.log('_m:', data._m);
            }
            if (data?.episode) {
                console.log('Episode sourceUrls:', JSON.stringify(data.episode.sourceUrls?.slice(0, 3), null, 2));
            }
        }
    }
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
