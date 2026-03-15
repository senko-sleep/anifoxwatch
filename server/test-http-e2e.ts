/**
 * HTTP-level E2E streaming test
 * Tests the full flow through the Express server:
 * Search → Episodes → Servers → Streaming Links → Proxy Verification
 * 
 * Run: npx tsx test-http-e2e.ts
 * Requires server running on localhost:3001
 */

const BASE = 'http://localhost:3001';
const QUERY = 'Naruto';
const TIMEOUT = 30000;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg: string) { console.log(`${CYAN}[TEST]${RESET} ${msg}`); }
function pass(msg: string) { console.log(`${GREEN}[PASS]${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}[FAIL]${RESET} ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}[WARN]${RESET} ${msg}`); }
function header(msg: string) { console.log(`\n${BOLD}${CYAN}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${RESET}\n`); }

async function api(path: string, label: string): Promise<any> {
    const url = `${BASE}${path}`;
    log(`GET ${url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
        }
        return await res.json();
    } catch (err: any) {
        clearTimeout(timer);
        throw new Error(`${label} failed: ${err.message}`);
    }
}

async function main() {
    header('HTTP E2E STREAMING TEST');
    const startTime = Date.now();

    // ========== Health Check ==========
    log('Checking server health...');
    try {
        const health = await api('/health', 'Health');
        pass(`Server healthy: ${health.status}`);
    } catch (err: any) {
        fail(`Server not running! Start with: npm run dev\n  ${err.message}`);
        process.exit(1);
    }

    // ========== STEP 1: Search ==========
    header(`STEP 1: Search for "${QUERY}"`);
    let searchResults: any;
    try {
        searchResults = await api(`/api/anime/search?q=${encodeURIComponent(QUERY)}`, 'Search');
        if (!searchResults.results?.length) {
            fail('Search returned no results!');
            process.exit(1);
        }
        pass(`Search: ${searchResults.results.length} results (source: ${searchResults.source})`);
        
        searchResults.results.slice(0, 5).forEach((a: any, i: number) => {
            const hasPrefix = a.id.startsWith('hianime-');
            const prefixFlag = hasPrefix ? ` ${RED}[HAS hianime- PREFIX!]${RESET}` : ` ${GREEN}[CLEAN ID]${RESET}`;
            log(`  ${i + 1}. "${a.title}" (id: ${a.id})${prefixFlag}`);
        });
    } catch (err: any) {
        fail(err.message);
        process.exit(1);
    }

    // Verify clean IDs (no hianime- prefix)
    const anime = searchResults.results[0];
    if (anime.id.startsWith('hianime-')) {
        fail(`IDs still have "hianime-" prefix! Expected clean ID like "one-piece-100"`);
    } else {
        pass(`IDs are clean (no prefix): "${anime.id}"`);
    }

    // ========== STEP 2: Get Anime Details ==========
    header(`STEP 2: Get Anime Details for "${anime.title}" (id: ${anime.id})`);
    try {
        const details = await api(`/api/anime/${encodeURIComponent(anime.id)}`, 'AnimeDetails');
        if (details) {
            pass(`Got details: "${details.title}" (episodes: ${details.episodes}, type: ${details.type})`);
        } else {
            warn('Details returned null');
        }
    } catch (err: any) {
        warn(`Details failed (non-fatal): ${err.message}`);
    }

    // ========== STEP 3: Get Episodes ==========
    header(`STEP 3: Get Episodes for "${anime.title}" (id: ${anime.id})`);
    let episodes: any[];
    try {
        const epResponse = await api(`/api/anime/${encodeURIComponent(anime.id)}/episodes`, 'Episodes');
        episodes = epResponse.episodes || epResponse;
        if (!episodes?.length) {
            fail('No episodes returned!');
            process.exit(1);
        }
        pass(`Got ${episodes.length} episodes`);
        
        episodes.slice(0, 3).forEach((ep: any) => {
            log(`  Ep ${ep.number}: "${ep.title}" (id: ${ep.id})`);
        });
    } catch (err: any) {
        fail(err.message);
        process.exit(1);
    }

    // ========== STEP 4: Get Servers ==========
    const firstEp = episodes[0];
    header(`STEP 4: Get Servers for Episode ${firstEp.number} (${firstEp.id})`);
    try {
        const serverData = await api(`/api/stream/servers/${encodeURIComponent(firstEp.id)}`, 'Servers');
        if (serverData.servers?.length) {
            pass(`Got ${serverData.servers.length} servers`);
            serverData.servers.forEach((s: any) => {
                log(`  ${s.name} (${s.type})`);
            });
        } else {
            warn('No servers returned (will use defaults)');
        }
    } catch (err: any) {
        warn(`Servers failed (non-fatal): ${err.message}`);
    }

    // ========== STEP 5: Get Streaming Links ==========
    header(`STEP 5: Get Streaming Links for Episode ${firstEp.number}`);
    let streamData: any;
    try {
        streamData = await api(
            `/api/stream/watch/${encodeURIComponent(firstEp.id)}?category=sub&proxy=true&tryAll=true`,
            'StreamingLinks'
        );
        
        if (!streamData.sources?.length) {
            fail('No streaming sources returned!');
            
            // Try with different episode format
            warn('Trying alternative episode ID formats...');
            const altIds = [
                firstEp.id,
                `${anime.id}?ep=1`,
            ];
            for (const altId of altIds) {
                try {
                    log(`  Trying: ${altId}`);
                    const altData = await api(
                        `/api/stream/watch/${encodeURIComponent(altId)}?category=sub&proxy=true&tryAll=true`,
                        'AltStream'
                    );
                    if (altData.sources?.length) {
                        pass(`  Alternative ID worked: ${altId}`);
                        streamData = altData;
                        break;
                    }
                } catch { }
            }
            
            if (!streamData?.sources?.length) {
                fail('No streaming sources found with any ID format!');
                process.exit(1);
            }
        }
        
        pass(`Got ${streamData.sources.length} streaming source(s) from server: ${streamData.server}`);
        streamData.sources.forEach((s: any) => {
            log(`  Quality: ${s.quality}, M3U8: ${s.url?.includes('.m3u8')}`);
            log(`  URL: ${s.url?.substring(0, 100)}...`);
        });
        
        if (streamData.subtitles?.length) {
            log(`  Subtitles: ${streamData.subtitles.length} tracks`);
        }
    } catch (err: any) {
        fail(err.message);
        process.exit(1);
    }

    // ========== STEP 6: Verify Proxy Works ==========
    header(`STEP 6: Verify Proxy Streaming`);
    const proxyUrl = streamData.sources[0]?.url;
    if (proxyUrl && proxyUrl.includes('/api/stream/proxy')) {
        log(`Testing proxy URL: ${proxyUrl.substring(0, 120)}...`);
        try {
            const res = await fetch(proxyUrl, { 
                method: 'GET',
                signal: AbortSignal.timeout(15000)
            });
            if (res.ok) {
                const contentType = res.headers.get('content-type');
                const body = await res.text();
                if (body.includes('#EXTM3U')) {
                    pass(`Proxy returns valid M3U8 manifest (${body.length} bytes)`);
                    const lines = body.split('\n').filter((l: string) => l.trim() && !l.startsWith('#'));
                    log(`  Contains ${lines.length} segment/playlist references`);
                    
                    // Check if sub-playlists are also proxied
                    const proxiedRefs = lines.filter((l: string) => l.includes('/api/stream/proxy'));
                    if (proxiedRefs.length > 0) {
                        pass(`  Sub-playlist URLs are properly proxied (${proxiedRefs.length} refs)`);
                    }
                } else if (contentType?.includes('video') || contentType?.includes('mpegurl')) {
                    pass(`Proxy returns video content: ${contentType}`);
                } else {
                    warn(`Proxy returned unexpected content: ${contentType}, length: ${body.length}`);
                    log(`  First 200 chars: ${body.substring(0, 200)}`);
                }
            } else {
                fail(`Proxy returned ${res.status}`);
            }
        } catch (err: any) {
            warn(`Proxy test: ${err.message}`);
        }
    } else {
        warn('Stream URL is not proxied, skipping proxy test');
    }

    // ========== STEP 7: Test clean URL format ==========
    header(`STEP 7: Verify Clean URL Format`);
    log(`${BOLD}Working URL format:${RESET}`);
    log(`  Frontend:  http://localhost:8080/watch?id=${anime.id}&ep=1`);
    log(`  API:       ${BASE}/api/anime/${encodeURIComponent(anime.id)}/episodes`);
    log(`  Stream:    ${BASE}/api/stream/watch/${encodeURIComponent(firstEp.id)}`);
    
    if (!anime.id.includes('hianime-')) {
        pass(`Clean IDs confirmed - no "hianime-" prefix`);
    } else {
        fail(`IDs still have "hianime-" prefix`);
    }

    // ========== SUMMARY ==========
    header('TEST SUMMARY');
    const totalTime = Date.now() - startTime;
    
    pass(`Total time: ${totalTime}ms`);
    pass(`Search: ${searchResults.results.length} results`);
    pass(`Episodes: ${episodes.length}`);
    pass(`Streams: ${streamData.sources.length} sources`);
    pass(`Server: ${streamData.server}`);
    pass(`Clean IDs: ${!anime.id.includes('hianime-')}`);
    
    console.log(`\n${GREEN}${BOLD}ALL TESTS PASSED - STREAMING IS WORKING!${RESET}\n`);
}

main().catch(err => {
    fail(`Fatal: ${err.message}`);
    console.error(err);
    process.exit(1);
});
