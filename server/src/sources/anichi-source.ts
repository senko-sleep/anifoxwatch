import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer, VideoSubtitle } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import * as cheerio from 'cheerio';

let puppeteer: any = null;

export class AnichiSource extends BaseAnimeSource {
    name = 'Anichi';
    baseUrl = 'https://anichi.to';

    private cache: Map<string, { data: any; expires: number }> = new Map();
    private readonly CACHE_TTL = 15 * 60 * 1000;

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) return entry.data as T;
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: any, ttl: number = this.CACHE_TTL): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    private async getBrowser() {
        if (!puppeteer) {
            const puppeteerModuleName = 'puppeteer';
            puppeteer = (await import(puppeteerModuleName)).default;
        }
        return await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-web-security'
            ]
        });
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        let browser;
        try {
            browser = await this.getBrowser();
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
            const resp = await page.goto('https://anichi.to', { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.close();
            return resp.status() === 200;
        } catch {
            return false;
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }

    async search(query: string, pageNum: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${pageNum}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        let browser;
        try {
            browser = await this.getBrowser();
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

            const searchUrl = `${this.baseUrl}/search?keyword=${encodeURIComponent(query)}`;
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });

            const content = await page.content();
            await page.close();

            const $ = cheerio.load(content);
            const results: AnimeBase[] = [];

            $('a[href*="/watch/"]').each((_, el) => {
                const href = $(el).attr('href') || '';
                const match = /\/watch\/([^/]+)/.exec(href);
                if (match) {
                    const slug = match[1];
                    const id = `anichi-${slug}`;
                    if (!results.some(r => r.id === id)) {
                        const title = $(el).text().trim() || slug.replace(/-/g, ' ');
                        const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
                        results.push({
                            id,
                            title,
                            image: img,
                            cover: img,
                            description: '',
                            status: 'Ongoing' as const,
                            type: 'TV' as const,
                            episodes: 0,
                            genres: [],
                            source: this.name
                        });
                    }
                }
            });

            const result: AnimeSearchResult = {
                results,
                currentPage: pageNum,
                totalPages: 1,
                hasNextPage: false,
                totalResults: results.length,
                source: this.name
            };
            this.setCache(cacheKey, result);
            return result;

        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], currentPage: pageNum, totalPages: 1, hasNextPage: false, totalResults: 0, source: this.name };
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const cleanId = id.replace(/^anichi-/, '');
        const episodes = await this.getEpisodes(id, options);
        return {
            id: `anichi-${cleanId}`,
            title: cleanId.replace(/-/g, ' ').toUpperCase(),
            image: '',
            description: '',
            status: 'Ongoing',
            type: 'TV',
            episodes: episodes.length,
            genres: [],
            source: this.name
        };
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cleanId = animeId.replace(/^anichi-/, '');
        const cacheKey = `episodes:${cleanId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        let browser;
        try {
            browser = await this.getBrowser();
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

            const watchUrl = `${this.baseUrl}/watch/${cleanId}/ep-1`;
            await page.goto(watchUrl, { waitUntil: 'networkidle2', timeout: 25000 });

            const content = await page.content();
            await page.close();

            const $ = cheerio.load(content);
            const episodes: Episode[] = [];

            $('a[href*="/watch/"][href*="/ep-"], .ep-item, [data-ep-id]').each((_, el) => {
                const href = $(el).attr('href') || '';
                const epMatch = /\/ep-(\d+)/.exec(href) || /ep-(\d+)/.exec($(el).text());
                if (epMatch) {
                    const epNum = parseInt(epMatch[1], 10);
                    if (!episodes.some(e => e.number === epNum)) {
                        episodes.push({
                            id: `anichi-${cleanId}$ep=${epNum}`,
                            number: epNum,
                            title: $(el).attr('title') || `Episode ${epNum}`,
                            hasSub: true,
                            hasDub: true
                        });
                    }
                }
            });

            if (episodes.length === 0) {
                episodes.push({
                    id: `anichi-${cleanId}$ep=1`,
                    number: 1,
                    title: 'Episode 1',
                    hasSub: true,
                    hasDub: true
                });
            }

            episodes.sort((a, b) => a.number - b.number);
            this.setCache(cacheKey, episodes);
            return episodes;

        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [{ id: `anichi-${cleanId}$ep=1`, number: 1, title: 'Episode 1', hasSub: true, hasDub: true }];
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const res = await this.search('a', page, undefined, options);
        return res.results;
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        const res = await this.search('e', page, undefined, options);
        return res.results;
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const res = await this.search('o', page, undefined, options);
        return res.results.slice(0, limit).map((a, i) => ({ rank: i + 1, anime: a }));
    }

    private extractEpisodeNum(episodeId: string, options?: SourceRequestOptions): number {
        if (options?.episodeNum && options.episodeNum > 0) return options.episodeNum;
        const match = /\$ep=(\d+)/i.exec(episodeId) || /\/ep-(\d+)/i.exec(episodeId) || /[?&]ep=(\d+)/i.exec(episodeId);
        return match ? parseInt(match[1], 10) : 1;
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cleanSlug = episodeId.replace(/^anichi-/, '').split('$')[0];
        const epNum = this.extractEpisodeNum(episodeId, options);

        const cacheKey = `stream:${cleanSlug}:${epNum}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        let browser;
        try {
            browser = await this.getBrowser();
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

            const sources: VideoSource[] = [];
            const subtitles: VideoSubtitle[] = [];

            page.on('response', async (res: any) => {
                const url = res.url();
                if (url.includes('.m3u8')) {
                    sources.push({
                        url,
                        quality: 'auto',
                        isM3U8: true,
                        category: category
                    });
                } else if (url.includes('mapper.nekostream.site/api/mal/')) {
                    try {
                        const json = await res.json();
                        if (json && json.Kiwi) {
                            const sub = json.Kiwi.sub?.download;
                            const dub = json.Kiwi.dub?.download;
                            if (sub) {
                                Object.entries(sub).forEach(([q, link]) => {
                                    sources.push({
                                        url: link as string,
                                        quality: (q === '1080p' || q === '720p' || q === '480p' || q === '360p') ? q : 'auto',
                                        isM3U8: false,
                                        category: 'sub'
                                    });
                                });
                            }
                            if (dub) {
                                Object.entries(dub).forEach(([q, link]) => {
                                    sources.push({
                                        url: link as string,
                                        quality: (q === '1080p' || q === '720p' || q === '480p' || q === '360p') ? q : 'auto',
                                        isM3U8: false,
                                        category: 'dub'
                                    });
                                });
                            }
                        }
                    } catch {}
                }
            });

            const watchUrl = `${this.baseUrl}/watch/${cleanSlug}/ep-${epNum}`;
            logger.info(`[Anichi] Navigating Puppeteer page to ${watchUrl}`);
            await page.goto(watchUrl, { waitUntil: 'networkidle2', timeout: 25000 });
            await new Promise(r => setTimeout(r, 2000));

            if (sources.length === 0) {
                const iframes = await page.$$eval('iframe', (els: any[]) => els.map((e: any) => e.src));
                for (const src of iframes) {
                    if (src && !src.includes('recaptcha') && !src.includes('sharethis')) {
                        sources.push({
                            url: src,
                            quality: 'auto',
                            isM3U8: src.includes('.m3u8'),
                            category
                        });
                    }
                }
            }

            await page.close();

            const streamData: StreamingData = { sources, subtitles, source: this.name, category };
            if (sources.length > 0) {
                this.setCache(cacheKey, streamData);
                this.handleSuccess();
            }
            return streamData;

        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const links = await this.getStreamingLinks(episodeId, undefined, 'sub', options);
        return (links.sources || []).map((s, idx) => ({
            name: `Server ${idx + 1} (${(s.category || 'sub').toUpperCase()})`,
            url: s.url,
            type: (s.category === 'dub' ? 'dub' : 'sub') as 'sub' | 'dub' | 'raw'
        }));
    }
}
