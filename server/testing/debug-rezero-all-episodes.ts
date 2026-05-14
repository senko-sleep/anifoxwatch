import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

async function test() {
    const animeId = 'anilist-189046';
    
    console.log(`--- Testing ALL Episodes for ${animeId} ---`);
    const epResp = await axios.get(`${API_BASE}/anime/episodes?id=${animeId}`);
    const episodes = epResp.data.episodes || [];
    console.log(`Episodes found: ${episodes.length}`);
    
    for (const ep of episodes) {
        console.log(`Ep ${ep.number}: Sub=${ep.hasSub}, Dub=${ep.hasDub}, ID=${ep.id}`);
        
        // Test DUB stream for each
        try {
            const dubResp = await axios.get(`${API_BASE}/stream/watch/${ep.id}?id=${animeId}&category=dub`);
            const sources = dubResp.data.sources || [];
            console.log(`  DUB: ${sources.length} sources. Fallback: ${dubResp.data.dubFallback}. Source: ${dubResp.data.source}`);
            if (sources.length > 0) {
                console.log(`  URL: ${sources[0].url.substring(0, 100)}...`);
            }
        } catch (e: any) {
            console.log(`  DUB Error: ${e.message}`);
        }
    }
}

test();
