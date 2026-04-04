
import { AnimeKaiSource } from './src/sources/animekai-source.js';

process.env.LOG_LEVEL = 'DEBUG';

async function testStreaming() {
    console.log('🚀 AnimeKai source smoke test\n');

    const source = new AnimeKaiSource();

    try {
        const search = await source.search('naruto', 1);
        if (!search.results.length) {
            console.error('❌ No search results');
            return;
        }
        const first = search.results[0];
        console.log(`✅ Search: ${first.title} (${first.id})`);

        const episodes = await source.getEpisodes(first.id);
        if (!episodes.length) {
            console.error('❌ No episodes');
            return;
        }
        console.log(`✅ Episodes: ${episodes.length}`);

        const streamData = await source.getStreamingLinks(episodes[0].id, undefined, 'sub');
        console.log(`✅ Stream sources: ${streamData.sources.length}`);
        if (streamData.sources[0]) {
            console.log(`   ${streamData.sources[0].url.slice(0, 80)}...`);
        }
    } catch (e) {
        console.error('❌', e);
    }
}

void testStreaming();
