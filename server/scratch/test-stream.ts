import { sourceManager } from '../src/services/source-manager.js';

async function run() {
    const id = 'aniwaves-80918&eps=5';
    console.log(`Getting stream for ${id}...`);
    const stream = await sourceManager.getStreamingLinks(id, undefined, 'dub');
    console.log(`Result:`, stream ? stream : 'null');
}
run();
