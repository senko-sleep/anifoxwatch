import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function exploreShowQuery() {
    const src = new AllAnimeSource();
    const showId = "SyR2K6bGYfKSE6YMm"; // Re:Zero Season 4
    
    console.log('Exploring AllAnime show query fields...');
    
    try {
        // Try to get episodes through show query
        const query = `{show(_id:"${showId}"){_id,name,episodes{sub{episodeString,sourceUrls},dub{episodeString,sourceUrls}}}}`;
        const data = await (src as any).gqlQuery(query);
        console.log('Success! Data:', JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.log('Failed for show.episodes:', e.message);
        
        try {
            // Try another variation
            const query2 = `{show(_id:"${showId}"){_id,name,availableEpisodesDetail}}`;
            const data2 = await (src as any).gqlQuery(query2);
            console.log('Success for show.availableEpisodesDetail:', JSON.stringify(data2, null, 2));
        } catch (e2: any) {
            console.log('Failed for show.availableEpisodesDetail:', e2.message);
        }
    }
}

exploreShowQuery();
