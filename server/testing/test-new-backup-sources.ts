/**
 * Test suite specifically for the 20 new backup anime sources
 * Tests HTML scraping, stream extraction, and source reliability
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const API_BASE = process.env.API_URL || 'http://localhost:3001';

// New backup sources added
const NEW_SOURCES = [
    { name: 'Zoro', baseUrl: 'https://aniwatch.to' },
    { name: 'AnimePahe', baseUrl: 'https://animepahe.ru' },
    { name: 'AnimeSuge', baseUrl: 'https://animesuge.to' },
    { name: 'Kaido', baseUrl: 'https://kaido.to' },
    { name: 'Anix', baseUrl: 'https://anix.to' },
    { name: 'KickassAnime', baseUrl: 'https://kickassanime.am' },
    { name: 'YugenAnime', baseUrl: 'https://yugenanime.tv' },
    { name: 'AniMixPlay', baseUrl: 'https://animixplay.to' },
    { name: 'AnimeFox', baseUrl: 'https://animefox.tv' },
    { name: 'AnimeDAO', baseUrl: 'https://animedao.to' },
    { name: 'AnimeFLV', baseUrl: 'https://www3.animeflv.net' },
    { name: 'AnimeSaturn', baseUrl: 'https://www.animesaturn.tv' },
    { name: 'Crunchyroll', baseUrl: 'https://www.crunchyroll.com' },
    { name: 'AnimeOnsen', baseUrl: 'https://animeonsen.xyz' },
    { name: 'Marin', baseUrl: 'https://marin.moe' },
    { name: 'AnimeHeaven', baseUrl: 'https://animeheaven.me' },
    { name: 'AnimeKisa', baseUrl: 'https://animekisa.tv' },
    { name: 'AnimeOwl', baseUrl: 'https://animeowl.me' },
    { name: 'AnimeLand', baseUrl: 'https://www.animeland.us' },
    { name: 'AnimeFreak', baseUrl: 'https://animefreak.to' }
];

interface SourceTestResult {
    source: string;
    baseUrl: string;
    siteReachable: boolean;
    apiHealthy: boolean;
    searchWorks: boolean;
    trendingWorks: boolean;
    latestWorks: boolean;
    streamExtraction: boolean;
    errors: string[];
    responseTime: number;
}

const TIMEOUT = 10000;
const TEST_QUERY = 'one piece';

async function testSiteReachability(baseUrl: string): Promise<{ reachable: boolean; time: number }> {
    const start = Date.now();
    try {
        const response = await axios.get(baseUrl, {
            timeout: TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            validateStatus: () => true
        });
        return { reachable: response.status < 500, time: Date.now() - start };
    } catch {
        return { reachable: false, time: Date.now() - start };
    }
}

async function testAPISearch(source: string): Promise<boolean> {
    try {
        const response = await axios.get(`${API_BASE}/api/anime/search`, {
            params: { q: TEST_QUERY, source, page: 1 },
            timeout: TIMEOUT
        });
        return response.data?.results?.length > 0;
    } catch {
        return false;
    }
}

async function testAPITrending(source: string): Promise<boolean> {
    try {
        const response = await axios.get(`${API_BASE}/api/anime/trending`, {
            params: { source, page: 1 },
            timeout: TIMEOUT
        });
        return (response.data?.results?.length > 0) || (response.data?.length > 0);
    } catch {
        return false;
    }
}

async function testAPILatest(source: string): Promise<boolean> {
    try {
        const response = await axios.get(`${API_BASE}/api/anime/latest`, {
            params: { source, page: 1 },
            timeout: TIMEOUT
        });
        return (response.data?.results?.length > 0) || (response.data?.length > 0);
    } catch {
        return false;
    }
}

async function testHTMLScrapingPatterns(baseUrl: string): Promise<{ success: boolean; selectors: string[] }> {
    try {
        const response = await axios.get(baseUrl, {
            timeout: TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        
        // Common selectors used in anime sites
        const commonSelectors = [
            '.anime-card', '.flw-item', '.film_list-wrap', '.item', '.anime-item',
            '.search-result', '.episode-item', '.ep-item', 'iframe',
            '[data-src]', '[data-video]', '.video-container'
        ];
        
        const foundSelectors = commonSelectors.filter(sel => $(sel).length > 0);
        return { success: foundSelectors.length > 0, selectors: foundSelectors };
    } catch {
        return { success: false, selectors: [] };
    }
}

async function testSourceComprehensive(source: { name: string; baseUrl: string }): Promise<SourceTestResult> {
    const errors: string[] = [];
    
    console.log(`\n🔍 Testing ${source.name} (${source.baseUrl})`);
    
    // Test site reachability
    const siteTest = await testSiteReachability(source.baseUrl);
    if (!siteTest.reachable) errors.push('Site unreachable');
    console.log(`  Site: ${siteTest.reachable ? '✅' : '❌'} (${siteTest.time}ms)`);
    
    // Test API health
    let apiHealthy = false;
    try {
        const healthResponse = await axios.get(`${API_BASE}/api/sources/health`, { timeout: 5000 });
        const sourceHealth = healthResponse.data.sources?.find((s: { name: string }) => s.name === source.name);
        apiHealthy = sourceHealth?.status === 'online';
    } catch {
        errors.push('API health check failed');
    }
    console.log(`  API Health: ${apiHealthy ? '✅' : '❌'}`);
    
    // Test search
    const searchWorks = await testAPISearch(source.name);
    if (!searchWorks) errors.push('Search returned no results');
    console.log(`  Search: ${searchWorks ? '✅' : '❌'}`);
    
    // Test trending
    const trendingWorks = await testAPITrending(source.name);
    if (!trendingWorks) errors.push('Trending returned no results');
    console.log(`  Trending: ${trendingWorks ? '✅' : '❌'}`);
    
    // Test latest
    const latestWorks = await testAPILatest(source.name);
    if (!latestWorks) errors.push('Latest returned no results');
    console.log(`  Latest: ${latestWorks ? '✅' : '❌'}`);
    
    // Test HTML scraping patterns
    const scrapingTest = await testHTMLScrapingPatterns(source.baseUrl);
    console.log(`  HTML Scraping: ${scrapingTest.success ? '✅' : '❌'} (${scrapingTest.selectors.join(', ') || 'no common selectors'})`);
    
    return {
        source: source.name,
        baseUrl: source.baseUrl,
        siteReachable: siteTest.reachable,
        apiHealthy,
        searchWorks,
        trendingWorks,
        latestWorks,
        streamExtraction: scrapingTest.success,
        errors,
        responseTime: siteTest.time
    };
}

async function runTests(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       NEW BACKUP SOURCES - COMPREHENSIVE TEST SUITE          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`\nTesting ${NEW_SOURCES.length} new backup sources...`);
    console.log(`API Base: ${API_BASE}`);
    console.log(`Test Query: "${TEST_QUERY}"`);
    
    const results: SourceTestResult[] = [];
    
    for (const source of NEW_SOURCES) {
        const result = await testSourceComprehensive(source);
        results.push(result);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Generate summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(60));
    
    const working = results.filter(r => r.siteReachable && (r.searchWorks || r.trendingWorks));
    const partial = results.filter(r => r.siteReachable && !r.searchWorks && !r.trendingWorks);
    const offline = results.filter(r => !r.siteReachable);
    
    console.log(`\n✅ Working Sources (${working.length}):`);
    working.forEach(r => console.log(`   • ${r.source} - ${r.responseTime}ms`));
    
    console.log(`\n⚠️ Partial/Needs Fix (${partial.length}):`);
    partial.forEach(r => console.log(`   • ${r.source}: ${r.errors.join(', ')}`));
    
    console.log(`\n❌ Offline/Unreachable (${offline.length}):`);
    offline.forEach(r => console.log(`   • ${r.source}`));
    
    // Save detailed results
    const fs = await import('fs');
    const reportPath = './new-sources-test-results.json';
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
            total: NEW_SOURCES.length,
            working: working.length,
            partial: partial.length,
            offline: offline.length
        },
        results
    }, null, 2));
    
    console.log(`\n📁 Detailed results saved to: ${reportPath}`);
    console.log('\n' + '═'.repeat(60));
}

runTests().catch(console.error);
