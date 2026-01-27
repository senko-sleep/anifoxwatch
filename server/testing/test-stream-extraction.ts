/**
 * Comprehensive Stream Extraction Test
 * Tests multiple methods to find working anime streams
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';

const NINE_ANIME_URL = 'https://9animetv.to';

interface StreamResult {
    url: string;
    quality: string;
    working: boolean;
    statusCode?: number;
    error?: string;
}

class StreamTester {
    private browser: Browser | null = null;

    async init() {
        console.log('🚀 Launching browser...');
        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security'
            ]
        });
        console.log('✅ Browser launched\n');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    private async createPage(): Promise<Page> {
        if (!this.browser) throw new Error('Browser not initialized');
        const page = await this.browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        );
        await page.setViewport({ width: 1920, height: 1080 });
        return page;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test 1: Extract streams by capturing network requests on 9anime watch page
     */
    async test9AnimeExtraction(animeSlug: string, episodeId: string): Promise<StreamResult[]> {
        console.log('\n' + '='.repeat(70));
        console.log('TEST 1: 9Anime Direct Extraction');
        console.log('='.repeat(70));

        const url = `${NINE_ANIME_URL}/watch/${animeSlug}?ep=${episodeId}`;
        console.log(`📍 URL: ${url}\n`);

        const page = await this.createPage();
        const capturedStreams: string[] = [];
        const results: StreamResult[] = [];

        try {
            await page.setRequestInterception(true);

            page.on('request', (request) => {
                const reqUrl = request.url();
                if (reqUrl.includes('.m3u8') && !reqUrl.includes('subtitle')) {
                    console.log(`🎯 Captured m3u8: ${reqUrl.substring(0, 80)}...`);
                    capturedStreams.push(reqUrl);
                }
                request.continue();
            });

            console.log('⏳ Navigating to page...');
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            console.log('⏳ Waiting for video player...');
            await this.delay(8000);

            // Get the iframe embed URL
            const iframeSrc = await page.$eval('iframe', (el) => el.src).catch(() => null);
            console.log(`📺 Iframe src: ${iframeSrc?.substring(0, 80) || 'Not found'}...`);

            // If we got an iframe, navigate to it
            if (iframeSrc && iframeSrc.includes('rapid-cloud') || iframeSrc?.includes('megacloud')) {
                console.log('\n⏳ Navigating to embed page...');
                const embedPage = await this.createPage();

                await embedPage.setRequestInterception(true);
                embedPage.on('request', (request) => {
                    const reqUrl = request.url();
                    if (reqUrl.includes('.m3u8') && !reqUrl.includes('subtitle')) {
                        console.log(`🎯 Captured from embed: ${reqUrl.substring(0, 80)}...`);
                        if (!capturedStreams.includes(reqUrl)) {
                            capturedStreams.push(reqUrl);
                        }
                    }
                    request.continue();
                });

                try {
                    await embedPage.goto(iframeSrc, { waitUntil: 'networkidle0', timeout: 45000 });
                    await this.delay(10000);

                    // Try to get video element src
                    const videoSrc = await embedPage.evaluate(() => {
                        const video = document.querySelector('video');
                        return video?.src || video?.currentSrc;
                    });

                    if (videoSrc && videoSrc.includes('.m3u8') && !capturedStreams.includes(videoSrc)) {
                        console.log(`🎯 Video element src: ${videoSrc.substring(0, 80)}...`);
                        capturedStreams.push(videoSrc);
                    }
                } catch (e: any) {
                    console.log(`⚠️ Embed error: ${e.message}`);
                } finally {
                    await embedPage.close();
                }
            }

            console.log(`\n📊 Captured ${capturedStreams.length} potential streams`);

            // Test each captured URL
            for (const streamUrl of capturedStreams) {
                const result = await this.testStreamUrl(streamUrl);
                results.push(result);
            }

        } catch (error: any) {
            console.log(`❌ Test failed: ${error.message}`);
        } finally {
            await page.close();
        }

        return results;
    }

    /**
     * Test 2: Use 9anime AJAX API to get servers and sources
     */
    async test9AnimeAPI(animeSlug: string, episodeId: string): Promise<StreamResult[]> {
        console.log('\n' + '='.repeat(70));
        console.log('TEST 2: 9Anime AJAX API');
        console.log('='.repeat(70));

        const results: StreamResult[] = [];

        try {
            // Get servers
            console.log(`\n📡 Fetching servers for episode ${episodeId}...`);
            const serversRes = await axios.get(`${NINE_ANIME_URL}/ajax/episode/servers`, {
                params: { episodeId },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${NINE_ANIME_URL}/watch/${animeSlug}?ep=${episodeId}`
                }
            });

            if (!serversRes.data?.html) {
                console.log('❌ No servers data');
                return results;
            }

            // Parse server IDs from HTML
            const serverIdMatches = serversRes.data.html.matchAll(/data-id="(\d+)"/g);
            const serverIds: string[] = [];
            for (const match of serverIdMatches) {
                serverIds.push(match[1]);
            }

            console.log(`✅ Found ${serverIds.length} servers: ${serverIds.join(', ')}`);

            // Get sources from each server
            for (const serverId of serverIds.slice(0, 3)) { // Test first 3 servers
                console.log(`\n📍 Getting sources from server ${serverId}...`);

                try {
                    const sourcesRes = await axios.get(`${NINE_ANIME_URL}/ajax/episode/sources`, {
                        params: { id: serverId },
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Referer': `${NINE_ANIME_URL}/watch/${animeSlug}?ep=${episodeId}`
                        }
                    });

                    if (sourcesRes.data?.link) {
                        console.log(`📺 Embed URL: ${sourcesRes.data.link.substring(0, 70)}...`);

                        // Extract stream from embed
                        const embedStreams = await this.extractFromEmbed(sourcesRes.data.link);
                        results.push(...embedStreams);
                    }
                } catch (e: any) {
                    console.log(`⚠️ Server ${serverId} failed: ${e.message}`);
                }
            }

        } catch (error: any) {
            console.log(`❌ API test failed: ${error.message}`);
        }

        return results;
    }

    /**
     * Extract streams from an embed URL using puppeteer
     */
    async extractFromEmbed(embedUrl: string): Promise<StreamResult[]> {
        console.log(`\n🔍 Extracting from embed: ${embedUrl.substring(0, 70)}...`);

        const page = await this.createPage();
        const capturedStreams: string[] = [];
        const results: StreamResult[] = [];

        try {
            await page.setRequestInterception(true);

            page.on('request', (request) => {
                const reqUrl = request.url();
                if (reqUrl.includes('.m3u8') && !reqUrl.includes('subtitle')) {
                    if (!capturedStreams.includes(reqUrl)) {
                        console.log(`   🎯 Captured: ${reqUrl.substring(0, 70)}...`);
                        capturedStreams.push(reqUrl);
                    }
                }
                request.continue();
            });

            // Set proper referer
            const origin = new URL(embedUrl).origin;
            await page.setExtraHTTPHeaders({
                'Referer': origin,
                'Origin': origin
            });

            await page.goto(embedUrl, { waitUntil: 'networkidle0', timeout: 45000 });
            await this.delay(8000);

            // Try to get video src
            const videoSrc = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video?.src || video?.currentSrc;
            });

            if (videoSrc && videoSrc.includes('.m3u8') && !capturedStreams.includes(videoSrc)) {
                console.log(`   🎯 Video src: ${videoSrc.substring(0, 70)}...`);
                capturedStreams.push(videoSrc);
            }

            // Test captured URLs
            for (const streamUrl of capturedStreams) {
                const result = await this.testStreamUrl(streamUrl);
                results.push(result);
            }

        } catch (error: any) {
            console.log(`   ⚠️ Embed extraction failed: ${error.message}`);
        } finally {
            await page.close();
        }

        return results;
    }

    /**
     * Test if a stream URL is actually working
     */
    async testStreamUrl(url: string): Promise<StreamResult> {
        console.log(`\n🧪 Testing stream: ${url.substring(0, 70)}...`);

        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
                    'Accept': '*/*',
                    'Referer': 'https://rapid-cloud.co/',
                    'Origin': 'https://rapid-cloud.co'
                },
                timeout: 15000,
                validateStatus: () => true
            });

            const isWorking = response.status === 200;
            const isM3u8 = typeof response.data === 'string' && response.data.includes('#EXTM3U');

            console.log(`   Status: ${response.status} | Valid m3u8: ${isM3u8}`);

            if (isWorking && isM3u8) {
                console.log(`   ✅ STREAM IS WORKING!`);
            } else if (response.status === 403) {
                console.log(`   ❌ Blocked (403 Forbidden)`);
            } else if (response.status === 404) {
                console.log(`   ❌ Not found (404)`);
            }

            return {
                url,
                quality: this.detectQuality(url),
                working: isWorking && isM3u8,
                statusCode: response.status
            };

        } catch (error: any) {
            console.log(`   ❌ Error: ${error.message}`);
            return {
                url,
                quality: 'unknown',
                working: false,
                error: error.message
            };
        }
    }

    private detectQuality(url: string): string {
        if (url.includes('1080')) return '1080p';
        if (url.includes('720')) return '720p';
        if (url.includes('480')) return '480p';
        return 'auto';
    }
}

async function main() {
    console.log('🎬 COMPREHENSIVE STREAM EXTRACTION TEST');
    console.log('='.repeat(70));
    console.log('Testing anime: Spy x Family Part 2, Episode 1');
    console.log('='.repeat(70));

    const tester = new StreamTester();
    const allResults: StreamResult[] = [];

    try {
        await tester.init();

        // Test with Spy x Family Part 2 (from the provided URL)
        const animeSlug = 'spy-x-family-part-2-18152';
        const episodeId = '94360';

        // Run tests
        const test1Results = await tester.test9AnimeExtraction(animeSlug, episodeId);
        allResults.push(...test1Results);

        const test2Results = await tester.test9AnimeAPI(animeSlug, episodeId);
        allResults.push(...test2Results);

        // Summary
        console.log('\n' + '='.repeat(70));
        console.log('FINAL SUMMARY');
        console.log('='.repeat(70));

        const workingStreams = allResults.filter(r => r.working);
        const failedStreams = allResults.filter(r => !r.working);

        console.log(`\n📊 Total streams found: ${allResults.length}`);
        console.log(`✅ Working streams: ${workingStreams.length}`);
        console.log(`❌ Failed streams: ${failedStreams.length}`);

        if (workingStreams.length > 0) {
            console.log('\n🎉 WORKING STREAMS:');
            workingStreams.forEach((s, i) => {
                console.log(`   ${i + 1}. [${s.quality}] ${s.url.substring(0, 70)}...`);
            });
        } else {
            console.log('\n⚠️ No working streams found.');
            console.log('   This may be due to:');
            console.log('   - CDN token expiration');
            console.log('   - Geographic restrictions');
            console.log('   - Anti-bot protection');
            
            console.log('\n📋 Failed streams:');
            failedStreams.forEach((s, i) => {
                console.log(`   ${i + 1}. Status ${s.statusCode}: ${s.url.substring(0, 60)}...`);
            });
        }

    } catch (error: any) {
        console.error('💥 Fatal error:', error.message);
    } finally {
        await tester.close();
    }
}

main();
