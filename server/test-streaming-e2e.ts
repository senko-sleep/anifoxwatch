/**
 * End-to-end streaming test
 * Tests: Search → Episodes → Streaming Links
 * Runs directly against sources (no server needed)
 */

import { HiAnime } from 'aniwatch';

const QUERY = 'Naruto';
const TIMEOUT = 30000;

// Colors for console
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

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
    ]);
}

async function main() {
    header('ANISTREAM HUB - E2E STREAMING TEST');
    const startTime = Date.now();

    // ========== STEP 1: Initialize scraper ==========
    log('Initializing HiAnime scraper (aniwatch package)...');
    const scraper = new HiAnime.Scraper();
    pass('Scraper initialized');

    // ========== STEP 2: Search ==========
    header(`STEP 1: Search for "${QUERY}"`);
    let searchResults: any;
    try {
        searchResults = await withTimeout(scraper.search(QUERY, 1), TIMEOUT, 'Search');
        if (!searchResults?.animes?.length) {
            fail('Search returned no results!');
            process.exit(1);
        }
        pass(`Search returned ${searchResults.animes.length} results`);
        
        // Show first 5 results
        searchResults.animes.slice(0, 5).forEach((a: any, i: number) => {
            log(`  ${i + 1}. ${a.name} (id: ${a.id}, episodes: sub=${a.episodes?.sub || '?'} dub=${a.episodes?.dub || '?'})`);
        });
    } catch (err: any) {
        fail(`Search failed: ${err.message}`);
        process.exit(1);
    }

    // ========== STEP 3: Get episodes for first result ==========
    const anime = searchResults.animes[0];
    header(`STEP 2: Get Episodes for "${anime.name}" (id: ${anime.id})`);
    
    let episodes: any;
    try {
        episodes = await withTimeout(scraper.getEpisodes(anime.id), TIMEOUT, 'GetEpisodes');
        if (!episodes?.episodes?.length) {
            fail('No episodes returned!');
            process.exit(1);
        }
        pass(`Got ${episodes.episodes.length} episodes`);
        
        // Show first 3 episodes
        episodes.episodes.slice(0, 3).forEach((ep: any, i: number) => {
            log(`  Ep ${ep.number}: "${ep.title}" (episodeId: ${ep.episodeId})`);
        });
    } catch (err: any) {
        fail(`GetEpisodes failed: ${err.message}`);
        process.exit(1);
    }

    // ========== STEP 4: Get servers for first episode ==========
    const firstEp = episodes.episodes[0];
    header(`STEP 3: Get Servers for Episode ${firstEp.number} (${firstEp.episodeId})`);
    
    let servers: any;
    try {
        servers = await withTimeout(scraper.getEpisodeServers(firstEp.episodeId), TIMEOUT, 'GetServers');
        pass(`Got servers:`);
        if (servers.sub?.length) log(`  SUB servers: ${servers.sub.map((s: any) => s.serverName).join(', ')}`);
        if (servers.dub?.length) log(`  DUB servers: ${servers.dub.map((s: any) => s.serverName).join(', ')}`);
        if (servers.raw?.length) log(`  RAW servers: ${servers.raw.map((s: any) => s.serverName).join(', ')}`);
    } catch (err: any) {
        fail(`GetServers failed: ${err.message}`);
        // Continue anyway - try streaming directly
        warn('Continuing to streaming test despite server listing failure...');
    }

    // ========== STEP 5: Get streaming links - try multiple servers concurrently ==========
    header(`STEP 4: Get Streaming Links (trying all servers concurrently)`);
    
    const serverNames: string[] = ['hd-2', 'hd-1', 'hd-3'];
    const categories: Array<'sub' | 'dub'> = ['sub', 'dub'];
    
    // Try all server+category combos concurrently
    const streamAttempts = serverNames.flatMap(server => 
        categories.map(category => ({
            server,
            category,
            label: `${server}/${category}`
        }))
    );

    log(`Trying ${streamAttempts.length} server/category combinations concurrently...`);
    
    const streamResults = await Promise.allSettled(
        streamAttempts.map(async ({ server, category, label }) => {
            try {
                const data = await withTimeout(
                    scraper.getEpisodeSources(
                        firstEp.episodeId,
                        server as HiAnime.AnimeServers,
                        category
                    ),
                    TIMEOUT,
                    `Stream ${label}`
                );
                return { label, data, success: !!(data?.sources?.length) };
            } catch (err: any) {
                return { label, error: err.message, success: false };
            }
        })
    );

    let workingStream: any = null;
    let workingLabel = '';
    
    for (const result of streamResults) {
        if (result.status === 'fulfilled') {
            const { label, success, data, error } = result.value as any;
            if (success) {
                pass(`${label}: ${data.sources.length} source(s) found`);
                if (!workingStream) {
                    workingStream = data;
                    workingLabel = label;
                }
                // Show source details
                data.sources.forEach((s: any) => {
                    log(`    URL: ${s.url?.substring(0, 80)}...`);
                    log(`    Quality: ${s.quality || 'auto'}, isM3U8: ${s.isM3U8}`);
                });
                if (data.tracks?.length) {
                    log(`    Subtitles: ${data.tracks.filter((t: any) => t.kind === 'captions').length} tracks`);
                }
            } else {
                fail(`${label}: ${error || 'No sources returned'}`);
            }
        } else {
            fail(`${(result as any).reason?.message || 'Unknown error'}`);
        }
    }

    // ========== STEP 6: Verify stream URL is accessible ==========
    if (workingStream) {
        header(`STEP 5: Verify Stream URL Accessibility`);
        const streamUrl = workingStream.sources[0]?.url;
        if (streamUrl) {
            log(`Testing stream URL: ${streamUrl.substring(0, 100)}...`);
            try {
                const response = await withTimeout(
                    fetch(streamUrl, {
                        method: 'HEAD',
                        headers: {
                            'Referer': workingStream.headers?.Referer || 'https://megacloud.blog/',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    }),
                    10000,
                    'URL verification'
                );
                if (response.ok || response.status === 200 || response.status === 206) {
                    pass(`Stream URL is accessible! Status: ${response.status}`);
                    log(`  Content-Type: ${response.headers.get('content-type')}`);
                } else {
                    warn(`Stream URL returned status: ${response.status}`);
                }
            } catch (err: any) {
                warn(`URL verification: ${err.message} (may still work via proxy)`);
            }
        }
    }

    // ========== STEP 7: Test raw ID format (no prefix) ==========
    header(`STEP 6: Test Raw ID Format (no 'hianime-' prefix)`);
    log(`Anime ID from search: "${anime.id}" (this is the RAW id - no prefix needed)`);
    log(`Episode ID format: "${firstEp.episodeId}"`);
    log('');
    log(`${BOLD}Correct URL format:${RESET}`);
    log(`  /watch?id=${anime.id}&ep=1`);
    log(`  /api/stream/watch/${encodeURIComponent(firstEp.episodeId)}`);
    log('');
    log(`${BOLD}NOT this:${RESET}`);
    log(`  /watch?id=hianime-${anime.id}&ep=1  ${RED}(WRONG - extra prefix)${RESET}`);

    // ========== SUMMARY ==========
    header('TEST SUMMARY');
    const totalTime = Date.now() - startTime;
    const workingCount = streamResults.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    
    log(`Total time: ${totalTime}ms`);
    log(`Search results: ${searchResults.animes.length}`);
    log(`Episodes found: ${episodes?.episodes?.length || 0}`);
    log(`Working streams: ${workingCount}/${streamAttempts.length}`);
    
    if (workingStream) {
        pass(`${BOLD}STREAMING IS WORKING!${RESET} Best: ${workingLabel}`);
        log(`Stream URL: ${workingStream.sources[0]?.url?.substring(0, 100)}...`);
        log(`Headers: ${JSON.stringify(workingStream.headers || {})}`);
        
        // Test a second anime to confirm reliability
        if (searchResults.animes.length > 1) {
            header('BONUS: Testing second anime for reliability');
            const anime2 = searchResults.animes[1];
            log(`Testing "${anime2.name}" (id: ${anime2.id})...`);
            try {
                const eps2 = await withTimeout(scraper.getEpisodes(anime2.id), TIMEOUT, 'GetEpisodes2');
                if (eps2?.episodes?.length) {
                    const ep2 = eps2.episodes[0];
                    log(`  Episode: ${ep2.episodeId}`);
                    const stream2 = await withTimeout(
                        scraper.getEpisodeSources(ep2.episodeId, 'hd-2' as HiAnime.AnimeServers, 'sub'),
                        TIMEOUT,
                        'Stream2'
                    );
                    if (stream2?.sources?.length) {
                        pass(`Second anime also streams! ${stream2.sources.length} source(s)`);
                        log(`  URL: ${stream2.sources[0]?.url?.substring(0, 80)}...`);
                    } else {
                        fail('Second anime returned no sources');
                    }
                }
            } catch (err: any) {
                fail(`Second anime test failed: ${err.message}`);
            }
        }
    } else {
        fail(`${BOLD}NO WORKING STREAMS FOUND${RESET}`);
        process.exit(1);
    }

    console.log(`\n${GREEN}${BOLD}ALL TESTS COMPLETE${RESET}\n`);
}

main().catch(err => {
    fail(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
});
