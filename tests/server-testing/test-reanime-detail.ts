import axios from 'axios';

async function testReAnimeApi() {
    console.log('--- Testing ReAnime API endpoints ---');

    // 1. Search endpoint testing
    const searchQueries = ['chainsmoker', 'cat', 'one piece'];
    for (const q of searchQueries) {
        try {
            const url1 = `https://reanime.to/api/v1/search?q=${encodeURIComponent(q)}`;
            const r1 = await axios.get(url1).catch(e => e.response);
            console.log(`GET ${url1} -> status: ${r1?.status}`, r1?.data ? JSON.stringify(r1.data).slice(0, 200) : '');

            const url2 = `https://reanime.to/api/v1/anime/search?query=${encodeURIComponent(q)}`;
            const r2 = await axios.get(url2).catch(e => e.response);
            console.log(`GET ${url2} -> status: ${r2?.status}`, r2?.data ? JSON.stringify(r2.data).slice(0, 200) : '');
        } catch (e: any) {
            console.error('Search test error:', e.message);
        }
    }

    // 2. Flix API endpoint
    const anilistId = 207141; // Chainsmoker Cat AniList ID
    const epNum = 1;
    const flixUrl = `https://reanime.to/api/flix/${anilistId}/${epNum}`;
    console.log(`\nGET ${flixUrl}...`);
    try {
        const flixResp = await axios.get(flixUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Referer': 'https://reanime.to/'
            }
        });
        console.log('Flix API Response:', JSON.stringify(flixResp.data, null, 2));

        // Test resolving flixcloud link
        if (flixResp.data?.servers?.length > 0) {
            const firstServer = flixResp.data.servers[0];
            console.log('\nTesting embed link extraction for:', firstServer.dataLink);
            const embedResp = await axios.get(firstServer.dataLink, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                    'Referer': 'https://reanime.to/'
                }
            });
            console.log('Embed page HTML status:', embedResp.status);
            console.log('Embed HTML sample:', embedResp.data.slice(0, 500));
        }

    } catch (e: any) {
        console.error('Flix API error:', e.message);
    }
}

testReAnimeApi();
