/**
 * DEEP Streaming Pipeline Test
 * 
 * Tests the FULL pipeline for every non-adult source:
 *   1. Health check
 *   2. Search "naruto"
 *   3. Get episodes for first result
 *   4. Get episode servers
 *   5. Get streaming links (tries multiple servers)
 *   6. HEAD-validate the actual stream URL to confirm it's playable
 *   7. If a source fails streaming, retry with different episodes/servers
 * 
 * Also tests the HiAnime sources since they're the backbone of the fallback chain.
 * 
 * Usage: npx tsx server/testing/test-all-sources.ts
 */

import axios from 'axios';
import { HiAnimeDirectSource } from '../src/sources/hianime-direct-source.js';
import { HiAnimeSource } from '../src/sources/hianime-source.js';
import { NineAnimeSource } from '../src/sources/nineanime-source.js';
import { KaidoSource } from '../src/sources/kaido-source.js';
import { AnimeFLVSource } from '../src/sources/animeflv-source.js';

const TEST_QUERY = 'naruto';
const TIMEOUT = 15000;
const STREAM_TIMEOUT = 20000;
const MAX_EPISODE_ATTEMPTS = 3; // Try up to 3 different episodes
const MAX_SERVER_ATTEMPTS = 3;  // Try up to 3 different servers per episode

interface SourceInstance {
    name: string;
    healthCheck(opts?: unknown): Promise<boolean>;
    search(q: string, page?: number, filters?: unknown, opts?: unknown): Promise<{ results: Array<{ id: string; title: string; genres?: string[] }> }>;
    getEpisodes?(id: string, opts?: unknown): Promise<Array<{ id: string; number: number; title?: string }>>;
    getStreamingLinks?(epId: string, server?: string, cat?: string, opts?: unknown): Promise<{ sources: Array<{ url: string; quality?: string; isM3U8?: boolean }>, subtitles?: unknown[] }>;
    getEpisodeServers?(epId: string, opts?: unknown): Promise<Array<{ name: string; url?: string; type?: string }>>;
}

// All non-adult sources to test — including HiAnime backbone
const SOURCES_TO_TEST: SourceInstance[] = [
    new HiAnimeDirectSource() as unknown as SourceInstance,
    new HiAnimeSource() as unknown as SourceInstance,
    new NineAnimeSource() as unknown as SourceInstance,
    new KaidoSource() as unknown as SourceInstance,
    new AnimeFLVSource() as unknown as SourceInstance,
];

interface StreamTestResult {
    source: string;
    health: boolean;
    healthMs: number;
    searchCount: number;
    searchMs: number;
    firstAnimeId: string;
    firstAnimeTitle: string;
    hasGenres: boolean;
    episodeCount: number;
    episodesMs: number;
    serverCount: number;
    // Deep streaming results
    streamAttempts: number;
    streamSuccess: boolean;
    streamMs: number;
    streamUrl: string;
    streamIsM3U8: boolean;
    streamQuality: string;
    urlReachable: boolean;
    urlStatusCode: number;
    urlContentType: string;
    errors: string[];
    verdict: 'STREAM_OK' | 'URL_VALID' | 'SEARCH_ONLY' | 'HEALTH_ONLY' | 'DEAD';
}

async function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        fn().then(v => { clearTimeout(timer); resolve(v); })
            .catch(e => { clearTimeout(timer); reject(e); });
    });
}

/**
 * Validate a stream URL by doing a HEAD request
 * Returns status code and content-type
 */
async function validateStreamUrl(url: string, headers?: Record<string, string>): Promise<{ reachable: boolean; status: number; contentType: string }> {
    try {
        const resp = await axios.head(url, {
            timeout: 8000,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...(headers || {})
            },
            validateStatus: () => true // Don't throw on any status
        });
        return {
            reachable: resp.status >= 200 && resp.status < 400,
            status: resp.status,
            contentType: resp.headers['content-type'] || ''
        };
    } catch (e: unknown) {
        // Try GET with range header as fallback (some servers block HEAD)
        try {
            const resp = await axios.get(url, {
                timeout: 8000,
                maxRedirects: 5,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Range': 'bytes=0-1024',
                    ...(headers || {})
                },
                responseType: 'arraybuffer',
                validateStatus: () => true
            });
            return {
                reachable: resp.status >= 200 && resp.status < 400,
                status: resp.status,
                contentType: resp.headers['content-type'] || ''
            };
        } catch {
            return { reachable: false, status: 0, contentType: '' };
        }
    }
}

async function deepTestSource(source: SourceInstance): Promise<StreamTestResult> {
    const result: StreamTestResult = {
        source: source.name,
        health: false, healthMs: 0,
        searchCount: 0, searchMs: 0,
        firstAnimeId: '', firstAnimeTitle: '', hasGenres: false,
        episodeCount: 0, episodesMs: 0,
        serverCount: 0,
        streamAttempts: 0, streamSuccess: false, streamMs: 0,
        streamUrl: '', streamIsM3U8: false, streamQuality: '',
        urlReachable: false, urlStatusCode: 0, urlContentType: '',
        errors: [],
        verdict: 'DEAD'
    };

    // ── 1. Health check ──
    try {
        const t = Date.now();
        result.health = await withTimeout(() => source.healthCheck({ timeout: TIMEOUT }), TIMEOUT, 'health');
        result.healthMs = Date.now() - t;
    } catch (e: unknown) {
        result.errors.push(`health: ${(e as Error).message}`);
    }

    // ── 2. Search ──
    let allSearchResults: Array<{ id: string; title: string; genres?: string[] }> = [];
    try {
        const t = Date.now();
        const searchResult = await withTimeout(
            () => source.search(TEST_QUERY, 1, undefined, { timeout: TIMEOUT }),
            TIMEOUT, 'search'
        );
        result.searchMs = Date.now() - t;
        allSearchResults = searchResult?.results || [];
        result.searchCount = allSearchResults.length;
        if (allSearchResults.length > 0) {
            result.firstAnimeId = allSearchResults[0].id;
            result.firstAnimeTitle = allSearchResults[0].title;
            result.hasGenres = !!(allSearchResults[0].genres && allSearchResults[0].genres.length > 0);
        }
    } catch (e: unknown) {
        result.errors.push(`search: ${(e as Error).message}`);
    }

    if (!result.firstAnimeId || !source.getEpisodes) {
        result.verdict = result.health ? 'HEALTH_ONLY' : 'DEAD';
        return result;
    }

    // ── 3. Get episodes — try multiple anime results if first fails ──
    let episodes: Array<{ id: string; number: number; title?: string }> = [];
    const animeIdsToTry = allSearchResults.slice(0, 3).map(r => r.id);

    for (const animeId of animeIdsToTry) {
        try {
            const t = Date.now();
            episodes = await withTimeout(
                () => source.getEpisodes!(animeId, { timeout: TIMEOUT }),
                TIMEOUT, 'episodes'
            );
            result.episodesMs = Date.now() - t;
            result.episodeCount = episodes.length;
            if (episodes.length > 0) {
                result.firstAnimeId = animeId; // Update to the one that worked
                break;
            }
        } catch (e: unknown) {
            result.errors.push(`episodes(${animeId.substring(0, 30)}): ${(e as Error).message}`);
        }
    }

    if (episodes.length === 0) {
        result.verdict = result.searchCount > 0 ? 'SEARCH_ONLY' : (result.health ? 'HEALTH_ONLY' : 'DEAD');
        return result;
    }

    // ── 4. Get servers (optional) ──
    if (source.getEpisodeServers && episodes[0]) {
        try {
            const servers = await withTimeout(
                () => source.getEpisodeServers!(episodes[0].id, { timeout: TIMEOUT }),
                TIMEOUT, 'servers'
            );
            result.serverCount = servers?.length || 0;
        } catch {
            // Non-critical
        }
    }

    // ── 5. DEEP STREAMING TEST — try multiple episodes × multiple servers ──
    if (!source.getStreamingLinks) {
        result.verdict = 'SEARCH_ONLY';
        return result;
    }

    const episodesToTry = episodes.slice(0, MAX_EPISODE_ATTEMPTS);
    let streamFound = false;

    for (const ep of episodesToTry) {
        if (streamFound) break;
        result.streamAttempts++;

        // Try with default server first
        const serversToTry = ['hd-1', 'hd-2', undefined];
        
        for (const server of serversToTry.slice(0, MAX_SERVER_ATTEMPTS)) {
            if (streamFound) break;

            try {
                const t = Date.now();
                const streamData = await withTimeout(
                    () => source.getStreamingLinks!(ep.id, server || undefined, 'sub', { timeout: STREAM_TIMEOUT }),
                    STREAM_TIMEOUT, `stream(ep${ep.number},srv=${server || 'default'})`
                );
                result.streamMs = Date.now() - t;

                const sources = streamData?.sources || [];
                if (sources.length > 0) {
                    const bestSource = sources.find((s: { url: string }) => s.url?.includes('.m3u8')) || sources[0];
                    result.streamUrl = bestSource.url || '';
                    result.streamIsM3U8 = bestSource.isM3U8 || bestSource.url?.includes('.m3u8') || false;
                    result.streamQuality = bestSource.quality || 'auto';
                    result.streamSuccess = true;
                    streamFound = true;

                    // ── 6. VALIDATE the URL is actually reachable ──
                    if (result.streamUrl) {
                        const validation = await validateStreamUrl(
                            result.streamUrl,
                            (streamData as { headers?: Record<string, string> }).headers
                        );
                        result.urlReachable = validation.reachable;
                        result.urlStatusCode = validation.status;
                        result.urlContentType = validation.contentType;
                    }
                }
            } catch (e: unknown) {
                // Don't log every attempt, just track
                result.streamAttempts++;
            }
        }
    }

    // ── Verdict ──
    if (result.streamSuccess && result.urlReachable) {
        result.verdict = 'STREAM_OK';
    } else if (result.streamSuccess) {
        result.verdict = 'URL_VALID'; // Got URL but couldn't HEAD it (may still work in browser)
    } else if (result.searchCount > 0) {
        result.verdict = 'SEARCH_ONLY';
    } else if (result.health) {
        result.verdict = 'HEALTH_ONLY';
    } else {
        result.verdict = 'DEAD';
    }

    return result;
}

async function main() {
    const runNumber = parseInt(process.argv[2] || '1');
    const totalRuns = parseInt(process.argv[3] || '1');

    console.log('');
    console.log('🎬 DEEP STREAMING PIPELINE TEST');
    console.log('═'.repeat(75));
    console.log(`Run ${runNumber}/${totalRuns} | Query: "${TEST_QUERY}" | Sources: ${SOURCES_TO_TEST.length}`);
    console.log(`Timeouts: search=${TIMEOUT}ms stream=${STREAM_TIMEOUT}ms`);
    console.log(`Max retries: ${MAX_EPISODE_ATTEMPTS} episodes × ${MAX_SERVER_ATTEMPTS} servers`);
    console.log('═'.repeat(75));

    const allResults: StreamTestResult[] = [];

    for (const source of SOURCES_TO_TEST) {
        process.stdout.write(`\n🔍 ${source.name.padEnd(20)} `);
        const result = await deepTestSource(source);
        allResults.push(result);

        const icons: Record<string, string> = {
            'STREAM_OK': '🟢', 'URL_VALID': '🟡', 'SEARCH_ONLY': '🟠', 'HEALTH_ONLY': '⚪', 'DEAD': '🔴'
        };
        console.log(`${icons[result.verdict]} ${result.verdict}`);
        console.log(`   Health: ${result.health ? '✅' : '❌'} (${result.healthMs}ms)`);
        console.log(`   Search: ${result.searchCount} results (${result.searchMs}ms)${result.firstAnimeTitle ? ` → "${result.firstAnimeTitle}"` : ''} ${result.hasGenres ? '🏷️genres' : ''}`);
        if (result.episodeCount > 0) {
            console.log(`   Episodes: ${result.episodeCount} | Servers: ${result.serverCount || '?'}`);
        }
        if (result.streamSuccess) {
            const urlStatus = result.urlReachable
                ? `✅ reachable (${result.urlStatusCode} ${result.urlContentType.substring(0, 30)})`
                : `⚠️ unreachable (${result.urlStatusCode})`;
            console.log(`   Stream: ✅ ${result.streamQuality} ${result.streamIsM3U8 ? 'HLS' : 'MP4'} (${result.streamMs}ms, ${result.streamAttempts} attempts)`);
            console.log(`   URL: ${urlStatus}`);
            console.log(`   → ${result.streamUrl.substring(0, 90)}`);
        } else if (result.episodeCount > 0) {
            console.log(`   Stream: ❌ Failed after ${result.streamAttempts} attempts`);
        }
        if (result.errors.length > 0 && result.errors.length <= 3) {
            result.errors.forEach(e => console.log(`   ⚠ ${e}`));
        } else if (result.errors.length > 3) {
            console.log(`   ⚠ ${result.errors.length} errors (first: ${result.errors[0]})`);
        }

        await new Promise(r => setTimeout(r, 200));
    }

    // ═══════════ SUMMARY ═══════════
    console.log('\n' + '═'.repeat(75));
    console.log('📊 DEEP STREAMING TEST SUMMARY');
    console.log('═'.repeat(75));

    const streamOk = allResults.filter(r => r.verdict === 'STREAM_OK');
    const urlValid = allResults.filter(r => r.verdict === 'URL_VALID');
    const searchOnly = allResults.filter(r => r.verdict === 'SEARCH_ONLY');
    const healthOnly = allResults.filter(r => r.verdict === 'HEALTH_ONLY');
    const dead = allResults.filter(r => r.verdict === 'DEAD');

    console.log(`\n🟢 STREAM_OK (full pipeline + URL reachable): ${streamOk.length}`);
    streamOk.forEach(r => console.log(`   ✅ ${r.source} — ${r.episodeCount} eps, ${r.streamQuality} ${r.streamIsM3U8 ? 'HLS' : 'MP4'}, ${r.streamMs}ms`));

    console.log(`\n🟡 URL_VALID (got stream URL, HEAD failed — may work in browser): ${urlValid.length}`);
    urlValid.forEach(r => console.log(`   🟡 ${r.source} — URL status ${r.urlStatusCode}, ${r.streamUrl.substring(0, 60)}`));

    console.log(`\n🟠 SEARCH_ONLY (search/episodes work, no stream): ${searchOnly.length}`);
    searchOnly.forEach(r => console.log(`   🟠 ${r.source} — ${r.searchCount} results, ${r.episodeCount} eps`));

    console.log(`\n⚪ HEALTH_ONLY (site responds, search fails): ${healthOnly.length}`);
    healthOnly.forEach(r => console.log(`   ⚪ ${r.source}`));

    console.log(`\n🔴 DEAD: ${dead.length}`);
    dead.forEach(r => console.log(`   🔴 ${r.source} — ${r.errors[0] || 'all failed'}`));

    // Genre coverage
    const withGenres = allResults.filter(r => r.hasGenres).length;
    const withSearch = allResults.filter(r => r.searchCount > 0).length;
    console.log(`\n📊 Genre coverage: ${withGenres}/${withSearch} sources with search return genres`);

    // Fallback chain analysis
    console.log(`\n🔗 FALLBACK CHAIN STATUS:`);
    const chainSources = ['HiAnimeDirect', 'HiAnime', '9Anime', 'Kaido', 'AnimeFLV'];
    for (const name of chainSources) {
        const r = allResults.find(r => r.source === name);
        if (r) {
            const icon = r.streamSuccess ? '✅' : r.episodeCount > 0 ? '⚠️' : '❌';
            console.log(`   ${icon} ${name}: stream=${r.streamSuccess} eps=${r.episodeCount} search=${r.searchCount}`);
        } else {
            console.log(`   ❓ ${name}: not tested`);
        }
    }

    // Save results
    const fs = await import('fs');
    const reportPath = `./server/testing/test-results-run${runNumber}.json`;
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        run: runNumber,
        query: TEST_QUERY,
        results: allResults,
        summary: {
            streamOk: streamOk.length,
            urlValid: urlValid.length,
            searchOnly: searchOnly.length,
            healthOnly: healthOnly.length,
            dead: dead.length,
            genreCoverage: `${withGenres}/${withSearch}`
        }
    }, null, 2));
    console.log(`\n💾 Results saved to: ${reportPath}`);
}

main().catch(console.error);
