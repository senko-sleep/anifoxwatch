import { AnimeKaiSource } from './server/src/sources/animekai-source.js';

async function test() {
    const source = new AnimeKaiSource();
    const episodeId = 'baka-to-test-to-shoukanjuu-q5nq$ep=4$token=dummy'; // Approximate ID
    // Actually let's use the search result ID and let it resolve
    const stream = await source.getStreamingLinks('animekai-baka-to-test-to-shoukanjuu-q5nq', undefined, 'sub', { episodeNum: 4 });
    console.log('Streaming Data:', JSON.stringify(stream, null, 2));
}

test().catch(console.error);
