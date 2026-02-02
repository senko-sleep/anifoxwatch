
import { WatchHentaiSource } from '../src/sources/watchhentai-source';
import axios from 'axios';

async function verifyStream() {
    console.log('--- Starting Stream Verification ---');
    const source = new WatchHentaiSource();

    try {
        console.log('1. Fetching latest anime...');
        const latest = await source.getLatest();
        if (latest.length === 0) {
            console.error('FAILED: No anime found.');
            return;
        }

        const anime = latest[0];
        console.log(`   Found: ${anime.title} (${anime.id})`);

        console.log('2. Fetching episodes...');
        const episodes = await source.getEpisodes(anime.id);
        if (episodes.length === 0) {
            console.error('FAILED: No episodes found.');
            return;
        }

        const episode = episodes[0];
        console.log(`   Using Episode: ${episode.number} - ${episode.title} (${episode.id})`);

        console.log('3. Extracting stream links...');
        const streams = await source.getStreamingLinks(episode.id);

        if (streams.sources.length === 0) {
            console.error('FAILED: No stream sources found.');
            console.log('   Full response:', JSON.stringify(streams, null, 2));
            return;
        }

        console.log(`   Found ${streams.sources.length} sources.`);

        for (const s of streams.sources) {
            console.log(`\nTesting Source: ${s.url}`);

            // Basic validation check from my previous fix
            if (s.url.includes('&id=') && !s.url.includes('?')) {
                console.warn('   WARNING: URL might still be malformed (contains &id= without ?)');
            }

            // Simulate the Proxy Request Headers
            // Logic from streaming.ts
            const urlObj = new URL(s.url);
            const domain = urlObj.hostname;
            console.log(`   Domain: ${domain}`);

            let referer = 'https://hianimez.to/';
            let origin: string | undefined = undefined;

            if (domain.includes('hstorage') || domain.includes('xyz')) {
                referer = 'https://watchhentai.net/';
                origin = 'https://watchhentai.net';
            } else if (domain.includes('googlevideo')) {
                referer = 'https://watchhentai.net/';
                origin = 'https://watchhentai.net';
            }
            // ... add other cases if needed, but we are testing watchhentai specifically

            console.log(`   Using Referer: ${referer}`);
            console.log(`   Using Origin: ${origin}`);

            try {
                const start = Date.now();
                const response = await axios.get(s.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                        'Referer': referer,
                        'Origin': origin,
                        'Range': 'bytes=0-1024' // Request just the first KB
                    },
                    timeout: 10000,
                    validateStatus: () => true // Don't throw on error status
                });

                const duration = Date.now() - start;
                console.log(`   Response Status: ${response.status} ${response.statusText}`);
                console.log(`   Content-Type: ${response.headers['content-type']}`);
                console.log(`   Latency: ${duration}ms`);

                if (response.status >= 200 && response.status < 300) {
                    console.log('   RESULT: SUCCESS (Stream is accessible)');
                } else if (response.status === 403) {
                    console.log('   RESULT: FAILED (403 Forbidden - Likely bad Referer/Headers)');
                } else if (response.status === 404) {
                    console.log('   RESULT: FAILED (404 Not Found - Likely bad URL)');
                } else {
                    console.log(`   RESULT: FAILED (${response.status})`);
                }

            } catch (err: any) {
                console.error(`   Error fetching stream: ${err.message}`);
            }
        }

    } catch (e: any) {
        console.error('Test failed with error:', e.message);
        console.error(e.stack);
    }
}

verifyStream();
