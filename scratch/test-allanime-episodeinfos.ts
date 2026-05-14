import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function testEpisodeInfosQuery() {
    const src = new AllAnimeSource();
    const showId = "SyR2K6bGYfKSE6YMm"; // Re:Zero Season 4
    
    console.log('Testing AllAnime episodeInfos query...');
    
    try {
        const query = `{episodeInfos(showId:"${showId}",episodeNumStart:1,episodeNumEnd:1){vidInforssub,vidInforsdub}}`;
        const data = await (src as any).gqlQuery(query);
        console.log('Success! Data:', JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.log('Failed for episodeInfos:', e.message);
    }
}

testEpisodeInfosQuery();
