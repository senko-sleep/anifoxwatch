import { SourceManager } from '../server/src/services/source-manager.js';

async function main() {
    const sm = new SourceManager();
    console.log('--- TESTING ANIME (Yomi/Aniwaves) ---');
    try {
        const res1 = await sm.getStreamingLinks('anilist-21?ep=1', undefined, 'sub', 1);
        console.log('Anilist-21 sub result:', res1.source, res1.sources?.length, 'sources');
    } catch (e: any) {
        console.error('Anilist-21 failed:', e.message);
    }

    try {
        const res2 = await sm.getStreamingLinks('aniwaves-82570&eps=1', undefined, 'sub', 1);
        console.log('Aniwaves-82570 sub result:', res2.source, res2.sources?.length, 'sources');
    } catch (e: any) {
        console.error('Aniwaves-82570 failed:', e.message);
    }

    console.log('\n--- TESTING HENTAI (WatchHentai/Hanime) ---');
    try {
        const res3 = await sm.getStreamingLinks('watchhentai-shoujo-ramune-episode-1', undefined, 'sub', 1);
        console.log('WatchHentai result:', res3.source, res3.sources?.length, 'sources');
    } catch (e: any) {
        console.error('WatchHentai failed:', e.message);
    }

    try {
        const res4 = await sm.getStreamingLinks('hanime-overflow-episode-1', undefined, 'sub', 1);
        console.log('Hanime result:', res4.source, res4.sources?.length, 'sources');
    } catch (e: any) {
        console.error('Hanime failed:', e.message);
    }

    process.exit(0);
}

main();
