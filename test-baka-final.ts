import { SourceManager } from './server/src/services/source-manager.js';
import { AnimeKaiSource } from './server/src/sources/animekai-source.js';

async function main() {
    console.log('--- TEST RESULTS ---');
    console.log('1. Checking resolution of AniList ID 6347 (Baka to Test to Shoukanjuu)...');
    
    const manager = new SourceManager();
    const resolvedId = await manager.resolveAniListToStreamingId(6347);
    console.log(`Resolved ID: ${resolvedId}`);
    
    if (resolvedId !== 'animekai-baka-to-test-to-shoukanjuu-q5nq') {
        console.error('ERROR: Still resolving to wrong anime!');
        return;
    }
    console.log('SUCCESS: Resolved to correct main series anime ID.');
    
    console.log('\n2. Fetching episodes for the resolved anime...');
    const source = new AnimeKaiSource();
    const eps = await source.getEpisodes(resolvedId);
    
    console.log(`Total episodes found: ${eps.length}`);
    if (eps.length === 13) {
        console.log('SUCCESS: Main anime has 13 episodes (Mini anime has completely different count).');
    }
    
    const ep4 = eps.find(e => e.number === 4);
    if (ep4) {
        console.log(`\n3. Verifying Episode 4 metadata:`);
        console.log(`Title: "${ep4.title}"`);
        console.log(`Has Dub? ${ep4.hasDub ? 'Yes' : 'No'}`);
        
        console.log('\n4. Fetching actual streaming links for Episode 4 (DUB)...');
        try {
            const streams = await source.getStreamingLinks(ep4.id, undefined, 'dub');
            if (streams && streams.sources && streams.sources.length > 0) {
                console.log(`SUCCESS: Fetched ${streams.sources.length} DUB stream sources!`);
                console.log(`Stream Quality: ${streams.sources[0].quality}`);
                console.log(`Is M3U8? ${streams.sources[0].isM3U8}`);
            } else {
                console.log('FAILED to fetch dub streams.');
            }
        } catch (e) {
            console.error('Error fetching stream:', e);
        }
    }
    console.log('--------------------');
}

main().catch(console.error);
