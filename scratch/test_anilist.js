import { SourceManager } from '../server/src/services/source-manager.js';

async function test() {
    console.log('Testing SourceManager for anilist-189046?ep=11...');
    const sm = new SourceManager();
    try {
        const res = sm.getStreamingLinks ? await sm.getStreamingLinks('anilist-189046?ep=11', undefined, 'sub', 11, 189046) : null;
        console.log('RESULT:', JSON.stringify(res, null, 2));
    } catch (e) {
        console.error('ERROR:', e);
    }
}

test();
