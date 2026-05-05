import { ANIME } from '@consumet/extensions';

const provider = new ANIME.AnimeKai();

async function testConsumet() {
    const epId = 'one-piece-dk6r$ep=1$token=coDh9_Ly6U1W8Visvd';
    
    console.log('Testing consumet AnimeKai provider...');
    console.log('Episode ID:', epId);
    
    // Try different subOrDub values
    const { SubOrSub } = await import('@consumet/extensions');
    
    console.log('\nSubOrSub values:', { SUB: SubOrSub.SUB, DUB: SubOrSub.DUB });
    
    // Test fetchEpisodeServers with SUB
    console.log('\n=== fetchEpisodeServers (SUB) ===');
    try {
        const subServers = await provider.fetchEpisodeServers(epId, SubOrSub.SUB);
        console.log('SUB servers found:', subServers.length);
        subServers.slice(0, 3).forEach((sv, i) => {
            console.log(`  ${i+1}. ${sv.name}: ${sv.url?.substring(0, 80)}`);
        });
    } catch (err) {
        console.log('Error:', err.message);
    }
    
    // Test fetchEpisodeServers with DUB
    console.log('\n=== fetchEpisodeServers (DUB) ===');
    try {
        const dubServers = await provider.fetchEpisodeServers(epId, SubOrSub.DUB);
        console.log('DUB servers found:', dubServers.length);
        dubServers.slice(0, 3).forEach((sv, i) => {
            console.log(`  ${i+1}. ${sv.name}: ${sv.url?.substring(0, 80)}`);
        });
    } catch (err) {
        console.log('Error:', err.message);
    }
    
    // Test fetchEpisodeSources
    console.log('\n=== fetchEpisodeSources (DUB) ===');
    try {
        const sources = await provider.fetchEpisodeSources(epId, SubOrSub.DUB);
        console.log('Sources:', JSON.stringify(sources, null, 2)?.substring(0, 500));
    } catch (err) {
        console.log('Error:', err.message);
    }
}

testConsumet();
