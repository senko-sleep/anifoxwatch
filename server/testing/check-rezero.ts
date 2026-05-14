import axios from 'axios';

async function test() {
    const id = 'anilist-189046'; // Re:ZERO Season 4?
    const baseUrl = 'http://localhost:3001/api';
    
    console.log(`--- Testing Sub and Dub for ${id} ---`);
    try {
        // 1. Get Episodes
        const epResp = await axios.get(`${baseUrl}/anime/episodes?id=${id}`);
        const episodes = epResp.data.episodes || [];
        console.log(`Total Episodes: ${episodes.length}`);
        
        for (const ep of episodes) {
            console.log(`\n--- Testing Episode ${ep.number} (${ep.id}) ---`);
            console.log(`  Sub Available: ${ep.hasSub}, Dub Available: ${ep.hasDub}`);
            
            // Test SUB
            try {
                const subResp = await axios.get(`${baseUrl}/stream/watch/${ep.id}?id=${id}&category=sub`);
                console.log(`  SUB: ${subResp.data.sources?.length || 0} sources found`);
            } catch (e: any) { console.log(`  SUB Error: ${e.message}`); }
            
            // Test DUB
            try {
                const dubResp = await axios.get(`${baseUrl}/stream/watch/${ep.id}?id=${id}&category=dub`);
                console.log(`  DUB: ${dubResp.data.sources?.length || 0} sources found`);
            } catch (e: any) { console.log(`  DUB Error: ${e.message}`); }
        }
    } catch (err: any) {
        console.error(`Error: ${err.message}`);
    }
}

test();
