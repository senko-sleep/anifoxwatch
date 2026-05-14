import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function testEpisodesQuery() {
    const src = new AllAnimeSource();
    const showId = "SyR2K6bGYfKSE6YMm"; // Re:Zero Season 4
    
    console.log('Testing AllAnime episodes query...');
    
    try {
        const query = `{episodes(showId:"${showId}",translationType:sub,episodeNumStart:1,episodeNumEnd:1){episodeString,sourceUrls}}`;
        const data = await (src as any).gqlQuery(query);
        console.log('Success! Data:', JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.log('Failed for episodes:', e.message);
    }
}

testEpisodesQuery();
