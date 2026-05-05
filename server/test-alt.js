import { ANIME } from '@consumet/extensions';

const provider = new ANIME.AnimeKai();

async function testAlternative() {
    // Try different episode ID formats
    const ids = [
        'one-piece-dk6r',
        'one-piece-dk6r?ep=1',
        'one-piece-dk6r$ep=1',
    ];
    
    const { SubOrSub } = await import('@consumet/extensions');
    
    for (const id of ids) {
        console.log(`\n=== Testing ID: ${id} ===`);
        try {
            const servers = await provider.fetchEpisodeServers(id, SubOrSub.DUB);
            console.log('DUB servers:', servers.length);
            servers.slice(0, 2).forEach((sv, i) => {
                console.log(`  ${i+1}. ${sv.name}: ${sv.url?.substring(0, 60)}`);
            });
        } catch (err) {
            console.log('Error:', err.message);
        }
    }
    
    // Also try fetching anime info
    console.log('\n=== Fetch Anime Info ===');
    try {
        const info = await provider.fetchAnimeInfo('one-piece-dk6r');
        console.log('Title:', info.title);
        console.log('Has Dub:', info.hasDub);
        console.log('Episodes:', info.episodes?.length);
        console.log('First episode:', JSON.stringify(info.episodes?.[0], null, 2)?.substring(0, 200));
    } catch (err) {
        console.log('Error:', err.message);
    }
}

testAlternative();
