import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

/**
 * YomiSource: Resolves anilist-XXXXX episode IDs by fetching embed pages from
 * VidNest/TryEmbed via lightweight HTTP+regex — no Puppeteer, no browser cold-start.
 *
 * Flow:
 *   anilist-189046 + ep=11 →
 *   GET https://vidnest.fun/animepahe/189046/11/sub (+ TryEmbed in parallel)
 *   → parse HTML/JS for .m3u8 URLs → return HLS stream
 */
export class YomiSource extends BaseAnimeSource {
    acceptsAniListId = true;
    name = 'Yomi';
    baseUrl = 'https://yomi.to';
    private client: AxiosInstance;

    private cache: Map<string, { data: any; expires: number }> = new Map();
    private readonly STREAM_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

    constructor() {
        super();
        const keepAliveAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 15,
            timeout: 12000,
        });
        this.client = axios.create({
            timeout: 10000,
            httpsAgent: keepAliveAgent,
            headers: {
                Accept: 'text/html,application/xhtml+xml,*/*',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            },
        });
    }

    // ──────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) return entry.data as T;
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
        const m =
            /\$ep=(\d+)/i.exec(episodeId) ||
            /[?&]eps?=(\d+)/i.exec(episodeId) ||
            /ep-(\d+)/i.exec(episodeId);
        return m ? parseInt(m[1], 10) : 1;
    }

    private buildEmbedUrls(anilistId: number, episodeNum: number, category: 'sub' | 'dub'): string[] {
        const type = category === 'dub' ? 'dub' : 'sub';
        return [
            `https://vidnest.fun/animepahe/${anilistId}/${episodeNum}/${type}`,
            `https://tryembed.us.cc/embed/anime/${anilistId}/${episodeNum}/${type}`,
        ];
    }

    /**
     * Lightweight HTTP fetch + regex extraction — no Puppeteer, no cold-start.
     * Fetches embed page HTML, scans for M3U8 URLs, and follows one iframe level.
     */
    private async extractM3u8FromUrl(embedUrl: string, options?: SourceRequestOptions): Promise<string | null> {
        const origin = new URL(embedUrl).origin;
        const scanForM3u8 = (text: string): string | null => {
            // Direct .m3u8 link in page/response
            const matches = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g);
            if (matches) {
                const valid = matches.filter((u) => !u.includes('subtitles'));
                if (valid.length) return valid[0];
            }
            // JS variable patterns: file:"...", src:"...", url:"..."
            const jsMatch = text.match(/(?:file|src|url|source)\s*[=:]\s*["']([^"']+\.m3u8[^"']*)/i);
            if (jsMatch) return jsMatch[1];
            return null;
        };

        try {
            const resp = await this.client.get(embedUrl, {
                headers: { Referer: origin, Origin: origin },
                maxRedirects: 5,
                timeout: Math.min(options?.timeout || 8_000, 8_000),
                signal: options?.signal,
                maxContentLength: 2 * 1024 * 1024,
            });
            const html: string =
                typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);

            const direct = scanForM3u8(html);
            if (direct) return direct;

            // Follow one level of iframe
            const $ = cheerio.load(html);
            const iframeSrc = $('iframe').attr('src');
            if (iframeSrc && iframeSrc.startsWith('http')) {
                const iframeOrigin = new URL(iframeSrc).origin;
                const iResp = await this.client.get(iframeSrc, {
                    headers: { Referer: embedUrl, Origin: iframeOrigin },
                    maxRedirects: 3,
                    timeout: Math.min(options?.timeout || 8_000, 8_000),
                    signal: options?.signal,
                    maxContentLength: 2 * 1024 * 1024,
                });
                const iHtml: string =
                    typeof iResp.data === 'string' ? iResp.data : JSON.stringify(iResp.data);
                const iframe = scanForM3u8(iHtml);
                if (iframe) return iframe;
            }
        } catch (e: any) {
            if (!options?.signal?.aborted) logger.warn(`[Yomi] HTTP extract failed for ${embedUrl}: ${e.message}`, undefined, 'Yomi');
        }
        return null;
    }

    // ──────────────────────────────────────────────────────────────
    // BaseAnimeSource interface
    // ──────────────────────────────────────────────────────────────

    async healthCheck(_options?: SourceRequestOptions): Promise<boolean> {
        this.isAvailable = true;
        return true;
    }

    async search(_query: string, page = 1, _filters?: any, _options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
    }

    async getAnime(_id: string, _options?: SourceRequestOptions): Promise<AnimeBase | null> {
        return null;
    }

    async getEpisodes(_animeId: string, _options?: SourceRequestOptions): Promise<Episode[]> {
        return [];
    }

    async getTrending(_page = 1, _options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getLatest(_page = 1, _options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getTopRated(_page = 1, _limit = 24, _options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }

    async getStreamingLinks(
        episodeId: string,
        _serverId?: string,
        category: 'sub' | 'dub' = 'sub',
        options?: SourceRequestOptions
    ): Promise<StreamingData> {
        let anilistId = this.extractAnilistId(episodeId);
        if (!anilistId && options?.anilistId) {
            anilistId = options.anilistId;
        }
        if (!anilistId) return { sources: [], subtitles: [] };

        const episodeNum = this.extractEpisodeNum(episodeId, options);
        const cacheKey = `stream:${anilistId}:${episodeNum}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached && !options?.bypassCache) return cached;

        const embedUrls = this.buildEmbedUrls(anilistId, episodeNum, category);
        logger.info(
            `[Yomi] Resolving anilist-${anilistId} ep${episodeNum} (${category}) via HTTP extract`,
            undefined,
            'Yomi'
        );

        // Race both independent hosts. Abort losing HTTP requests as soon as one
        // host yields a URL; otherwise they continue consuming sockets after the
        // resolver has already returned a source.
        const controllers = embedUrls.map(() => new AbortController());
        const racePromises = embedUrls.map(async (url, index) => {
            const signal = options?.signal
                ? AbortSignal.any([options.signal, controllers[index].signal])
                : controllers[index].signal;
            const m3u8 = await this.extractM3u8FromUrl(url, { ...options, signal });
            if (!m3u8) throw new Error(`No HLS URL in ${new URL(url).hostname}`);
            return { url: m3u8, server: new URL(url).hostname };
        });
        let winner: { url: string; server: string } | null = null;
        try {
            winner = await Promise.any(racePromises);
        } catch {
            // Promise.any rejected (all null) — already resolved via map
        } finally {
            controllers.forEach(controller => controller.abort(new Error('Another Yomi host won or failed')));
        }

        const sources: VideoSource[] = [];
        if (winner) {
            // Include the Referer/Origin headers required by the CDN so that probeMedia
            // can validate the m3u8 URL.  Without these the CDN returns a 403 or empty
            // response and the stream is incorrectly discarded.
            const refererOrigin = `https://${winner.server}`;
            sources.push({
                url: winner.url,
                quality: 'auto' as const,
                isM3U8: true,
                isEmbed: false,
                isDirect: false,
                server: winner.server,
                // skipProbe: CDN may block datacenter IPs during server-side probing
                // but the URL is valid — the stream proxy handles segment fetching fine.
                skipProbe: true,
                headers: {
                    'Referer': `${refererOrigin}/`,
                    'Origin': refererOrigin,
                },
            });
            logger.info(
                `[Yomi] ✅ anilist-${anilistId} ep${episodeNum}: ${winner.url.substring(0, 60)}...`,
                undefined,
                'Yomi'
            );
        }

        const response: StreamingData = {
            sources,
            subtitles: [],
            source: sources.length > 0 ? 'Yomi' : undefined,
            category,
        };

        if (sources.length > 0) {
            this.setCache(cacheKey, response, this.STREAM_CACHE_TTL);
        }

        return response;
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const anilistId = this.extractAnilistId(episodeId);
        if (!anilistId) return [];
        const episodeNum = this.extractEpisodeNum(episodeId, options);
        return [
            { name: 'Yomi-VidNest', url: `yomi-${anilistId}-${episodeNum}-0`, type: 'sub' as const },
            { name: 'Yomi-TryEmbed', url: `yomi-${anilistId}-${episodeNum}-1`, type: 'sub' as const },
        ];
    }
}
