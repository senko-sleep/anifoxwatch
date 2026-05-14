import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

async function test() {
    const animeId = 'anilist-189046';
    
    console.log(`--- Testing Episodes for ${animeId} ---`);
    const epResp = await axios.get(`${API_BASE}/anime/episodes?id=${animeId}`);
    console.log(`Episodes found: ${epResp.data.episodes?.length || 0}`);
    
    if (epResp.data.episodes && epResp.data.episodes.length > 0) {
        const ep = epResp.data.episodes[0];
        console.log(`First Ep: ${ep.number} (${ep.id}) - Sub: ${ep.hasSub}, Dub: ${ep.hasDub}`);
        
        console.log(`\n--- Testing Streaming (SUB) for Ep ${ep.number} ---`);
        const subResp = await axios.get(`${API_BASE}/stream/watch/${ep.id}?id=${animeId}&category=sub`);
        console.log(`SUB: ${subResp.data.sources?.length || 0} sources. Fallback: ${subResp.data.dubFallback}. Source: ${subResp.data.source}`);
        
        console.log(`\n--- Testing Streaming (DUB) for Ep ${ep.number} ---`);
        const dubResp = await axios.get(`${API_BASE}/stream/watch/${ep.id}?id=${animeId}&category=dub`);
        console.log(`DUB: ${dubResp.data.sources?.length || 0} sources. Fallback: ${dubResp.data.dubFallback}. Source: ${dubResp.data.source}`);
    }
}

test();
