import { AnimeKaiSource } from './server/src/sources/animekai-source.js';

async function main() {
    const source = new AnimeKaiSource();
    const eps = await source.getEpisodes('animekai-baka-to-test-to-shoukanjuu-q5nq');
    const ep4 = eps.find(e => e.number === 4);
    if (!ep4) return;
    
    console.log('Fetching stream links for:', ep4.id);
    const stream = await source.getStreamingLinks(ep4.id, undefined, 'dub');
    console.log(JSON.stringify(stream, null, 2));
}
main();
