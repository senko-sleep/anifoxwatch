/**
 * RapidCloud Stream Extraction Test
 * Captures ALL network requests to find the sources API endpoint
 */

import puppeteer, { Browser, Page, HTTPRequest, HTTPResponse } from 'puppeteer';
import axios from 'axios';

const NINE_ANIME_URL = 'https://9animetv.to';

class RapidCloudExtractor {
    private browser: Browser | null = null;

    async init() {
        console.log('🚀 Launching browser (non-headless for debugging)...');
        this.browser = await puppeteer.launch({
            headless: false, // Show browser for debugging
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--window-size=1280,720'
            ]
        });
        console.log('✅ Browser launched\n');
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('\n🔒 Browser closed');
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract from rapid-cloud embed by monitoring ALL network requests
     */
    async extractFromRapidCloud(embedUrl: string): Promise<{ streams: string[], apiResponses: any[] }> {
        console.log(`\n📺 Analyzing RapidCloud embed: ${embedUrl.substring(0, 70)}...`);

        if (!this.browser) throw new Error('Browser not initialized');
        
        const page = await this.browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        );
        await page.setViewport({ width: 1280, height: 720 });

        const capturedStreams: string[] = [];
        const capturedApis: any[] = [];
        const allRequests: string[] = [];

        try {
            // Enable request interception
            await page.setRequestInterception(true);

            // Capture ALL requests
            page.on('request', (request: HTTPRequest) => {
                const url = request.url();
                allRequests.push(url);

                // Log interesting URLs
                if (url.includes('getSources') || url.includes('source') || url.includes('m3u8') || 
                    url.includes('master') || url.includes('ajax') || url.includes('api')) {
                    console.log(`📤 Request: ${url.substring(0, 100)}`);
                }

                request.continue();
            });

            // Capture ALL responses
            page.on('response', async (response: HTTPResponse) => {
                const url = response.url();
                const contentType = response.headers()['content-type'] || '';

                // Capture m3u8 files
                if (url.includes('.m3u8')) {
                    console.log(`🎯 M3U8 found: ${url.substring(0, 80)}...`);
                    capturedStreams.push(url);
                }

                // Capture JSON responses that might contain sources
                if (contentType.includes('json') || url.includes('getSources') || url.includes('source')) {
                    try {
                        const text = await response.text();
                        if (text.includes('sources') || text.includes('m3u8') || text.includes('file')) {
                            console.log(`📦 API Response from: ${url.substring(0, 60)}`);
                            console.log(`   Content: ${text.substring(0, 300)}...`);
                            capturedApis.push({ url, data: text });

                            // Try to extract m3u8 URLs
                            const m3u8Matches = text.match(/https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g);
                            if (m3u8Matches) {
                                m3u8Matches.forEach(m => {
                                    console.log(`   🎯 Found m3u8: ${m.substring(0, 70)}...`);
                                    capturedStreams.push(m);
                                });
                            }
                        }
                    } catch {}
                }
            });

            // Navigate to embed
            console.log('\n⏳ Loading embed page...');
            await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // Wait for video player to initialize
            console.log('⏳ Waiting for player initialization...');
            await this.delay(5000);

            // Try clicking play if there's a play button
            try {
                const playButton = await page.$('.play-btn, .vjs-big-play-button, [class*="play"]');
                if (playButton) {
                    console.log('▶️ Clicking play button...');
                    await playButton.click();
                    await this.delay(5000);
                }
            } catch {}

            // Check for video element
            const videoInfo = await page.evaluate(() => {
                const video = document.querySelector('video');
                if (video) {
                    return {
                        src: video.src,
                        currentSrc: video.currentSrc,
                        readyState: video.readyState,
                        networkState: video.networkState
                    };
                }
                return null;
            });

            if (videoInfo) {
                console.log(`\n📺 Video element found:`);
                console.log(`   src: ${videoInfo.src?.substring(0, 70) || 'none'}`);
                console.log(`   currentSrc: ${videoInfo.currentSrc?.substring(0, 70) || 'none'}`);
                console.log(`   readyState: ${videoInfo.readyState}`);

                if (videoInfo.src?.includes('.m3u8')) {
                    capturedStreams.push(videoInfo.src);
                }
                if (videoInfo.currentSrc?.includes('.m3u8') && videoInfo.currentSrc !== videoInfo.src) {
                    capturedStreams.push(videoInfo.currentSrc);
                }
            }

            // Check page source for m3u8 URLs
            const pageContent = await page.content();
            const m3u8InPage = pageContent.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g);
            if (m3u8InPage) {
                m3u8InPage.forEach(url => {
                    if (!capturedStreams.includes(url)) {
                        console.log(`🔍 Found in page source: ${url.substring(0, 70)}...`);
                        capturedStreams.push(url);
                    }
                });
            }

            console.log(`\n📊 Total requests made: ${allRequests.length}`);

        } catch (error: any) {
            console.error(`❌ Error: ${error.message}`);
        } finally {
            await page.close();
        }

        return { streams: [...new Set(capturedStreams)], apiResponses: capturedApis };
    }

    /**
     * Get embed URLs from 9anime
     */
    async get9AnimeEmbeds(animeSlug: string, episodeId: string): Promise<string[]> {
        console.log(`\n📡 Getting embed URLs from 9anime for episode ${episodeId}...`);
        const embedUrls: string[] = [];

        try {
            // Get servers
            const serversRes = await axios.get(`${NINE_ANIME_URL}/ajax/episode/servers`, {
                params: { episodeId },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${NINE_ANIME_URL}/watch/${animeSlug}?ep=${episodeId}`
                }
            });

            if (!serversRes.data?.html) return embedUrls;

            // Extract server IDs
            const serverIds = [...serversRes.data.html.matchAll(/data-id="(\d+)"/g)].map(m => m[1]);
            console.log(`   Found ${serverIds.length} servers`);

            // Get embed URL from each server
            for (const serverId of serverIds) {
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
                        embedUrls.push(sourcesRes.data.link);
                        console.log(`   Server ${serverId}: ${sourcesRes.data.link.substring(0, 60)}...`);
                    }
                } catch {}
            }

        } catch (error: any) {
            console.error(`❌ Error getting embeds: ${error.message}`);
        }

        return embedUrls;
    }
}

async function main() {
    console.log('🎬 RAPIDCLOUD STREAM EXTRACTION TEST');
    console.log('='.repeat(70));

    const extractor = new RapidCloudExtractor();

    try {
        await extractor.init();

        // Get embed URLs from 9anime
        const animeSlug = 'spy-x-family-part-2-18152';
        const episodeId = '94360';

        const embedUrls = await extractor.get9AnimeEmbeds(animeSlug, episodeId);

        if (embedUrls.length === 0) {
            console.log('❌ No embed URLs found');
            return;
        }

        // Try extracting from first embed
        const result = await extractor.extractFromRapidCloud(embedUrls[0]);

        console.log('\n' + '='.repeat(70));
        console.log('RESULTS');
        console.log('='.repeat(70));

        if (result.streams.length > 0) {
            console.log(`\n✅ Found ${result.streams.length} stream URLs:`);
            result.streams.forEach((url, i) => {
                console.log(`   ${i + 1}. ${url.substring(0, 100)}...`);
            });

            // Test if streams work
            console.log('\n🧪 Testing stream URLs...');
            for (const url of result.streams) {
                try {
                    const res = await axios.get(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0',
                            'Referer': 'https://rapid-cloud.co/'
                        },
                        timeout: 10000,
                        validateStatus: () => true
                    });

                    const isM3u8 = typeof res.data === 'string' && res.data.includes('#EXTM3U');
                    console.log(`   Status ${res.status} | Valid: ${isM3u8} | ${url.substring(0, 60)}...`);

                    if (res.status === 200 && isM3u8) {
                        console.log('\n🎉 WORKING STREAM FOUND!');
                        console.log(`   ${url}`);
                        break;
                    }
                } catch (e: any) {
                    console.log(`   Error: ${e.message} | ${url.substring(0, 60)}...`);
                }
            }
        } else {
            console.log('\n❌ No stream URLs captured');
            console.log('   The rapid-cloud player may be using encrypted sources');
        }

        if (result.apiResponses.length > 0) {
            console.log(`\n📦 Captured ${result.apiResponses.length} API responses`);
        }

    } finally {
        await extractor.close();
    }
}

main();
