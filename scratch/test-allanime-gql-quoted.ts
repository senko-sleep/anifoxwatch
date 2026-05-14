import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function testEpisodeQuery() {
    const src = new AllAnimeSource();
    const showId = "SyR2K6bGYfKSE6YMm"; // Re:Zero Season 4
    
    console.log('Testing AllAnime Episode Query with string translationType...');
    
    try {
        // Test with quotes around sub
        const query = `{episode(showId:"${showId}",translationType:"sub",episodeString:"1"){sourceUrls}}`;
        const data = await (src as any).gqlQuery(query);
        console.log(`Success for quoted "sub"! Found ${data?.episode?.sourceUrls?.length || 0} URLs`);
    } catch (e: any) {
        console.log(`Failed for quoted "sub":`, e.message);
    }
}

testEpisodeQuery();
