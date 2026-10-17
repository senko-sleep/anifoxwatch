import { YomiSource } from '../src/sources/yomi-source.js';

const yomi = new YomiSource();
console.log('Testing Yomi for anilist-210031...');
try {
    const res = await yomi.getStreamingLinks('anilist-210031', undefined, 'sub', { episodeNum: 1, anilistId: 210031 });
    console.log('Yomi result:', JSON.stringify(res, null, 2));
} catch (e: any) {
    console.error('Yomi error:', e.message);
}

console.log('Testing Yomi search for "You and I Are Polar Opposites"...');
try {
    const s = await yomi.search('You and I Are Polar Opposites', 1);
    console.log('Yomi search results:', JSON.stringify(s.results.map((r: any) => [r.id, r.title]), null, 2));
    if (s.results.length > 0) {
        const eps = await yomi.getEpisodes(s.results[0].id);
        console.log('Yomi eps:', JSON.stringify(eps.slice(0, 5), null, 2));
    }
} catch (e: any) {
    console.error('Yomi search error:', e.message);
}
