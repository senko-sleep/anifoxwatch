import { logger } from '../utils/logger.js';

let puppeteer: any = null;

/**
 * How long Chromium gets to start. A shared-CPU container (Render's free tier is a fraction of a
 * core) needs far longer than a laptop's few seconds, and giving up early just leaves the first
 * real request to pay for a second attempt.
 */
const LAUNCH_TIMEOUT_MS = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS) || (process.env.NODE_ENV === 'production' ? 60_000 : 20_000);

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
    private browser: any = null;
    private browserLaunchPromise: Promise<any> | null = null;
    // In-flight deduplication: if the same embed URL is being extracted concurrently,
    // share the result instead of launching multiple Puppeteer pages.
    private inFlight: Map<string, Promise<ExtractionResult>> = new Map();
    private resultCache: Map<string, { result: ExtractionResult; timestamp: number }> = new Map();
    private readonly RESULT_CACHE_TTL_MS = 30 * 60 * 1000;

    // ─── Launch circuit breaker ─────────────────────────────────────────────
    // A host that cannot run Chromium cannot run it on the next request either, and every
    // doomed attempt costs the caller the full LAUNCH_TIMEOUT_MS. That budget belongs to the
    // sources that need no browser (Yomi, Anichi resolve over plain HTTP in about a second):
    // if a launch failure is allowed to burn it, a *recoverable* episode 404s instead.
    // So after a failure the breaker opens and launches fail instantly until it is due to
    // retry, backing off 30s → 1m → 2m → … → 15m.
    private launchFailures = 0;
    private retryLaunchAt = 0;
    private static readonly BREAKER_BASE_MS = 30_000;
    private static readonly BREAKER_MAX_MS = 15 * 60_000;

    /** Whether a launch may be attempted now, i.e. the breaker is closed or due to retry. */
    private launchAllowed(): boolean {
        return this.launchFailures === 0 || Date.now() >= this.retryLaunchAt;
    }

    private openBreaker(): void {
        this.launchFailures += 1;
        const backoff = Math.min(
            StreamExtractor.BREAKER_BASE_MS * 2 ** (this.launchFailures - 1),
            StreamExtractor.BREAKER_MAX_MS
        );
        this.retryLaunchAt = Date.now() + backoff;
        logger.warn(
            `[StreamExtractor] Browser unavailable (failure ${this.launchFailures}); ` +
            `skipping extraction for ${Math.round(backoff / 1000)}s`
        );
    }


    /** Pre-launch Puppeteer so the first watch request avoids a 10–15s cold start. */
    async warmBrowser(): Promise<void> {
        try {
            await this.getBrowser();
        } catch (error) {
            logger.warn(`[StreamExtractor] Browser warm-up failed: ${error}`);
        }
    }

    /**
     * Get or create browser instance (singleton)
     */
    private async getBrowser(): Promise<any> {
        if (this.browser && this.browser.connected) {
            return this.browser;
        }

        // A browser that died (Chromium is the first thing the OOM killer takes on a small
        // container) must not be held on to, or every later extraction reuses the corpse.
        if (this.browser) {
            this.browser = null;
        }

        if (this.browserLaunchPromise) {
            return this.browserLaunchPromise;
        }

        if (!this.launchAllowed()) {
            throw new Error(`Browser unavailable (retrying in ${Math.round((this.retryLaunchAt - Date.now()) / 1000)}s)`);
        }

        try {
            if (!puppeteer) {
                const puppeteerModuleName = 'puppeteer';
                puppeteer = (await import(puppeteerModuleName)).default;
            }
            const launchPromise = puppeteer.launch({
                headless: true,
                // Puppeteer's own limit is 30s and would fire before ours, so it is set to match.
                timeout: LAUNCH_TIMEOUT_MS,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    // 1920x1080 buys nothing here — nothing is ever rendered for a human, and the
                    // backing store is paid for in the memory the launch is already short of.
                    '--window-size=1280,720',
                    '--disable-web-security',
                    '--js-flags="--max-old-space-size=256"',
                    '--no-zygote',
                    // Startup work that only pays off for an interactive browser. On a shared
                    // core each of these is a slice of the launch budget spent on nothing.
                    '--disable-extensions',
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-breakpad',
                    '--disable-crash-reporter',
                    '--disable-component-update',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--metrics-recording-only',
                    '--mute-audio'
                ]
            });

            let timedOut = false;
            this.browserLaunchPromise = Promise.race([
                launchPromise,
                new Promise<any>((_, reject) => setTimeout(() => {
                    timedOut = true;
                    reject(new Error(`Puppeteer launch timeout (${LAUNCH_TIMEOUT_MS}ms)`));
                }, LAUNCH_TIMEOUT_MS + 5000))
            ]);

            // Losing the race abandons the launch but not the process: a Chromium that starts
            // a second late would otherwise stay resident for the life of the server, and on a
            // 512MB container a couple of those are the difference between slow and OOM-killed.
            launchPromise.then(
                (late: any) => { if (timedOut) late.close().catch(() => {}); },
                () => {}
            );

            this.browser = await this.browserLaunchPromise;
            this.launchFailures = 0;
            this.browser.once('disconnected', () => {
                logger.warn('[StreamExtractor] Browser disconnected — next request relaunches');
                this.browser = null;
            });
            logger.info('[StreamExtractor] Browser launched');
            return this.browser;
        } catch (error) {
            this.openBreaker();
            logger.error(`[StreamExtractor] Failed to launch browser: ${error}`);
            throw error;
        } finally {
            // Cleared either way: kept after a success it would hand out a stale browser
            // forever, and kept after a failure it would serve the same rejection forever.
            this.browserLaunchPromise = null;
        }
    }

    private activePages = 0;
    private readonly MAX_CONCURRENT_PAGES = process.env.NODE_ENV === 'production' ? 2 : 4;
    /** How long to wait for a page slot before giving the caller its time back. */
    private readonly PAGE_SLOT_WAIT_MS = Number(process.env.PAGE_SLOT_WAIT_MS) || 12_000;

    /**
     * Create a new page with proper settings
     */
    private async createPage(): Promise<any> {
        // Simple concurrency limit - reduced delay from 500ms to 100ms.
        // Bounded, because this loop has no other exit: if pages are ever leaked, an unbounded
        // wait turns "some extractions are slow" into "every later request hangs forever", and
        // the request that finally notices is one that did nothing wrong. Failing here instead
        // lets the caller fall back to a source that needs no browser.
        const waitStarted = Date.now();
        while (this.activePages >= this.MAX_CONCURRENT_PAGES) {
            if (Date.now() - waitStarted > this.PAGE_SLOT_WAIT_MS) {
                throw new Error(
                    `No page slot after ${this.PAGE_SLOT_WAIT_MS}ms (${this.activePages}/${this.MAX_CONCURRENT_PAGES} busy)`
                );
            }
            await this.delay(100);
        }
        this.activePages++;

        try {
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
        } catch (error) {
            this.activePages--;
            throw error;
        }
    }

    /**
     * Extract streams from a Zoro-style watch site (9anime, Kaido, etc.)
     */
    async extractFrom9Anime(animeSlug: string, episodeId: string, watchBaseUrl: string = 'https://9animetv.to'): Promise<ExtractionResult> {
        const url = `${watchBaseUrl.replace(/\/$/, '')}/watch/${animeSlug}?ep=${episodeId}`;
        logger.info(`[StreamExtractor] Extracting from watch site (${watchBaseUrl}): ${url}`);

        let page: any = null;
        const streams: ExtractedStream[] = [];
        const subtitles: { url: string; lang: string }[] = [];

        try {
            page = await this.createPage();
            // Enable request interception to capture m3u8 URLs
            await page.setRequestInterception(true);

            const capturedM3u8s = new Set<string>();
            const capturedSubtitles = new Set<string>();

            const looksLikeHls = (reqUrl: string) => {
                const u = reqUrl.toLowerCase();
                if (u.includes('subtitle') || u.includes('thumb')) return false;
                return (
                    u.includes('.m3u8') ||
                    u.includes('/hls/') ||
                    u.includes('application/x-mpegurl') ||
                    /\/playlist\.?[a-z0-9]*$/i.test(reqUrl)
                );
            };

            page.on('request', (request: any) => {
                const reqUrl = request.url();

                if (looksLikeHls(reqUrl)) {
                    capturedM3u8s.add(reqUrl);
                    logger.info(`[StreamExtractor] Captured m3u8: ${reqUrl.substring(0, 100)}...`);
                }

                // Capture subtitle requests
                if (reqUrl.includes('.vtt') || reqUrl.includes('.srt') || reqUrl.includes('subtitle')) {
                    capturedSubtitles.add(reqUrl);
                }

                request.continue();
            });

            page.on('response', async (response: any) => {
                const respUrl = response.url();

                // Capture sources from API responses
                if (respUrl.includes('getSources') || respUrl.includes('sources')) {
                    try {
                        const text = await response.text();
                        // Try to extract m3u8 URLs from JSON response
                        const m3u8Matches = text.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
                        if (m3u8Matches) {
                            m3u8Matches.forEach((url: string) => capturedM3u8s.add(url));
                        }
                    } catch { }
                }
            });

            const isAniwatchFamily = 
                /aniwatch|zoro\.to|9anime|aniwave/i.test(watchBaseUrl) ||
                /aniwatch|aniwave/i.test(url);

            // Aniwatch pages keep long-polling; networkidle2 often never resolves. Use DOM + extra soak time.
            try {
                await page.goto(url, {
                    waitUntil: isAniwatchFamily ? 'domcontentloaded' : 'networkidle2',
                    timeout: isAniwatchFamily ? 90_000 : 60_000, // Increased for adult content
                });
            } catch (navError: any) {
                logger.warn(`[StreamExtractor] 9Anime page navigation timeout, proceeding: ${navError.message}`);
            }

            await page.waitForSelector('iframe', { timeout: 30_000 }).catch(() => {});

            // Increased soak time for adult content compatibility
            await this.delay(isAniwatchFamily ? 10_000 : 6000);

            // Try clicking play button if video is paused
            try {
                const playBtn = await page.$('.play-btn, .jw-icon-display, [class*="play"], .vjs-big-play-button');
                if (playBtn) {
                    await playBtn.click();
                    await this.delay(3000);
                }
            } catch { }

            // Try to get the iframe src and navigate to it directly
            const iframeSrc = await page.$eval('iframe', (el: any) => el.src).catch(() => null);

            if (iframeSrc && iframeSrc.includes('embed')) {
                logger.info(`[StreamExtractor] Found embed iframe: ${iframeSrc.substring(0, 80)}...`);

                // Open the iframe in a new page to capture its network requests
                const embedPage = await this.createPage();

                await embedPage.setRequestInterception(true);

                embedPage.on('request', (request: any) => {
                    const reqUrl = request.url();
                    if (looksLikeHls(reqUrl)) {
                        capturedM3u8s.add(reqUrl);
                        logger.info(`[StreamExtractor] Captured from embed: ${reqUrl.substring(0, 100)}...`);
                    }
                    request.continue();
                });

                try {
                    await embedPage.goto(iframeSrc, {
                        waitUntil: isAniwatchFamily ? 'domcontentloaded' : 'networkidle0',
                        timeout: isAniwatchFamily ? 45_000 : 30_000,
                    });

                    // Dynamic polling to avoid unnecessary delay when stream is already captured
                    let m3u8WaitTime = 0;
                    const maxWait = isAniwatchFamily ? 10_000 : 8000;
                    while (capturedM3u8s.size === 0 && m3u8WaitTime < maxWait) {
                        await this.delay(200);
                        m3u8WaitTime += 200;
                    }

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
                    this.activePages--;
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
            if (page) {
                this.activePages--;
                await page.close();
            }
        }
    }

    /** Same player layout as 9animetv; uses kaido.to watch URLs */
    extractFromKaido(animeSlug: string, episodeId: string): Promise<ExtractionResult> {
        return this.extractFrom9Anime(animeSlug, episodeId, 'https://kaido.to');
    }

    /**
     * Extract stream from embed URL directly (rapid-cloud, megacloud, etc.)
     * Uses in-flight deduplication: concurrent calls for the same URL share one Puppeteer session.
     * Enhanced for adult content compatibility.
     */
    async extractFromEmbed(embedUrl: string, timeoutMs?: number): Promise<ExtractionResult> {
        const cached = this.resultCache.get(embedUrl);
        if (cached && Date.now() - cached.timestamp < this.RESULT_CACHE_TTL_MS && cached.result.success) {
            logger.info(`[StreamExtractor] Cache hit for embed: ${embedUrl.substring(0, 80)}...`);
            return cached.result;
        }

        // Fail instantly rather than queueing behind a launch that is known to be failing,
        // so the caller still has its time budget left for the browser-free sources.
        if (!this.browser && !this.browserLaunchPromise && !this.launchAllowed()) {
            return { success: false, streams: [], subtitles: [], error: 'Browser unavailable' };
        }

        // Dedup: return an existing in-flight extraction for the same URL
        const existing = this.inFlight.get(embedUrl);
        if (existing) {
            logger.info(`[StreamExtractor] Reusing in-flight extraction for: ${embedUrl.substring(0, 80)}...`);
            return existing;
        }

        logger.info(`[StreamExtractor] Extracting from embed: ${embedUrl.substring(0, 80)}...`);

        const extractionPromise = this._extractFromEmbedImpl(embedUrl, timeoutMs)
            .then((result) => {
                if (result.success && result.streams.length > 0) {
                    this.resultCache.set(embedUrl, { result, timestamp: Date.now() });
                }
                return result;
            });
        this.inFlight.set(embedUrl, extractionPromise);

        try {
            return await extractionPromise;
        } finally {
            this.inFlight.delete(embedUrl);
        }
    }

    private async _extractFromEmbedImpl(embedUrl: string, timeoutMs?: number): Promise<ExtractionResult> {
        let page: any = null;
        // A caller that only has a few seconds to spend must not simply walk away from this:
        // the page would stay open until its own navigation timeout, holding one of very few
        // slots. So the deadline is enforced here, where the `finally` below still closes it.
        let deadline: NodeJS.Timeout | undefined;
        let timedOut = false;
        const streams: ExtractedStream[] = [];
        const subtitles: { url: string; lang: string }[] = [];

        try {
            page = await this.createPage();

            // Closing the page is what actually stops the work: every await inside this method
            // is a page operation, so they reject as soon as it goes, and control reaches the
            // `finally` that releases the slot. Whatever the player already requested by then is
            // still in `streams`, so a deadline can still produce a usable result.
            if (timeoutMs && timeoutMs > 0) {
                deadline = setTimeout(() => {
                    timedOut = true;
                    logger.warn(`[StreamExtractor] Deadline ${timeoutMs}ms reached, closing page for ${embedUrl.substring(0, 60)}`);
                    page?.close().catch(() => {});
                }, timeoutMs);
                deadline.unref?.();
            }

            await page.setRequestInterception(true);

            const capturedM3u8s = new Set<string>();

            page.on('request', (request: any) => {
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

            try {
                await page.goto(embedUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000  // Increased for adult content compatibility
                });

                // Wait for video to load or m3u8 to be captured (dynamic polling)
                let m3u8WaitTime = 0;
                while (capturedM3u8s.size === 0 && m3u8WaitTime < 6000) {
                    await this.delay(200);
                    m3u8WaitTime += 200;
                }

                if (capturedM3u8s.size === 0) {
                    // Try to click play
                    try {
                        await page.click('.play-btn, [class*="play"], .jw-icon-display').catch(() => { });
                        let playWaitTime = 0;
                        while (capturedM3u8s.size === 0 && playWaitTime < 8000) {
                            await this.delay(200);
                            playWaitTime += 200;
                        }
                    } catch { }
                }
            } catch (navError: any) {
                logger.warn(`[StreamExtractor] Embed page navigation timeout, but proceeding with captured streams: ${navError.message}`);
            }


            // Get video src
            const videoSrc = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video?.src || video?.currentSrc;
            }).catch(() => null);

            if (videoSrc && videoSrc.includes('.m3u8')) {
                capturedM3u8s.add(videoSrc);
            }

            // Check page content for m3u8 URLs
            const pageContent = await page.content();
            const m3u8Matches = pageContent.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g);
            if (m3u8Matches) {
                m3u8Matches.forEach((url: string) => {
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
            // When the deadline closed the page, the rejection is the closure, not the cause.
            // Anything the player already requested is still worth returning.
            if (timedOut) {
                logger.warn(`[StreamExtractor] Deadline hit with ${streams.length} stream(s) captured`);
                return {
                    success: streams.length > 0,
                    streams,
                    subtitles,
                    error: streams.length === 0 ? `Extraction deadline (${timeoutMs}ms)` : undefined
                };
            }
            logger.error(`[StreamExtractor] Embed extraction failed: ${error.message}`);
            return {
                success: false,
                streams: [],
                subtitles: [],
                error: error.message
            };
        } finally {
            if (deadline) clearTimeout(deadline);
            if (page) {
                this.activePages--;
                // Already closed by the deadline, or closed with the browser; either way the
                // slot above is what mattered and it is released regardless.
                await page.close().catch(() => {});
            }
        }
    }

    /**
     * Try multiple extraction methods and return first working stream
     */
    async extractWithFallbacks(animeSlug: string, episodeId: string): Promise<ExtractionResult> {
        logger.info(`[StreamExtractor] Starting extraction with fallbacks for ${animeSlug} ep ${episodeId}`);

        const result = await this.extractFrom9Anime(animeSlug, episodeId);
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
     * Can Chromium actually start here? Stream extraction for the mainstream sources is built on
     * it, so on a host where it cannot launch every anime episode returns no sources, and the only
     * evidence in the logs is a generic "no streams extracted".
     */
    async probe(): Promise<{ ok: boolean; ms: number; version?: string; error?: string }> {
        const started = Date.now();
        try {
            const browser = await this.getBrowser();
            return { ok: true, ms: Date.now() - started, version: await browser.version() };
        } catch (error: any) {
            return { ok: false, ms: Date.now() - started, error: error?.message ?? String(error) };
        }
    }

    /**
     * Close browser instance
     */
    async close(): Promise<void> {
        this.browserLaunchPromise = null;
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            logger.info('[StreamExtractor] Browser closed');
        }
    }
}

// Export singleton instance
export const streamExtractor = new StreamExtractor();
