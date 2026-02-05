/**
 * HTML Scraping Pattern Tests
 * Tests various HTML extraction patterns used by anime source scrapers
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
};

interface ScrapingTestResult {
    site: string;
    url: string;
    success: boolean;
    foundElements: {
        animeCards: number;
        episodeItems: number;
        iframes: number;
        videoSources: number;
        scripts: number;
    };
    extractedData: {
        titles: string[];
        images: string[];
        links: string[];
    };
    m3u8Patterns: string[];
    mp4Patterns: string[];
    errors: string[];
}

// Common CSS selectors used across anime sites
const COMMON_SELECTORS = {
    animeCards: [
        '.flw-item', '.anime-card', '.film_list-wrap .item', '.Anime',
        '.anime-item', '.search-result', '.piece', '.post', '.bs',
        '.anime-meta', '.listupd .item', '.chart', '.item-archivio'
    ],
    episodeItems: [
        '.ep-item', '.episode-item', '.ss-list a', '.episodi a',
        '.eplister li', '.episode-list a', '.ep-card', '.episodes a'
    ],
    videoContainers: [
        'iframe', 'video', '.video-container', '.player', '#player',
        '[data-video]', '[data-src]', '.embed-responsive'
    ],
    titles: [
        '.film-name', '.title', '.anime-name', '.name', 'h1', 'h2.title',
        '.Title', '.d-title', '.tt', '.anime-title'
    ],
    images: [
        '.film-poster img', '.poster img', '.anime-poster img',
        '.thumb img', 'img[data-src]', '.cover img', '.locandina img'
    ]
};

// Regex patterns to find streaming URLs in source code
const STREAM_PATTERNS = {
    m3u8: [
        /file:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
        /source:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
        /src:\s*["']([^"']*\.m3u8[^"']*)["']/gi,
        /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi
    ],
    mp4: [
        /file:\s*["']([^"']*\.mp4[^"']*)["']/gi,
        /source:\s*["']([^"']*\.mp4[^"']*)["']/gi,
        /src:\s*["']([^"']*\.mp4[^"']*)["']/gi,
        /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi
    ]
};

async function testScrapingPatterns(site: string, url: string): Promise<ScrapingTestResult> {
    const result: ScrapingTestResult = {
        site,
        url,
        success: false,
        foundElements: { animeCards: 0, episodeItems: 0, iframes: 0, videoSources: 0, scripts: 0 },
        extractedData: { titles: [], images: [], links: [] },
        m3u8Patterns: [],
        mp4Patterns: [],
        errors: []
    };

    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(response.data);
        const html = response.data;

        // Count anime cards
        for (const selector of COMMON_SELECTORS.animeCards) {
            const count = $(selector).length;
            if (count > 0) result.foundElements.animeCards += count;
        }

        // Count episode items
        for (const selector of COMMON_SELECTORS.episodeItems) {
            const count = $(selector).length;
            if (count > 0) result.foundElements.episodeItems += count;
        }

        // Count video containers
        result.foundElements.iframes = $('iframe').length;
        result.foundElements.videoSources = $('video source, video').length;
        result.foundElements.scripts = $('script').length;

        // Extract titles
        for (const selector of COMMON_SELECTORS.titles) {
            $(selector).each((_, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 2 && text.length < 200) {
                    result.extractedData.titles.push(text);
                }
            });
        }
        result.extractedData.titles = [...new Set(result.extractedData.titles)].slice(0, 10);

        // Extract images
        for (const selector of COMMON_SELECTORS.images) {
            $(selector).each((_, el) => {
                const src = $(el).attr('data-src') || $(el).attr('src');
                if (src && src.startsWith('http')) {
                    result.extractedData.images.push(src);
                }
            });
        }
        result.extractedData.images = [...new Set(result.extractedData.images)].slice(0, 5);

        // Extract links
        $('a[href*="/anime/"], a[href*="/watch/"], a[href*="/episode/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) result.extractedData.links.push(href);
        });
        result.extractedData.links = [...new Set(result.extractedData.links)].slice(0, 5);

        // Find streaming URL patterns in scripts
        for (const pattern of STREAM_PATTERNS.m3u8) {
            const matches = html.match(pattern);
            if (matches) result.m3u8Patterns.push(...matches);
        }
        result.m3u8Patterns = [...new Set(result.m3u8Patterns)].slice(0, 3);

        for (const pattern of STREAM_PATTERNS.mp4) {
            const matches = html.match(pattern);
            if (matches) result.mp4Patterns.push(...matches);
        }
        result.mp4Patterns = [...new Set(result.mp4Patterns)].slice(0, 3);

        result.success = result.foundElements.animeCards > 0 || 
                         result.foundElements.episodeItems > 0 ||
                         result.extractedData.titles.length > 0;

    } catch (error) {
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
}

async function runScrapingTests(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           HTML SCRAPING PATTERN TEST SUITE                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const testSites = [
        { site: 'Zoro/Aniwatch', url: 'https://aniwatch.to/home' },
        { site: 'AnimePahe', url: 'https://animepahe.ru' },
        { site: 'AnimeSuge', url: 'https://animesuge.to/home' },
        { site: 'Kaido', url: 'https://kaido.to/home' },
        { site: 'Gogoanime', url: 'https://anitaku.pe/home.html' },
        { site: 'KickassAnime', url: 'https://kickassanime.am' },
        { site: 'AnimeFLV', url: 'https://www3.animeflv.net' },
        { site: 'AnimeHeaven', url: 'https://animeheaven.me' }
    ];

    const results: ScrapingTestResult[] = [];

    for (const { site, url } of testSites) {
        console.log(`\n🔍 Testing: ${site}`);
        console.log(`   URL: ${url}`);
        
        const result = await testScrapingPatterns(site, url);
        results.push(result);

        console.log(`   Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
        console.log(`   Anime Cards: ${result.foundElements.animeCards}`);
        console.log(`   Episode Items: ${result.foundElements.episodeItems}`);
        console.log(`   Iframes: ${result.foundElements.iframes}`);
        console.log(`   Titles Found: ${result.extractedData.titles.length}`);
        if (result.extractedData.titles.length > 0) {
            console.log(`   Sample Title: "${result.extractedData.titles[0]}"`);
        }
        if (result.m3u8Patterns.length > 0) {
            console.log(`   M3U8 Patterns: ${result.m3u8Patterns.length} found`);
        }
        if (result.errors.length > 0) {
            console.log(`   Errors: ${result.errors.join(', ')}`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 SCRAPING SUMMARY');
    console.log('═'.repeat(60));

    const successful = results.filter(r => r.success);
    console.log(`\nWorking: ${successful.length}/${results.length} sites`);
    
    console.log('\nSelector Coverage:');
    const totalCards = results.reduce((sum, r) => sum + r.foundElements.animeCards, 0);
    const totalEpisodes = results.reduce((sum, r) => sum + r.foundElements.episodeItems, 0);
    console.log(`  • Total Anime Cards Found: ${totalCards}`);
    console.log(`  • Total Episode Items Found: ${totalEpisodes}`);
    console.log(`  • Sites with Iframes: ${results.filter(r => r.foundElements.iframes > 0).length}`);

    // Save results
    const fs = await import('fs');
    fs.writeFileSync('./scraping-test-results.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        results
    }, null, 2));
    console.log('\n📁 Results saved to: scraping-test-results.json');
}

runScrapingTests().catch(console.error);
