
import { sourceManager } from '../src/services/source-manager';

async function testServerOrder() {
    const episodeId = 'hianime-one-piece-100?ep=10065';
    console.log(`Checking server order for ${episodeId}...`);

    try {
        const servers = await sourceManager.getEpisodeServers(episodeId);
        console.log('Servers returned:', servers.map(s => s.name));

        if (servers.length > 0 && servers[0].name === 'hd-2') {
            console.log('SUCCESS: hd-2 is first');
        } else {
            console.log('FAILURE: hd-2 is NOT first');
        }
    } catch (e) {
        console.error(e);
    }
}

testServerOrder();
