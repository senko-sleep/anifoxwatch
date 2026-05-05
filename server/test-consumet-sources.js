import { ANIME } from '@consumet/extensions';

const provider = new ANIME.AnimeKai();

async function test() {
    const { SubOrSub } = await import('@consumet/extensions');
    
    // Test fetchEpisodeSources for both sub and dub
    const epId = 'baka-to-test-to-shoukanjuu-q5nq$ep=1$token=cMv886fx5hKgjQ';
    
    console.log('Testing consumet fetchEpisodeSources...');
    console.log('Episode ID:', epId);
    
    // SUB
    console.log('\n=== SUB ===');
    try {
        const subSources = await provider.fetchEpisodeSources(epId, SubOrSub.SUB);
        console.log('Sources:', JSON.stringify(subSources, null, 2));
    } catch (err) {
        console.log('Error:', err.message);
    }
    
    // DUB
    console.log('\n=== DUB ===');
    try {
        const dubSources = await provider.fetchEpisodeSources(epId, SubOrSub.DUB);
        console.log('Sources:', JSON.stringify(dubSources, null, 2));
    } catch (err) {
        console.log('Error:', err.message);
    }
}

test();
