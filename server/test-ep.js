import { ANIME } from '@consumet/extensions';

const provider = new ANIME.AnimeKai();

async function testEpisode() {
    const { SubOrSub } = await import('@consumet/extensions');
    
    // Get episode info first
    console.log('Fetching anime info...');
    const info = await provider.fetchAnimeInfo('one-piece-dk6r');
    
    // Find the first dubbed episode
    const dubEp = info.episodes?.find(e => e.isDubbed);
    console.log('\nFirst dubbed episode:', dubEp);
    
    if (dubEp) {
        console.log('\n=== Testing with dubbed episode ID ===');
        console.log('Episode ID:', dubEp.id);
        
        try {
            const subServers = await provider.fetchEpisodeServers(dubEp.id, SubOrSub.SUB);
            console.log('SUB servers:', subServers.length);
            subServers.slice(0, 2).forEach((sv, i) => console.log(`  ${i+1}. ${sv.name}: ${sv.url?.substring(0, 60)}`));
        } catch (err) {
            console.log('SUB Error:', err.message);
        }
        
        try {
            const dubServers = await provider.fetchEpisodeServers(dubEp.id, SubOrSub.DUB);
            console.log('\nDUB servers:', dubServers.length);
            dubServers.slice(0, 2).forEach((sv, i) => console.log(`  ${i+1}. ${sv.name}: ${sv.url?.substring(0, 60)}`));
        } catch (err) {
            console.log('DUB Error:', err.message);
        }
        
        // Try fetchEpisodeSources
        console.log('\n=== fetchEpisodeSources ===');
        try {
            const subSources = await provider.fetchEpisodeSources(dubEp.id, SubOrSub.SUB);
            console.log('SUB sources:', JSON.stringify(subSources, null, 2)?.substring(0, 300));
        } catch (err) {
            console.log('SUB Sources Error:', err.message);
        }
        
        try {
            const dubSources = await provider.fetchEpisodeSources(dubEp.id, SubOrSub.DUB);
            console.log('\nDUB sources:', JSON.stringify(dubSources, null, 2)?.substring(0, 300));
        } catch (err) {
            console.log('DUB Sources Error:', err.message);
        }
    }
}

testEpisode();
