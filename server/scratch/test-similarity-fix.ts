import { sourceManager } from '../src/services/source-manager.js';

async function run() {
    console.log('--- TESTING DUB WATCH FROM A FRESH NODE PROCESS ---');
    const id = 'anilist-21';
    console.log(`Getting DUB stream for ${id}...`);
    try {
        const stream = await sourceManager.getStreamingLinks(id, undefined, 'dub', 1, 21);
        console.log(`\n✅ Success!`);
        console.log(`Source resolved: ${stream.source}`);
        console.log(`Audio Language: ${stream.category}`);
        console.log(`Stream URL:`, stream.sources[0]?.url);
        console.log(`Original URL:`, stream.sources[0]?.originalUrl);
    } catch (err) {
        console.error('❌ Failed:', err);
    }
}
run();
