/**
 * Test streaming for anime episodes with 5s timeout per request.
 * Uses local server search (returns AnimeKai IDs), CF Worker for episodes and streaming.
 */

const LOCAL_URL = 'http://localhost:3001';
const CF_WORKER_URL = 'https://anifoxwatch-api.anya-bot.workers.dev';

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
    return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

async function testAnime(anime: any): Promise<{ success: boolean; url?: string; error?: string }> {
    console.log(`\n📺 Testing: ${anime.title.substring(0, 40)}`);
    console.log(`   ID: ${anime.id}`);

    // Get episodes from local server (without source parameter)
    let episodes: any[];
    try {
        const resp = await fetchWithTimeout(`${LOCAL_URL}/api/anime/${anime.id}/episodes`, 30000);
        if (!resp.ok) throw new Error(`Episodes ${resp.status}`);
        const data = await resp.json();
        episodes = data.episodes || [];
        if (episodes.length === 0) throw new Error('No episodes');
        console.log(`   ${episodes.length} episodes, ep[0]: ${episodes[0].id.substring(0, 55)}`);
    } catch (err: any) {
        console.log(`   ❌ Episodes failed: ${err.message}`);
        return { success: false, error: err.message };
    }

    const epId = episodes[0].id;
    console.log(`   Episode ID: ${epId}`);

    // Try streaming from CF Worker
    try {
        const resp = await fetchWithTimeout(`${CF_WORKER_URL}/api/stream/watch/${encodeURIComponent(epId)}?category=sub`, 60000);
        if (!resp.ok) {
            console.log(`   ❌ Stream failed: HTTP ${resp.status}`);
            return { success: false, error: `HTTP ${resp.status}` };
        }
        const data = await resp.json();
        if (!data.sources?.length) {
            console.log(`   ❌ No sources found`);
            return { success: false, error: 'No sources' };
        }
        const src = data.sources[0];
        const rawUrl = src.originalUrl || src.url || '';
        console.log(`   ✅ Success: ${data.sources.length} sources, quality=${src.quality}`);
        console.log(`   URL: ${rawUrl.substring(0, 80)}...`);
        return { success: true, url: rawUrl };
    } catch (err: any) {
        console.log(`   ❌ Stream error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function runTest() {
    console.log('🚀 Testing streams for popular anime (CF Worker, filtering HiAnime format)');
    console.log('============================================================\n');

    // Search for popular anime names using CF Worker
    const SEARCH_TERMS = ['one piece', 'naruto', 'bleach', 'attack on titan', 'demon slayer', 'my hero academia', 'jujutsu kaisen', 'spy x family'];
    const animeList: any[] = [];

    for (const term of SEARCH_TERMS) {
        try {
            const resp = await fetchWithTimeout(`${CF_WORKER_URL}/api/anime/search?q=${encodeURIComponent(term)}`, 30000);
            if (!resp.ok) continue;
            const data = await resp.json();
            const results = data.results || [];
            // Filter out anime with HiAnime format IDs (slug?ep=NNNNN)
            const validAnime = results.filter((r: any) => !r.id.includes('?ep='));
            if (validAnime.length > 0) {
                animeList.push(validAnime[0]);
                console.log(`Found: ${validAnime[0].id} - ${validAnime[0].title.substring(0, 40)}`);
            }
        } catch (err) {
            // Continue to next search term
        }
    }

    if (animeList.length === 0) {
        console.log('❌ No anime found from search');
        process.exit(1);
    }

    console.log(`Found ${animeList.length} anime from search`);

    // Test anime until we find 5 that work
    let successCount = 0;
    let testedCount = 0;

    for (const anime of animeList) {
        if (successCount >= 5) break;
        const result = await testAnime(anime);
        testedCount++;
        if (result.success) successCount++;
    }

    console.log('\n============================================================');
    console.log(`📊 Results: ${successCount}/${testedCount} anime working (needed 5)`);

    if (successCount < 5) {
        console.log('\n❌ Could not find 5 working anime.');
        process.exit(1);
    } else {
        console.log(`\n✅ ${successCount} anime streaming successfully!`);
        process.exit(0);
    }
}

runTest().catch(console.error);
