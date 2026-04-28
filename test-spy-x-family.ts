import { SourceManager } from './server/src/services/source-manager.js';

async function testSpyXFamily() {
    console.log('Testing Spy x Family Season 3 with SourceManager...');

    const sourceManager = new SourceManager();

    try {
        console.log('Searching for Spy x Family Season 3...');

        // Test search with different sources
        const sourcesToTry = ['Gogoanime', 'AnimeKai', 'AllAnime'];

        for (const sourceName of sourcesToTry) {
            try {
                console.log(`\nTrying source: ${sourceName}`);
                const searchResult = await sourceManager.search('spy x family season 3', 1, sourceName);
                console.log(`  Results: ${searchResult.results.length}`);

                if (searchResult.results.length > 0) {
                    const anime = searchResult.results[0];
                    console.log(`  Found: ${anime.title} (ID: ${anime.id})`);

                    // Try to get episodes
                    const episodes = await sourceManager.getEpisodes(anime.id);
                    console.log(`  Episodes: ${episodes.length}`);

                    if (episodes.length > 0) {
                        const episode = episodes[0];
                        console.log(`  First episode: ${episode.title} (ID: ${episode.id})`);

                        // Try streaming
                        try {
                            const streamingData = await sourceManager.getStreamingLinks(episode.id, 'sub', 'sub');
                            console.log(`  Streaming sources: ${streamingData.sources.length}`);
                            if (streamingData.sources.length > 0) {
                                console.log(`  First source: ${streamingData.sources[0].url.substring(0, 60)}...`);
                                console.log('  ✅ SUCCESS: Streaming works!');
                                return; // Success, exit
                            }
                        } catch (streamError: any) {
                            console.log(`  Streaming failed: ${streamError.message}`);
                        }
                    }
                }
            } catch (error: any) {
                console.log(`  Source ${sourceName} failed: ${error.message}`);
            }
        }

        console.log('\n❌ No working streaming found for Spy x Family Season 3');

    } catch (error: any) {
        console.error('Test failed:', error.message);
    }
}

testSpyXFamily();