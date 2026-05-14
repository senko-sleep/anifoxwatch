import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function run() {
    const src = new AllAnimeSource();
    
    const epId = 'rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0$ep=1$token=Ltfh8KXzuwau03VfhY-G';
    const rawEpisodeId = epId.split('$ep=')[0].replace(/^allanime-/i, '');
    
    console.log(`Testing AllAnime DUB for slug: ${rawEpisodeId}`);
    try {
        const streamData = await src.getStreamingLinks(
            rawEpisodeId,
            undefined, // server
            'dub',
            { episodeNum: 1 } // options
        );
        console.log(JSON.stringify(streamData, null, 2));
    } catch (e: any) {
        console.log('Error:', e.message);
    }
}

run();
