import { AllAnimeSource } from '../server/src/sources/allanime-source.js';

async function testFullFlow() {
    const src = new AllAnimeSource();
    
    console.log('Searching for Re:Zero Season 4...');
    const searchResults = await src.search('Re:Zero Season 4');
    if (!searchResults.results.length) {
        console.log('No results found');
        return;
    }
    
    const show = searchResults.results[0];
    const showId = show.id;
    console.log(`Found show: ${show.title} (ID: ${showId})`);
    
    console.log('\nFetching episodes...');
    const episodes = await src.getEpisodes(showId);
    console.log(`Found ${episodes.length} episodes`);
    if (!episodes.length) return;
    
    const ep = episodes[0];
    console.log(`\nFetching streaming links for episode ${ep.number} (ID: ${ep.id})...`);
    
    // Call getStreamingLinks directly
    try {
        const streamData = await src.getStreamingLinks(ep.id, undefined, 'sub');
        console.log('Stream Data:', JSON.stringify(streamData, null, 2));
    } catch (e: any) {
        console.log('Error in getStreamingLinks:', e.message);
    }
}

testFullFlow();
