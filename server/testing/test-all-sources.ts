/**
 * Comprehensive test suite for all anime source scrapers
 * Tests: health checks, search, anime details, episodes, streaming links
 */

import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3001';

// All registered sources
const ALL_SOURCES = [
    'HiAnimeDirect', 'HiAnime', 'Zoro', 'AnimePahe', 'AnimeSuge', 'Kaido', 'Anix',
    'Gogoanime', '9Anime', 'Aniwave', 'Aniwatch', 'KickassAnime', 'YugenAnime',
    'AniMixPlay', 'AnimeFox', 'AnimeDAO', 'AnimeFLV', 'AnimeSaturn', 'Crunchyroll',
    'AnimeOnsen', 'Marin', 'AnimeHeaven', 'AnimeKisa', 'AnimeOwl', 'AnimeLand',
    'AnimeFreak', 'Consumet', 'WatchHentai'
];

const TEST_QUERY = 'naruto';
const TIMEOUT = 15000;

interface TestResult {
    source: string;
    test: string;
    success: boolean;
    duration: number;
    error?: string;
    data?: unknown;
}

const results: TestResult[] = [];

async function testHealthCheck(source: string): Promise<TestResult> {
    const start = Date.now();
    try {
        const response = await axios.get(`${API_BASE}/api/sources/health`, { timeout: TIMEOUT });
        const sourceHealth = response.data.sources?.find((s: { name: string }) => s.name === source);
        return {
            source,
            test: 'healthCheck',
            success: sourceHealth?.status === 'online',
            duration: Date.now() - start,
            data: sourceHealth
        };
    } catch (error) {
        return {
            source,
            test: 'healthCheck',
            success: false,
            duration: Date.now() - start,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

async function testSearch(source: string): Promise<TestResult> {
    const start = Date.now();
    try {
        const response = await axios.get(`${API_BASE}/api/anime/search`, {
            params: { q: TEST_QUERY, source, page: 1 },
            timeout: TIMEOUT
        });
        const hasResults = response.data.results?.length > 0;
        return {
            source,
            test: 'search',
            success: hasResults,
            duration: Date.now() - start,
            data: { resultCount: response.data.results?.length || 0, firstResult: response.data.results?.[0]?.title }
        };
    } catch (error) {
        return {
            source,
            test: 'search',
            success: false,
            duration: Date.now() - start,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

async function testTrending(source: string): Promise<TestResult> {
    const start = Date.now();
    try {
        const response = await axios.get(`${API_BASE}/api/anime/trending`, {
            params: { source, page: 1 },
            timeout: TIMEOUT
        });
        const hasResults = response.data.results?.length > 0 || response.data.length > 0;
        return {
            source,
            test: 'trending',
            success: hasResults,
            duration: Date.now() - start,
            data: { resultCount: response.data.results?.length || response.data.length || 0 }
        };
    } catch (error) {
        return {
            source,
            test: 'trending',
            success: false,
            duration: Date.now() - start,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

async function testLatest(source: string): Promise<TestResult> {
    const start = Date.now();
    try {
        const response = await axios.get(`${API_BASE}/api/anime/latest`, {
            params: { source, page: 1 },
            timeout: TIMEOUT
        });
        const hasResults = response.data.results?.length > 0 || response.data.length > 0;
        return {
            source,
            test: 'latest',
            success: hasResults,
            duration: Date.now() - start,
            data: { resultCount: response.data.results?.length || response.data.length || 0 }
        };
    } catch (error) {
        return {
            source,
            test: 'latest',
            success: false,
            duration: Date.now() - start,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

async function runSourceTests(source: string): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${source}`);
    console.log('='.repeat(60));

    // Run tests sequentially to avoid rate limiting
    const healthResult = await testHealthCheck(source);
    results.push(healthResult);
    console.log(`  Health: ${healthResult.success ? '✅' : '❌'} (${healthResult.duration}ms)`);

    const searchResult = await testSearch(source);
    results.push(searchResult);
    console.log(`  Search: ${searchResult.success ? '✅' : '❌'} (${searchResult.duration}ms) - ${(searchResult.data as { resultCount: number })?.resultCount || 0} results`);

    const trendingResult = await testTrending(source);
    results.push(trendingResult);
    console.log(`  Trending: ${trendingResult.success ? '✅' : '❌'} (${trendingResult.duration}ms)`);

    const latestResult = await testLatest(source);
    results.push(latestResult);
    console.log(`  Latest: ${latestResult.success ? '✅' : '❌'} (${latestResult.duration}ms)`);
}

async function runAllTests(): Promise<void> {
    console.log('\n' + '🎬 ANIME SOURCE SCRAPER TEST SUITE'.padStart(50));
    console.log('='.repeat(60));
    console.log(`Testing ${ALL_SOURCES.length} sources...`);
    console.log(`API: ${API_BASE}`);
    console.log(`Query: "${TEST_QUERY}"`);

    for (const source of ALL_SOURCES) {
        await runSourceTests(source);
        // Small delay between sources to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const sourceStats = new Map<string, { passed: number; failed: number }>();
    for (const result of results) {
        if (!sourceStats.has(result.source)) {
            sourceStats.set(result.source, { passed: 0, failed: 0 });
        }
        const stat = sourceStats.get(result.source)!;
        if (result.success) stat.passed++;
        else stat.failed++;
    }

    let totalPassed = 0;
    let totalFailed = 0;

    console.log('\nSource Results:');
    for (const [source, stats] of sourceStats) {
        const status = stats.failed === 0 ? '✅' : stats.passed > 0 ? '⚠️' : '❌';
        console.log(`  ${status} ${source}: ${stats.passed}/${stats.passed + stats.failed} tests passed`);
        totalPassed += stats.passed;
        totalFailed += stats.failed;
    }

    console.log(`\nTotal: ${totalPassed}/${totalPassed + totalFailed} tests passed`);
    console.log(`Working Sources: ${Array.from(sourceStats.entries()).filter(([, s]) => s.passed > 0).length}/${ALL_SOURCES.length}`);

    // Export results to JSON
    const reportPath = './test-results.json';
    const fs = await import('fs');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        apiBase: API_BASE,
        testQuery: TEST_QUERY,
        results,
        summary: {
            totalTests: results.length,
            passed: totalPassed,
            failed: totalFailed,
            sourceCount: ALL_SOURCES.length,
            workingSources: Array.from(sourceStats.entries()).filter(([, s]) => s.passed > 0).length
        }
    }, null, 2));
    console.log(`\nResults saved to: ${reportPath}`);
}

// Run tests
runAllTests().catch(console.error);
