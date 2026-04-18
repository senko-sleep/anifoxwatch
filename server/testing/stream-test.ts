/**
 * Streaming Test Suite - Strict 5s timeouts, no exceptions
 * Tests multiple anime sites to find working streaming APIs
 */

const TIMEOUT = 5000;
const TEST_ANIME = [
    'naruto',
    'one piece',
    'dragon ball',
    'attack on titan',
    'demon slayer',
    'jujutsu kaisen',
    'my hero academia',
    'bleach',
    'fairy tail',
    'code geass'
];

function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT ${ms}ms`)), ms));
}

async function fetchWithTimeout(url: string, ms: number = TIMEOUT): Promise<Response> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), ms);
    try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(tid);
        return resp;
    } catch (e) {
        clearTimeout(tid);
        throw e;
    }
}

async function testSite(name: string, url: string): Promise<{ success: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
        const resp = await fetchWithTimeout(url, TIMEOUT);
        const latency = Date.now() - start;
        if (resp.ok) return { success: true, latency };
        return { success: false, latency, error: `HTTP ${resp.status}` };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

async function testAnimeKai(): Promise<void> {
    console.log('\n--- Testing AnimeKai ---');
    try {
        const result = await Promise.race([
            fetch('https://animekai.to/search?keyword=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('AnimeKai search:', result?.status === 200 ? 'OK' : 'FAIL');
    } catch (e) {
        console.log('AnimeKai error:', e instanceof Error ? e.message : String(e));
    }
}

async function testGogoanime(): Promise<void> {
    console.log('\n--- Testing Gogoanime ---');
    try {
        const resp = await Promise.race([
            fetch('https://animeapi.ranxplode.com/anime/gogoanime?search=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('Gogoanime API:', resp?.status === 200 ? 'OK' : 'FAIL');
    } catch (e) {
        console.log('Gogoanime error:', e instanceof Error ? e.message : String(e));
    }
}

async function testConsumetAPI(): Promise<void> {
    console.log('\n--- Testing Consumet API ---');
    try {
        const endpoints = [
            'https://api.consumet.org/anime/gogoanime/top-airing',
            'https://api.consumet.org/anime/gogoanime/search?keyw=naruto',
            'https://consumet-api-main.fly.dev/anime/gogoanime/top-airing'
        ];
        for (const url of endpoints) {
            try {
                const resp = await Promise.race([
                    fetch(url, { signal: AbortSignal.timeout(TIMEOUT) }),
                    timeout(TIMEOUT)
                ]);
                if (resp.ok) {
                    console.log('Consumet OK:', url);
                    const data = await resp.json();
                    console.log('Sample results:', JSON.stringify(data).slice(0, 200));
                    break;
                }
            } catch {}
        }
    } catch (e) {
        console.log('Consumet error:', e instanceof Error ? e.message : String(e));
    }
}

async function testAllAnimeAPI(): Promise<void> {
    console.log('\n--- Testing AllAnime API ---');
    try {
        const query = `
            query {
                animeSearch(query: "naruto", limit: 5) {
                    results {
                        _id
                        name
                        thumbnail
                    }
                }
            }
        `;
        const resp = await Promise.race([
            fetch('https://allanime.ai/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
                signal: AbortSignal.timeout(TIMEOUT)
            }),
            timeout(TIMEOUT)
        ]);
        console.log('AllAnime API:', resp?.status === 200 ? 'OK' : 'FAIL');
        if (resp?.ok) {
            const data = await resp.json();
            console.log('Sample:', JSON.stringify(data).slice(0, 300));
        }
    } catch (e) {
        console.log('AllAnime error:', e instanceof Error ? e.message : String(e));
    }
}

async function testKaido(): Promise<void> {
    console.log('\n--- Testing Kaido ---');
    const result = await testSite('Kaido', 'https://kaido.to');
    console.log('Kaido:', result.success ? `OK (${result.latency}ms)` : result.error);
    
    try {
        const searchResp = await Promise.race([
            fetch('https://kaido.to/search?keyword=naruto', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('Kaido search:', searchResp?.status === 200 ? 'OK' : 'FAIL');
    } catch (e) {
        console.log('Kaido search error:', e instanceof Error ? e.message : String(e));
    }
}

async function testZoro(): Promise<void> {
    console.log('\n--- Testing Zoro (zoroxtv.to) ---');
    const sites = ['https://zoroxtv.to', 'https://zoro.to', 'https://aniwave.tv'];
    for (const site of sites) {
        const result = await testSite('Zoro', site);
        if (result.success) {
            console.log(`${site}: OK (${result.latency}ms)`);
            break;
        }
    }
}

async function test9Anime(): Promise<void> {
    console.log('\n--- Testing 9Anime ---');
    const sites = ['https://9animetv.to', 'https://9anime.to', 'https://9anime.io'];
    for (const site of sites) {
        const result = await testSite('9Anime', site);
        console.log(`${site}:`, result.success ? `OK (${result.latency}ms)` : result.error);
        if (result.success) break;
    }
}

async function testAnimePahe(): Promise<void> {
    console.log('\n--- Testing AnimePahe ---');
    const sites = ['https://animepahe.ru', 'https://animepahe.com'];
    for (const site of sites) {
        const result = await testSite('AnimePahe', site);
        console.log(`${site}:`, result.success ? `OK (${result.latency}ms)` : result.error);
        if (result.success) break;
    }
}

async function testMiruro(): Promise<void> {
    console.log('\n--- Testing Miruro ---');
    const result = await testSite('Miruro', 'https://miruro.tv');
    console.log('Miruro:', result.success ? `OK (${result.latency}ms)` : result.error);
    
    try {
        const apiResp = await Promise.race([
            fetch('https://api.miruro.tv/anime/trending', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('Miruro API:', apiResp?.status === 200 ? 'OK' : 'FAIL');
    } catch {}
}

async function testHiAnime(): Promise<void> {
    console.log('\n--- Testing HiAnime (hianime.to) ---');
    const sites = ['https://hianime.to', 'https://hianime.io', 'https://hianime.city'];
    for (const site of sites) {
        const result = await testSite('HiAnime', site);
        console.log(`${site}:`, result.success ? `OK (${result.latency}ms)` : result.error);
        if (result.success) break;
    }
}

async function testStreamtape(): Promise<void> {
    console.log('\n--- Testing Streamtape (stream host) ---');
    try {
        const resp = await Promise.race([
            fetch('https://streamtape.com/', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('Streamtape:', resp?.status === 200 ? 'OK' : 'FAIL');
    } catch (e) {
        console.log('Streamtape error:', e instanceof Error ? e.message : String(e));
    }
}

async function testMegaUp(): Promise<void> {
    console.log('\n--- Testing MegaUp CDN ---');
    try {
        const resp = await Promise.race([
            fetch('https://megaup.nl/', { signal: AbortSignal.timeout(TIMEOUT) }),
            timeout(TIMEOUT)
        ]);
        console.log('MegaUp:', resp?.status === 200 ? 'OK' : 'FAIL');
    } catch (e) {
        console.log('MegaUp error:', e instanceof Error ? e.message : String(e));
    }
}

async function runAllTests(): Promise<void> {
    console.log('=== STREAMING TEST SUITE ===');
    console.log('Timeout: 5s per request');
    console.log('Testing:', TEST_ANIME.slice(0, 3).join(', '), '...\n');
    
    const tests = [
        testAnimeKai,
        testGogoanime,
        testConsumetAPI,
        testAllAnimeAPI,
        testKaido,
        testZoro,
        test9Anime,
        testAnimePahe,
        testMiruro,
        testHiAnime,
        testStreamtape,
        testMegaUp
    ];
    
    const results: { name: string; success: boolean }[] = [];
    
    for (const test of tests) {
        try {
            await test();
        } catch (e) {
            console.log('Test crashed:', e instanceof Error ? e.message : String(e));
        }
    }
    
    console.log('\n=== SUMMARY ===');
    console.log('Tests completed. Check results above for working APIs.');
    
    console.log('\n=== QUICK STREAM TEST ===');
    console.log('Testing actual stream extraction from working sites...\n');
    
    await testQuickStream();
}

async function testQuickStream(): Promise<void> {
    const streamTests = [
        { name: 'Consumet Gogoanime', url: 'https://api.consumet.org/anime/gogoanime/top-airing' },
        { name: 'Consumet Zoro', url: 'https://api.consumet.org/anime/zoro/top-airing' },
        { name: 'AnimePahe API', url: 'https://animepahe.ru/api' },
    ];
    
    for (const test of streamTests) {
        try {
            const start = Date.now();
            const resp = await Promise.race([
                fetch(test.url, { signal: AbortSignal.timeout(TIMEOUT) }),
                timeout(TIMEOUT)
            ]);
            const ms = Date.now() - start;
            if (resp.ok) {
                console.log(`[${ms}ms] ${test.name}: OK`);
                const data = await resp.json();
                console.log('  Data sample:', JSON.stringify(data).slice(0, 150));
            } else {
                console.log(`[${ms}ms] ${test.name}: HTTP ${resp.status}`);
            }
        } catch (e) {
            console.log(`${test.name}:`, e instanceof Error ? e.message : String(e));
        }
    }
}

runAllTests().catch(console.error);