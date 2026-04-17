import type { } from 'node';

async function main() {
    // Test 1: Search gogoanime for Spy x Family
    console.log('--- Testing Consumet Gogoanime ---');
    const r = await fetch('https://api.consumet.org/anime/gogoanime/spy-x-family');
    const d = await r.json() as { results?: Array<{ id: string; title: any }> };
    const results = d.results?.slice(0, 3).map(x => ({ id: x.id, title: x.title?.english || x.title }));
    console.log('SEARCH RESULTS:', JSON.stringify(results, null, 2));

    if (d.results?.[0]) {
        const topId = d.results[0].id;
        console.log('\n--- Fetching episodes for:', topId, '---');
        const epR = await fetch(`https://api.consumet.org/anime/gogoanime/info/${encodeURIComponent(topId)}`);
        const epD = await epR.json() as { episodes?: Array<{ id: string; number: number }> };
        const eps = epD.episodes?.slice(0, 5).map(e => ({ id: e.id, number: e.number }));
        console.log('EPISODES:', JSON.stringify(eps, null, 2));

        if (epD.episodes?.[0]) {
            const epId = epD.episodes[0].id;
            console.log('\n--- Fetching stream for episode:', epId, '---');
            const stR = await fetch(`https://api.consumet.org/anime/gogoanime/watch/${encodeURIComponent(epId)}`);
            const stD = await stR.json() as { sources?: Array<{ url: string; quality: string; isM3U8: boolean }> };
            console.log('STREAM SOURCES:', JSON.stringify(stD.sources?.slice(0, 3), null, 2));
        }
    }
}

main().catch(console.error);
