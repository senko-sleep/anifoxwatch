import { ANIME } from '@consumet/extensions';

async function run() {
    const p = new ANIME.AnimeKai();
    const epId = 'rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0$ep=1$token=Ltfh8KXzuwau03VfhY-G';
    
    // In animekai-source.ts:
    let rawEpisodeId = epId;
    const isWatchEpisodeId = /\?ep=/i.test(rawEpisodeId);
    const isConsumetEpisodeId = /\$ep=\d+/i.test(rawEpisodeId);
    if (isWatchEpisodeId && !isConsumetEpisodeId) {
        rawEpisodeId = rawEpisodeId.split('?ep=')[0];
    }
    
    console.log(`Raw ID: ${rawEpisodeId}`);
    
    try {
        console.log('Fetching servers for SUB...');
        const subServers = await p.fetchEpisodeServers(rawEpisodeId, 'sub' as any);
        console.log('SUB servers:');
        console.log(subServers);
    } catch (e: any) {
        console.error('SUB error:', e.message);
    }
    
    try {
        console.log('\nFetching servers for DUB...');
        const dubServers = await p.fetchEpisodeServers(rawEpisodeId, 'dub' as any);
        console.log('DUB servers:');
        console.log(dubServers);
    } catch (e: any) {
        console.error('DUB error:', e.message);
    }
}

run();
