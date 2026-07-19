import { SourceManager } from '../src/services/source-manager.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const sm = new SourceManager();
    console.log('Resolving AniList ID 207141...');
    try {
        const streamingId = await sm.resolveAniListToStreamingId(207141);
        console.log('Resolved streamingId:', streamingId);
        
        if (streamingId) {
            console.log('Getting episodes...');
            const episodes = await sm.getEpisodes(streamingId);
            console.log(`Episodes:`, episodes.map(e => ({ id: e.id, number: e.number, title: e.title })));
            
            if (episodes.length > 0) {
                const ep = episodes[0];
                console.log(`Getting streaming links for ep ${ep.number} (id: ${ep.id})...`);
                const streams = await sm.getStreamingLinks(ep.id, undefined, 'sub', ep.number, 207141);
                console.log('Streams response:', JSON.stringify(streams, null, 2));
            }
        } else {
            console.log('Could not resolve AniList ID 207141 to a streaming ID!');
        }
    } catch (e) {
        console.error('Error occurred:', e);
    }
}

run().catch(console.error);
