import { SourceManager } from './server/src/services/source-manager.js';
import { GogoanimeSource } from './server/src/sources/gogoanime-source.js';
import { NineAnimeSource } from './server/src/sources/nineanime-source.js';

async function main() {
    console.log('Testing Gogoanime for Baka to Test...');
    const gogo = new GogoanimeSource();
    const gogoRes = await gogo.search('Baka to Test to Shoukanjuu');
    console.log(`Gogoanime search found ${gogoRes.results?.length || 0} results`);
    const gogoMatch = gogoRes.results?.find(r => r.title.toLowerCase().includes('baka to test to shoukanjuu') && !r.title.toLowerCase().includes('mini') && r.id.includes('dub'));
    if (gogoMatch) {
        console.log(`Found Gogoanime Dub ID: ${gogoMatch.id}`);
        const eps = await gogo.getEpisodes(gogoMatch.id);
        const ep4 = eps.find(e => e.number === 4);
        if (ep4) {
            console.log(`Found Ep 4: ${ep4.id}`);
            try {
                const stream = await gogo.getStreamingLinks(ep4.id, undefined, 'dub');
                console.log(`Gogo stream sources: ${stream.sources.length}`);
                if (stream.sources.length > 0) {
                    console.log('URL:', stream.sources[0].url);
                }
            } catch (e) {
                console.error('Gogo stream error:', e);
            }
        }
    } else {
        console.log('No Gogoanime match found for dub');
    }

    console.log('\nTesting 9Anime for Baka to Test...');
    const nine = new NineAnimeSource();
    const nineRes = await nine.search('Baka to Test to Shoukanjuu');
    console.log(`9Anime search found ${nineRes.results?.length || 0} results`);
    const nineMatch = nineRes.results?.find(r => r.title.toLowerCase().includes('baka to test to shoukanjuu') && !r.title.toLowerCase().includes('mini'));
    if (nineMatch) {
        console.log(`Found 9Anime ID: ${nineMatch.id}`);
        const eps = await nine.getEpisodes(nineMatch.id);
        const ep4 = eps.find(e => e.number === 4);
        if (ep4) {
            console.log(`Found Ep 4: ${ep4.id}`);
            try {
                const stream = await nine.getStreamingLinks(ep4.id, undefined, 'dub');
                console.log(`9Anime stream sources: ${stream.sources?.length || 0}`);
                if (stream.sources && stream.sources.length > 0) {
                    console.log('URL:', stream.sources[0].url);
                }
            } catch (e) {
                console.error('9Anime stream error:', e);
            }
        }
    }
}

main().catch(console.error);
