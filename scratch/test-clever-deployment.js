const axios = require('axios');

const API_BASE = 'https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io';

async function runTests() {
    console.log(`\n==================================================`);
    console.log(`Testing Clever Cloud API: ${API_BASE}`);
    console.log(`==================================================\n`);

    // 1. Health check
    try {
        console.log('[1] Checking /api/health...');
        const health = await axios.get(`${API_BASE}/api/health`, { timeout: 10000 });
        console.log('✅ Health status:', health.data);
    } catch (err) {
        console.log('❌ Health check failed:', err.response?.status || err.message, err.response?.data || '');
    }

    // 2. Sources list and health
    try {
        console.log('\n[2] Checking registered sources at /api/sources...');
        const sources = await axios.get(`${API_BASE}/api/sources`, { timeout: 10000 });
        console.log('✅ Sources:', sources.data);

        console.log('\n[2b] Checking sources health at /api/sources/health...');
        const sourcesHealth = await axios.get(`${API_BASE}/api/sources/health`, { timeout: 10000 });
        console.log('✅ Sources Health:', sourcesHealth.data);
    } catch (err) {
        console.log('❌ Sources check failed:', err.response?.status || err.message);
    }

    // 3. Test regular anime resolution and streaming (using a known aired anime e.g., Frieren id = anilist-154587)
    const frierenId = 'anilist-154587';
    try {
        console.log(`\n[3] Fetching episodes for Frieren (${frierenId})...`);
        const episodesResp = await axios.get(`${API_BASE}/api/anime/episodes`, { 
            params: { id: frierenId },
            timeout: 15000 
        });
        const episodes = episodesResp.data.episodes || [];
        console.log(`✅ Found ${episodes.length} episodes`);
        if (episodes.length > 0) {
            const firstEp = episodes[0];
            console.log(`   First Episode ID: ${firstEp.id}, Title: ${firstEp.title}, Number: ${firstEp.number}`);
            
            console.log(`\n[3b] Fetching streaming links for Frieren Ep 1...`);
            const streamResp = await axios.get(`${API_BASE}/api/stream/watch/${encodeURIComponent(firstEp.id)}`, {
                params: { category: 'sub', ep_num: firstEp.number },
                timeout: 30000
            });
            console.log('✅ Streaming data resolved successfully!');
            console.log('   Provider:', streamResp.data.source);
            console.log('   Number of sources:', streamResp.data.sources?.length);
            if (streamResp.data.sources?.length > 0) {
                console.log('   First source URL snippet:', streamResp.data.sources[0].url.slice(0, 150) + '...');
            }
        }
    } catch (err) {
        console.log('❌ Frieren test failed:', err.response?.status || err.message, err.response?.data || '');
    }

    // 4. Test adult/hentai search and streaming (e.g. searching for "yuri" or "hentai")
    try {
        console.log(`\n[4] Searching for adult content in 'adult' mode...`);
        const searchResp = await axios.get(`${API_BASE}/api/anime/search`, {
            params: { q: 'yuri', mode: 'adult' },
            timeout: 15000
        });
        const results = searchResp.data.results || [];
        console.log(`✅ Found ${results.length} adult results`);
        if (results.length > 0) {
            const firstAdult = results[0];
            console.log(`   First Result: ${firstAdult.title} (ID: ${firstAdult.id}, Source: ${firstAdult.source})`);

            console.log(`\n[4b] Fetching episodes for ${firstAdult.title}...`);
            const adultEpsResp = await axios.get(`${API_BASE}/api/anime/episodes`, {
                params: { id: firstAdult.id },
                timeout: 15000
            });
            const adultEps = adultEpsResp.data.episodes || [];
            console.log(`✅ Found ${adultEps.length} episodes`);
            if (adultEps.length > 0) {
                const firstAdultEp = adultEps[0];
                console.log(`   First Ep ID: ${firstAdultEp.id}`);
                
                console.log(`\n[4c] Fetching streaming links for adult Ep...`);
                const adultStream = await axios.get(`${API_BASE}/api/stream/watch/${encodeURIComponent(firstAdultEp.id)}`, {
                    params: { category: 'sub', ep_num: firstAdultEp.number },
                    timeout: 30000
                });
                console.log('✅ Adult streaming data resolved!');
                console.log('   Provider:', adultStream.data.source);
                console.log('   Number of sources:', adultStream.data.sources?.length);
            }
        }
    } catch (err) {
        console.log('❌ Adult content test failed:', err.response?.status || err.message, err.response?.data || '');
    }
}

runTests();
