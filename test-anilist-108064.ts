import { AkiHSource } from './server/src/sources/akih-source';

async function testAnilist108064() {
    console.log('Testing Aki-H scraping for "JimiHen—!! ~Jimiko o Kaechau Jun Isei Kōyū!!~"...');
    const source = new AkiHSource();

    try {
        const query = 'Jimihen!!';
        console.log(`\n1. Searching on Aki-H for "${query}"...`);
        const searchResults = await source.search(query);
        console.log(`Search returned ${searchResults.results.length} results.`);
        
        if (searchResults.results.length === 0) {
            console.log('No results found for this query.');
            return;
        }

        const firstResult = searchResults.results[0];
        console.log(`\n2. Selected first result: ${firstResult.title} (ID: ${firstResult.id})`);
        
        console.log('\n3. Fetching episodes...');
        const episodes = await source.getEpisodes(firstResult.id);
        console.log(`Found ${episodes.length} episodes.`);

        if (episodes.length === 0) {
            console.log('No episodes found.');
            return;
        }

        const firstEpisode = episodes[0];
        console.log(`\n4. Extracting stream for episode 1 (ID: ${firstEpisode.id})...`);
        const streams = await source.getStreamingLinks(firstEpisode.id);
        
        console.log(`\nFound ${streams.sources.length} sources:`);
        streams.sources.forEach((s, i) => {
            console.log(`  Source ${i + 1}: ${s.quality} - ${s.url} (isM3U8: ${s.isM3U8})`);
        });

    } catch (error) {
        console.error('Error occurred:', error);
    }
}

testAnilist108064().catch(console.error);
