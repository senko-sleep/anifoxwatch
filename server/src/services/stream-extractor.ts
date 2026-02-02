/**
 * Stream Extractor Service
 * Uses puppeteer to extract actual working stream URLs from anime sites
 * by capturing network requests with valid tokens
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../utils/logger.js';

interface ExtractedStream {
    url: string;
    quality: string;
    type: 'hls' | 'mp4';
    headers?: Record<string, string>;
}

interface ExtractionResult {
    success: boolean;
    streams: ExtractedStream[];
    subtitles: { url: string; lang: string }[];
    error?: string;
}

class StreamExtractor {
    private browser: Browser | null = null;
    private browserLaunchPromise: Promise<Browser> | null = null;

    /**
     * Get or create browser instance (singleton)
     */
    private async getBrowser(): Promise<Browser> {
        if (this.browser && this.browser.connected) {
            return this.browser;
        }

        if (this.browserLaunchPromise) {
            return this.browserLaunchPromise;
        }

        this.browserLaunchPromise = puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--js-flags="--max-old-space-size=256"'
            ]
        });

        this.browser = await this.browserLaunchPromise;
        this.browserLaunchPromise = null;

        logger.info('[StreamExtractor] Browser launched');
        return this.browser;
    }

    /**
     * Create a new page with proper settings
     */
    private async createPage(): Promise<Page> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        );

        await page.setViewport({ width: 1920, height: 1080 });

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });

        return page;
    }

    /**
     * Extract streams from 9animetv.to episode page
     */
    async extractFrom9Anime(animeSlug: string, episodeId: string): Promise<ExtractionResult> {
        const url = `https://9animetv.to/watch/${animeSlug}?ep=${episodeId}`;
        logger.info(`[StreamExtractor] Extracting from 9anime: ${url}`);

        const page = await this.createPage();
        const streams: ExtractedStream[] = [];
        const subtitles: { url: string; lang: string }[] = [];

        try {
            // Enable request interception to capture m3u8 URLs
            await page.setRequestInterception(true);

            const capturedM3u8s = new Set<string>();
            const capturedSubtitles = new Set<string>();

            page.on('request', (request) => {
                const reqUrl = request.url();

                // Capture m3u8 requests
                if (reqUrl.includes('.m3u8') && !reqUrl.includes('subtitles')) {
                    capturedM3u8s.add(reqUrl);
                    logger.info(`[StreamExtractor] Captured m3u8: ${reqUrl.substring(0, 100)}...`);
                }

                // Capture subtitle requests
                if (reqUrl.includes('.vtt') || reqUrl.includes('.srt') || reqUrl.includes('subtitle')) {
                    capturedSubtitles.add(reqUrl);
                }

                request.continue();
            });

            page.on('response', async (response) => {
                const respUrl = response.url();

                // Capture sources from API responses
                if (respUrl.includes('getSources') || respUrl.includes('sources')) {
                    try {
                        const text = await response.text();
                        // Try to extract m3u8 URLs from JSON response
                        const m3u8Matches = text.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
                        if (m3u8Matches) {
                            m3u8Matches.forEach(url => capturedM3u8s.add(url));
                        }
                    } catch { }
                }
            });

            // Navigate to the page
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 45000
            });

            // Wait for the video player iframe to load
            await page.waitForSelector('iframe', { timeout: 15000 }).catch(() => { });

            // Wait a bit for streams to start loading
            await this.delay(5000);

            // Try clicking play button if video is paused
            try {
                const playBtn = await page.$('.play-btn, .jw-icon-display, [class*="play"], .vjs-big-play-button');
                if (playBtn) {
                    await playBtn.click();
                    await this.delay(3000);
                }
            } catch { }

            // Try to get the iframe src and navigate to it directly
            const iframeSrc = await page.$eval('iframe', (el) => el.src).catch(() => null);

            if (iframeSrc && iframeSrc.includes('embed')) {
                logger.info(`[StreamExtractor] Found embed iframe: ${iframeSrc.substring(0, 80)}...`);

                // Open the iframe in a new page to capture its network requests
                const embedPage = await this.createPage();

                await embedPage.setRequestInterception(true);

                embedPage.on('request', (request) => {
                    const reqUrl = request.url();
                    if (reqUrl.includes('.m3u8') && !reqUrl.includes('subtitles')) {
                        capturedM3u8s.add(reqUrl);
                        logger.info(`[StreamExtractor] Captured from embed: ${reqUrl.substring(0, 100)}...`);
                    }
                    request.continue();
                });

                try {
                    await embedPage.goto(iframeSrc, {
                        waitUntil: 'networkidle0',
                        timeout: 30000
                    });

                    // Wait for video to potentially load
                    await this.delay(8000);

                    // Try to get video src directly
                    const videoSrc = await embedPage.evaluate(() => {
                        const video = document.querySelector('video');
                        return video?.src || video?.currentSrc;
                    });

                    if (videoSrc && videoSrc.includes('.m3u8')) {
                        capturedM3u8s.add(videoSrc);
                    }
                } catch (e) {
                    logger.warn(`[StreamExtractor] Embed page error: ${e}`);
                } finally {
                    await embedPage.close();
                }
            }

            // Convert captured URLs to streams
            for (const m3u8Url of capturedM3u8s) {
                streams.push({
                    url: m3u8Url,
                    quality: this.detectQuality(m3u8Url),
                    type: 'hls'
                });
            }

            for (const subUrl of capturedSubtitles) {
                subtitles.push({
                    url: subUrl,
                    lang: this.detectSubtitleLang(subUrl)
                });
            }

            logger.info(`[StreamExtractor] Extracted ${streams.length} streams, ${subtitles.length} subtitles`);

            return {
                success: streams.length > 0,
                streams,
                subtitles,
                error: streams.length === 0 ? 'No streams found' : undefined
            };

        } catch (error: any) {
            logger.error(`[StreamExtractor] Extraction failed: ${error.message}`);
            return {
                success: false,
                streams: [],
                subtitles: [],
                error: error.message
            };
        } finally {
            await page.close();
        }
    }

    /**
     * Extract stream from embed URL directly (rapid-cloud, megacloud, etc.)
     */
    async extractFromEmbed(embedUrl: string): Promise<ExtractionResult> {
        logger.info(`[StreamExtractor] Extracting from embed: ${embedUrl.substring(0, 80)}...`);

        const page = await this.createPage();
        const streams: ExtractedStream[] = [];
        const subtitles: { url: string; lang: string }[] = [];

        try {
            await page.setRequestInterception(true);

            const capturedM3u8s = new Set<string>();

            page.on('request', (request) => {
                const reqUrl = request.url();
                if (reqUrl.includes('.m3u8') && !reqUrl.includes('subtitles')) {
                    capturedM3u8s.add(reqUrl);
                    logger.info(`[StreamExtractor] Captured: ${reqUrl.substring(0, 100)}...`);
                }
                request.continue();
            });

            // Set referer to the embed's origin
            const embedOrigin = new URL(embedUrl).origin;
            await page.setExtraHTTPHeaders({
                'Referer': embedOrigin,
                'Origin': embedOrigin
            });

            await page.goto(embedUrl, {
                waitUntil: 'networkidle0',
                timeout: 45000
            });

            // Wait for video to load
            await this.delay(10000);

            // Try to click play
            try {
                await page.click('.play-btn, [class*="play"], .jw-icon-display').catch(() => { });
                await this.delay(5000);
            } catch { }

            // Get video src
            const videoSrc = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video?.src || video?.currentSrc;
            });

            if (videoSrc && videoSrc.includes('.m3u8')) {
                capturedM3u8s.add(videoSrc);
            }

            // Check page content for m3u8 URLs
            const pageContent = await page.content();
            const m3u8Matches = pageContent.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g);
            if (m3u8Matches) {
                m3u8Matches.forEach(url => {
                    if (!url.includes('subtitles')) {
                        capturedM3u8s.add(url);
                    }
                });
            }

            for (const m3u8Url of capturedM3u8s) {
                streams.push({
                    url: m3u8Url,
                    quality: this.detectQuality(m3u8Url),
                    type: 'hls'
                });
            }

            return {
                success: streams.length > 0,
                streams,
                subtitles,
                error: streams.length === 0 ? 'No streams found from embed' : undefined
            };

        } catch (error: any) {
            logger.error(`[StreamExtractor] Embed extraction failed: ${error.message}`);
            return {
                success: false,
                streams: [],
                subtitles: [],
                error: error.message
            };
        } finally {
            await page.close();
        }
    }

    /**
     * Try multiple extraction methods and return first working stream
     */
    async extractWithFallbacks(animeSlug: string, episodeId: string): Promise<ExtractionResult> {
        logger.info(`[StreamExtractor] Starting extraction with fallbacks for ${animeSlug} ep ${episodeId}`);

        // Method 1: Direct 9anime extraction
        let result = await this.extractFrom9Anime(animeSlug, episodeId);
        if (result.success) {
            return result;
        }

        // Method 2: Try HiAnime if 9anime fails
        // Convert slug to HiAnime format (remove numeric suffix and use as-is)
        const hiAnimeSlug = animeSlug.replace(/-\d+$/, '');
        result = await this.extractFromHiAnime(hiAnimeSlug, episodeId);
        if (result.success) {
            return result;
        }

        return {
            success: false,
            streams: [],
            subtitles: [],
            error: 'All extraction methods failed'
        };
    }

    /**
     * Extract from HiAnime/Zoro
     */
    async extractFromHiAnime(animeSlug: string, episodeNum: string): Promise<ExtractionResult> {
        // HiAnime uses different URL structure
        const url = `https://hianimez.to/watch/${animeSlug}?ep=${episodeNum}`;
        logger.info(`[StreamExtractor] Trying HiAnime: ${url}`);

        const page = await this.createPage();
        const streams: ExtractedStream[] = [];
        const subtitles: { url: string; lang: string }[] = [];

        try {
            await page.setRequestInterception(true);

            const capturedM3u8s = new Set<string>();

            page.on('request', (request) => {
                const reqUrl = request.url();
                if (reqUrl.includes('.m3u8') && !reqUrl.includes('subtitles')) {
                    capturedM3u8s.add(reqUrl);
                }
                request.continue();
            });

            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 45000
            });

            await this.delay(8000);

            for (const m3u8Url of capturedM3u8s) {
                streams.push({
                    url: m3u8Url,
                    quality: this.detectQuality(m3u8Url),
                    type: 'hls'
                });
            }

            return {
                success: streams.length > 0,
                streams,
                subtitles,
                error: streams.length === 0 ? 'No streams found from HiAnime' : undefined
            };

        } catch (error: any) {
            return {
                success: false,
                streams: [],
                subtitles: [],
                error: error.message
            };
        } finally {
            await page.close();
        }
    }

    private detectQuality(url: string): string {
        if (url.includes('1080') || url.includes('fhd')) return '1080p';
        if (url.includes('720') || url.includes('hd')) return '720p';
        if (url.includes('480') || url.includes('sd')) return '480p';
        if (url.includes('360')) return '360p';
        return 'auto';
    }

    private detectSubtitleLang(url: string): string {
        if (url.includes('english') || url.includes('eng')) return 'English';
        if (url.includes('spanish') || url.includes('spa')) return 'Spanish';
        return 'Unknown';
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Close browser instance
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            logger.info('[StreamExtractor] Browser closed');
        }
    }
}

// Export singleton instance
export const streamExtractor = new StreamExtractor();
