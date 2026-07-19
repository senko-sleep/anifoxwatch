import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

let puppeteerExtra: any = null;
let stealthPlugin: any = null;

async function getPuppeteerExtra() {
    if (!puppeteerExtra) {
        try {
            puppeteerExtra = (await import('puppeteer-extra')).default;
            stealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
            puppeteerExtra.use(stealthPlugin());
        } catch (e) {
            return null;
        }
    }
    return puppeteerExtra;
}

export class YomiSource extends BaseAnimeSource {
    name = 'Yomi';
    baseUrl = 'https://yomi.to';
    private client: AxiosInstance;

    private cache: Map<string, { data: any; expires: number }> = new Map();
    private cacheTTL = {
        search: 5 * 60 * 1000,
        anime: 30 * 60 * 1000,
        episodes: 30 * 60 * 1000,
        stream: 6 * 60 * 60 * 1000,
        servers: 4 * 60 * 60 * 1000,
    };

    private browser: any = null;
    private browserLaunchPromise: Promise<any> | null = null;

    constructor() {
        super();
        const keepAliveAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 15,
            timeout: 12000,
        });
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 7000,
            httpsAgent: keepAliveAgent,
            headers: {
                'Accept': 'application/json, text/html',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
    }

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.data as T;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: any, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    private extractAnilistId(episodeId: string): number | null {
        const m = /^anilist-(\d+)/i.exec(episodeId);
        return m ? parseInt(m[1], 10) : null;
    }

    private extractEpisodeNum(episodeId: string, options?: SourceRequestOptions): number {
        if (options?.episodeNum && Number.isFinite(options.episodeNum) && options.episodeNum > 0) {
            return options.episodeNum;
        }
        const m = /\$ep=(\d+)/i.exec(episodeId) || /[?&]eps?=(\d+)/i.exec(episodeId) || /ep-(\d+)/i.exec(episodeId);
        return m ? parseInt(m[1], 10) : 1;
    }

    private buildYomiServers(anilistId: number, episodeNum: number, category: 'sub' | 'dub'): { name: string; url: string }[] {
        const type = category === 'dub' ? 'dub' : 'sub';
        return [
            { name: 'Yomi-VidNest', url: `https://vidnest.fun/animepahe/${anilistId}/${episodeNum}/${type}` },
            { name: 'Yomi-TryEmbed', url: `https://tryembed.us.cc/embed/anime/${anilistId}/${episodeNum}/${type}` },
        ];
    }

    private async getBrowser() {
        if (this.browser && this.browser.connected) {
            return this.browser;
        }
        if (this.browserLaunchPromise) {
            return this.browserLaunchPromise;
        }
        const pptr = await getPuppeteerExtra();
        if (!pptr) return null;

        this.browserLaunchPromise = pptr.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        }).catch((e: any) => {
            this.browserLaunchPromise = null;
            logger.warn(`[Yomi] Browser launch failed: ${e.message}`, undefined, 'Yomi');
            return null;
        });

        this.browser = await this.browserLaunchPromise;
        this.browserLaunchPromise = null;
        return this.browser;
    }

    private async extractFromPage(embedUrl: string): Promise<{ url: string; quality: string } | null> {
        const browser = await this.getBrowser();
        if (!browser) return null;

        let page: any = null;
        try {
            page = await browser.newPage();
            await page.setRequestInterception(true);
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            });

            const m3u8s = new Set<string>();
            page.on('request', (req: any) => {
                const u = req.url();
                if (u.includes('.m3u8') || u.includes('m3u8')) m3u8s.add(u);
                req.continue();
            });

            page.on('response', async (res: any) => {
                const u = res.url();
                if (u.includes('.m3u8') || u.includes('m3u8')) m3u8s.add(u);
                try {
                    const ct = res.headers()['content-type'] || '';
                    if (ct.includes('json') || ct.includes('javascript')) {
                        const txt = await res.text();
                        const matches = txt.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
                        if (matches) matches.forEach((m: string) => m3u8s.add(m));
                    }
                } catch { }
            });

            const embedOrigin = new URL(embedUrl).origin;
            await page.setExtraHTTPHeaders({ Referer: embedOrigin, Origin: embedOrigin });

            try {
                await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
            } catch (navError: any) {
                logger.warn(`[Yomi] Navigation timeout for ${embedUrl}: ${navError.message}`, undefined, 'Yomi');
            }

            await new Promise(r => setTimeout(r, 4000));

            const videoSrc = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video?.src || video?.currentSrc || null;
            }).catch(() => null);

            if (videoSrc && videoSrc.includes('.m3u8')) {
                m3u8s.add(videoSrc);
            }

            const pageContent = await page.content();
            const m3u8Matches = pageContent.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g);
            if (m3u8Matches) {
                m3u8Matches.forEach((url: string) => {
                    if (!url.includes('subtitles')) m3u8s.add(url);
                });
            }

            const result = [...m3u8s][0] || null;
            await page.close();
            return result ? { url: result, quality: 'auto' } : null;
        } catch (error: any) {
            logger.warn(`[Yomi] Extraction failed for ${embedUrl}: ${error.message}`, undefined, 'Yomi');
            try { await page?.close(); } catch { }
            return null;
        }
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await this.client.get('/', { timeout: 15000, signal: options?.signal });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        return null;
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        return [];
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getTopRated(page: number = 1, limit: number = 24, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }

    async getStreamingLinks(episodeId: string, serverId?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const anilistId = this.extractAnilistId(episodeId);
        if (!anilistId) {
            return { sources: [], subtitles: [] };
        }

        const cacheKey = `stream:${anilistId}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        const episodeNum = this.extractEpisodeNum(episodeId, options);
        const servers = this.buildYomiServers(anilistId, episodeNum, category);
        const sources: VideoSource[] = [];
        const subtitles: { url: string; lang: string }[] = [];

        logger.info(`[Yomi] Resolving anilist-${anilistId} ep${episodeNum} (${category}) via ${servers.map(s => s.name).join(', ')}`, undefined, 'Yomi');

        // Race VidNest and TryEmbed in parallel, return first success
        const racePromises = servers.map(async (server) => {
            try {
                const result = await this.extractFromPage(server.url);
                if (result) {
                    return { server: server.name, url: result.url };
                }
            } catch (e) {
                logger.warn(`[Yomi] Extraction failed for ${server.name}: ${(e as Error).message}`, undefined, 'Yomi');
            }
            return null;
        });

        const results = await Promise.race([
            Promise.all(racePromises),
            new Promise<Array<{ server: string; url: string } | null>>((resolve) => {
                setTimeout(() => resolve(Array(servers.length).fill(null)), 20000);
            })
        ]);

        for (const result of results) {
            if (result) {
                sources.push({
                    url: result.url,
                    quality: 'auto' as const,
                    isM3U8: result.url.includes('.m3u8'),
                    isEmbed: false,
                    isDirect: false,
                    server: result.server,
                });
            }
        }

        const response: StreamingData = {
            sources,
            subtitles,
            source: sources.length > 0 ? 'Yomi' : undefined,
            category: category,
        };

        if (sources.length > 0) {
            this.setCache(cacheKey, response, this.cacheTTL.stream);
        }

        return response;
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const anilistId = this.extractAnilistId(episodeId);
        if (!anilistId) return [];

        const episodeNum = this.extractEpisodeNum(episodeId, options);
        const servers = this.buildYomiServers(anilistId, episodeNum, 'sub');
        return servers.map((s, i) => ({
            name: s.name,
            url: `yomi-${anilistId}-${episodeNum}-${i}`,
            type: 'sub' as const,
        }));
    }
}
