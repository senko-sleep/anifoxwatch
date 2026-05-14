import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function testEpisodeQuery() {
    const src = new AllAnimeSource();
    const showId = "SyR2K6bGYfKSE6YMm"; // Re:Zero Season 4
    
    console.log('Testing AllAnime Episode Query formats...');
    
    const types = ['sub', 'dub', 'SUB', 'DUB'];
    
    for (const type of types) {
        console.log(`\n--- Testing translationType: ${type} ---`);
        try {
            const query = `{episode(showId:"${showId}",translationType:${type},episodeString:"1"){sourceUrls}}`;
            const data = await (src as any).gqlQuery(query);
            console.log(`Success for ${type}! Found ${data?.episode?.sourceUrls?.length || 0} URLs`);
            if (data?.episode?.sourceUrls?.length > 0) {
                console.log('First URL:', data.episode.sourceUrls[0].sourceUrl.substring(0, 50) + '...');
            }
        } catch (e: any) {
            console.log(`Failed for ${type}:`, e.message);
        }
    }
}

testEpisodeQuery();
