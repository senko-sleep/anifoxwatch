import { SourceManager } from './server/src/services/source-manager.js';
import { AnimeKaiSource } from './server/src/sources/animekai-source.js';

async function main() {
    const manager = new SourceManager();
    console.log('Resolving AniList 189046 to streaming ID...');
    const startTime = Date.now();
    try {
        const streamId = await manager.resolveAniListToStreamingId(189046);
        console.log(`Resolved in ${Date.now() - startTime}ms to: ${streamId}`);

        if (streamId) {
            console.log('Fetching episode 2 for', streamId);
            const eps = await manager.getEpisodes(streamId);
            const ep2 = eps.find(e => e.number === 2);
            if (ep2) {
                console.log(`Found Ep 2: ${ep2.id}`);
                console.log('Testing sub...');
                const sub = await manager.getStreamingLinks(ep2.id, undefined, 'sub');
                console.log('Sub success:', !!sub?.sources?.length);
                
                console.log('Testing dub...');
                const dub = await manager.getStreamingLinks(ep2.id, undefined, 'dub');
                console.log('Dub success:', !!dub?.sources?.length);
            } else {
                console.log('Episode 2 not found');
            }
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
main();
