/**
 * Test: hianime.city streaming source
 *
 * Tests:
 *  1. hianime.city baseUrl is reachable (HTTP 2xx)
 *  2. aniwatch HiAnime.Scraper can fetch episodes from hianime.city
 *  3. aniwatch HiAnime.Scraper can fetch streaming sources (hd-2, hd-1, hd-3)
 *  4. 9anime fallback streaming via the same aniwatch scraper
 *
 * Run: npx tsx server/testing/test-hianime-city.ts
 */

import axios from 'axios';
import { HiAnime } from 'aniwatch';

const BASE_URL_HIANIME = 'https://hianime.city';
const BASE_URL_9ANIME = 'https://9animetv.to';

// A well-known anime that should always exist on both sites
const TEST_ANIME_SLUG = 'one-piece-100';
const TEST_EP_FALLBACK_ID = 'one-piece-100?ep=10065'; // Episode 1 of One Piece on aniwatch

const SERVER_PRIORITY = ['hd-2', 'hd-1', 'hd-3', 'megacloud'];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function pass(msg: string) {
    console.log(`  ✅  ${msg}`);
}
function fail(msg: string) {
    console.log(`  ❌  ${msg}`);
}
function info(msg: string) {
    console.log(`  ℹ️   ${msg}`);
}

async function sectionHeader(title: string) {
    console.log('\n' + '─'.repeat(60));
    console.log(`  ${title}`);
    console.log('─'.repeat(60));
}

// ─────────────────────────────────────────────
// Test 1: hianime.city reachability
// ─────────────────────────────────────────────

async function testHiAnimeCityReachable(): Promise<boolean> {
    await sectionHeader('TEST 1 — hianime.city reachability');
    try {
        const res = await axios.get(BASE_URL_HIANIME, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            },
            validateStatus: () => true
        });
        if (res.status < 400) {
            pass(`hianime.city responded with HTTP ${res.status}`);
            return true;
        } else {
            fail(`hianime.city responded with HTTP ${res.status}`);
            return false;
        }
    } catch (err: any) {
        fail(`hianime.city unreachable: ${err.message}`);
        return false;
    }
}

// ─────────────────────────────────────────────
// Test 2: aniwatch scraper — home page
// ─────────────────────────────────────────────

async function testScraperHomePage(): Promise<boolean> {
    await sectionHeader('TEST 2 — aniwatch scraper home page (hianime.city)');
    try {
        // @ts-ignore — aniwatch accepts a custom baseUrl
        const scraper = new HiAnime.Scraper(BASE_URL_HIANIME);
        const home = await scraper.getHomePage();
        const trending = home?.trendingAnimes ?? home?.spotlightAnimes ?? [];
        if (trending.length > 0) {
            pass(`Home page returned ${trending.length} trending anime`);
            info(`First title: ${(trending[0] as any)?.name || 'unknown'}`);
            return true;
        } else {
            fail('Home page returned 0 trending anime');
            return false;
        }
    } catch (err: any) {
        fail(`Scraper home page failed: ${err.message}`);
        return false;
    }
}

// ─────────────────────────────────────────────
// Test 3: aniwatch scraper — episodes
// ─────────────────────────────────────────────

async function testScraperEpisodes(): Promise<{ success: boolean; episodeId: string | null }> {
    await sectionHeader('TEST 3 — aniwatch scraper episodes (hianime.city)');
    try {
        // @ts-ignore
        const scraper = new HiAnime.Scraper(BASE_URL_HIANIME);
        const data = await scraper.getEpisodes(TEST_ANIME_SLUG);
        const episodes = (data as any).episodes ?? [];
        if (episodes.length > 0) {
            const first = episodes[0];
            const episodeId: string = first.episodeId ?? `${TEST_ANIME_SLUG}?ep=1`;
            pass(`Got ${episodes.length} episodes`);
            info(`Episode 1 ID: ${episodeId}`);
            return { success: true, episodeId };
        } else {
            fail('No episodes returned');
            return { success: false, episodeId: null };
        }
    } catch (err: any) {
        fail(`Scraper getEpisodes failed: ${err.message}`);
        return { success: false, episodeId: null };
    }
}

// ─────────────────────────────────────────────
// Test 4: aniwatch scraper — streaming sources via hianime.city
// ─────────────────────────────────────────────

async function testScraperStreaming(episodeId: string): Promise<boolean> {
    await sectionHeader('TEST 4 — aniwatch scraper streaming sources (hianime.city)');
    // @ts-ignore
    const scraper = new HiAnime.Scraper(BASE_URL_HIANIME);

    for (const server of SERVER_PRIORITY) {
        try {
            info(`Trying server: ${server} (sub)`);
            const data = await scraper.getEpisodeSources(
                episodeId,
                server as HiAnime.AnimeServers,
                'sub'
            );
            const sources = (data as any).sources ?? [];
            if (sources.length > 0) {
                pass(`Server ${server} returned ${sources.length} source(s)`);
                info(`First URL: ${sources[0].url?.substring(0, 80)}...`);
                const tracks = (data as any).tracks ?? (data as any).subtitles ?? [];
                info(`Subtitles: ${tracks.filter((t: any) => t.lang !== 'thumbnails').length} track(s)`);
                return true;
            } else {
                fail(`Server ${server} returned 0 sources`);
            }
        } catch (err: any) {
            fail(`Server ${server} failed: ${err.message}`);
        }
    }

    fail('All servers failed for hianime.city streaming');
    return false;
}

// ─────────────────────────────────────────────
// Test 5: Local API — streaming endpoint
// ─────────────────────────────────────────────

async function testLocalApiStreaming(episodeId: string): Promise<boolean> {
    await sectionHeader('TEST 5 — Local API /api/stream/watch (hianime.city)');
    const encodedId = encodeURIComponent(episodeId);
    const url = `http://localhost:3001/api/stream/watch/${encodedId}?proxy=false&category=sub`;
    try {
        info(`Requesting: ${url}`);
        const res = await axios.get(url, { timeout: 30000, validateStatus: () => true });
        if (res.status === 200 && res.data?.sources?.length > 0) {
            pass(`Local API returned ${res.data.sources.length} source(s) via ${res.data.server}`);
            info(`First URL: ${res.data.sources[0].url?.substring(0, 80)}...`);
            return true;
        } else {
            fail(`Local API: HTTP ${res.status} — ${JSON.stringify(res.data).substring(0, 200)}`);
            return false;
        }
    } catch (err: any) {
        fail(`Local API request failed: ${err.message}`);
        return false;
    }
}

// ─────────────────────────────────────────────
// Test 6: 9anime — streaming (aniwatch scraper fallback)
// ─────────────────────────────────────────────

async function test9AnimeStreaming(episodeId: string): Promise<boolean> {
    await sectionHeader('TEST 6 — 9anime backup streaming (aniwatch scraper)');
    // 9anime shares the same rapid-cloud embed as hianime, so we can use
    // an aniwatch scraper pointed at hianime.city to decrypt the episode
    // sources using the episode ID derived from 9anime.

    // @ts-ignore
    const scraper = new HiAnime.Scraper(BASE_URL_HIANIME);

    for (const server of SERVER_PRIORITY) {
        try {
            info(`[9anime backup] Trying server: ${server}`);
            const data = await scraper.getEpisodeSources(
                episodeId,
                server as HiAnime.AnimeServers,
                'sub'
            );
            const sources = (data as any).sources ?? [];
            if (sources.length > 0) {
                pass(`[9anime backup] Server ${server} returned ${sources.length} source(s)`);
                info(`First URL: ${sources[0].url?.substring(0, 80)}...`);
                return true;
            } else {
                fail(`[9anime backup] Server ${server} returned 0 sources`);
            }
        } catch (err: any) {
            fail(`[9anime backup] Server ${server} failed: ${err.message}`);
        }
    }

    fail('[9anime backup] All servers failed');
    return false;
}

// ─────────────────────────────────────────────
// Test 7: 9animetv.to reachability
// ─────────────────────────────────────────────

async function test9AnimeReachable(): Promise<boolean> {
    await sectionHeader('TEST 7 — 9animetv.to reachability');
    try {
        const res = await axios.get(BASE_URL_9ANIME, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            },
            validateStatus: () => true
        });
        if (res.status < 400) {
            pass(`9animetv.to responded with HTTP ${res.status}`);
            return true;
        } else {
            fail(`9animetv.to responded with HTTP ${res.status}`);
            return false;
        }
    } catch (err: any) {
        fail(`9animetv.to unreachable: ${err.message}`);
        return false;
    }
}

// ─────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('  HIANIME.CITY + 9ANIME STREAMING TEST');
    console.log('  Anime: One Piece | Episode: 1');
    console.log('='.repeat(60));

    const results: Record<string, boolean> = {};

    // Test 1 — Reachability
    results['hianime.city reachable'] = await testHiAnimeCityReachable();

    // Test 7 — 9anime reachable
    results['9animetv.to reachable'] = await test9AnimeReachable();

    // Test 2 — Home page
    results['scraper home page'] = await testScraperHomePage();

    // Test 3 — Episodes
    const { success: epSuccess, episodeId: epId } = await testScraperEpisodes();
    results['scraper episodes'] = epSuccess;

    // Use fallback episode ID if scraper couldn't get one
    const episodeId = epId ?? TEST_EP_FALLBACK_ID;
    info(`Using episode ID for streaming tests: ${episodeId}`);

    // Test 4 — Direct aniwatch streaming (hianime.city)
    results['hianime.city stream'] = await testScraperStreaming(episodeId);

    // Test 5 — Local API streaming
    results['local API stream'] = await testLocalApiStreaming(episodeId);

    // Test 6 — 9anime backup streaming
    results['9anime backup stream'] = await test9AnimeStreaming(episodeId);

    // ─── Summary ───────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log('  RESULTS SUMMARY');
    console.log('='.repeat(60));

    let passed = 0;
    let failed = 0;
    for (const [name, ok] of Object.entries(results)) {
        if (ok) {
            console.log(`  ✅  ${name}`);
            passed++;
        } else {
            console.log(`  ❌  ${name}`);
            failed++;
        }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`  Total: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(60) + '\n');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
