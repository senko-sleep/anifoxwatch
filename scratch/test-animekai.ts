import { sourceManager } from '../server/src/services/source-manager.js';
import axios from 'axios';

async function test() {
    console.log("Testing AnimeKai source extraction...");
    try {
        const res = await sourceManager.getStreamingLinks('animekai-solo-leveling&eps=1', undefined, 'dub', 1, undefined);
        console.log("Sources:", JSON.stringify(res.sources, null, 2));
        
        if (res.sources && res.sources.length > 0) {
            const streamUrl = res.sources[0].url;
            console.log("Stream URL:", streamUrl);
            
            // Try fetching it
            console.log("\nFetching stream URL directly...");
            try {
                const resp = await axios.get(streamUrl, {
                    headers: { 'Referer': 'https://megaup.nl/' }
                });
                console.log(`Success! Status: ${resp.status}`);
            } catch (e: any) {
                console.log(`Failed! Status: ${e.response?.status} - ${e.message}`);
            }
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
test();
