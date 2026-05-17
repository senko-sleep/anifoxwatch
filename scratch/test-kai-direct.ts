import { ANIME } from '@consumet/extensions';

async function testAnimeKai() {
    const kai = new ANIME.AnimeKai();
    const id = 'baka-to-test-to-shoukanjuu-q5nq';
    
    console.log(`Fetching info for ${id}...`);
    try {
        const info = await kai.fetchAnimeInfo(id);
        console.log(`Episodes: ${info.episodes?.length}`);
        
        const ep5 = info.episodes?.find((e: any) => e.number === 5);
        if (ep5) {
            console.log(`Found Ep 5: ${ep5.id}`);
            console.log(`Fetching servers for ${ep5.id}...`);
            const servers = await kai.fetchEpisodeServers(ep5.id);
            console.log(`Servers Found: ${servers.length}`);
            console.log(JSON.stringify(servers, null, 2));
        } else {
            console.log(`Ep 5 not found in info`);
        }
    } catch (e) {
        console.error(e);
    }
}

testAnimeKai().catch(console.error);
