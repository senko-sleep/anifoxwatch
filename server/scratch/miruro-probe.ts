import { MiruroSource } from '../src/sources/miruro-source.js';

const miruro = new MiruroSource();
console.log('Testing Miruro for miruro-seihantai-na-kimi-to-boku-2nd-season-episode-1...');
try {
    const res = await miruro.getStreamingLinks('miruro-seihantai-na-kimi-to-boku-2nd-season-episode-1', undefined, 'sub', { episodeNum: 1, anilistId: 210031 });
    console.log('Miruro result:', JSON.stringify(res, null, 2));
} catch (e: any) {
    console.error('Miruro error:', e.message, e.stack);
}
