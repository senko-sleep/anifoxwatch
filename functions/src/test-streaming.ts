import { AnimeKaiSource } from './src/sources/animekai-source.js';

process.env.LOG_LEVEL = 'DEBUG';

async function testStreaming() {
    console.log('🚀 AnimeKai smoke test\n');
    const source = new AnimeKaiSource();
    const search = await source.search('naruto', 1);
    if (!search.results.length) {
        console.error('❌ no results');
        return;
    }
    const first = search.results[0];
    const eps = await source.getEpisodes(first.id);
    console.log(`✅ ${first.title}: ${eps.length} episodes`);
    if (eps[0]) {
        const s = await source.getStreamingLinks(eps[0].id, undefined, 'sub');
        console.log(`✅ streams: ${s.sources.length}`);
    }
}

void testStreaming();
