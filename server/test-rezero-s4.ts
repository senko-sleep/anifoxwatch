import { sourceManager } from './src/services/source-manager.js';
async function main() {
    console.log('--- findStreamingAnimeByTitle: Re:ZERO Season 4 ---');
    const r = await (sourceManager as any).findStreamingAnimeByTitle('Re:ZERO -Starting Life in Another World- Season 4', 'TV');
    console.log('Result:', r?.id, r?.title);

    console.log('\n--- getEpisodes: anilist-189046 ---');
    const eps = await sourceManager.getEpisodes('anilist-189046');
    console.log('Episodes:', eps.length, eps[0]?.id?.slice(0, 50));
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
