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
            timeout: 60000, // Increased from 12s to 60s for Vercel
        });
        this.client = axios.create({
            timeout: 45000, // Increased from 10s to 45s for Vercel cold starts
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

    // Proxy list for Vercel serverless - race direct vs proxy
    private readonly PROXIES = [
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    ];

    /**
     * Lightweight HTTP fetch + regex extraction — no Puppeteer, no cold-start.
     * Fetches embed page HTML, scans for M3U8 URLs, and follows one iframe level.
     * Uses proxy racing for Vercel serverless compatibility.
     */
    private async extractM3u8FromUrl(embedUrl: string): Promise<string | null> {
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

        const fetchWithProxies = async (url: string): Promise<string | null> => {
            const directFetch = this.client.get(url, {
                headers: { Referer: origin, Origin: origin },
                maxRedirects: 5,
            }).then(resp => ({ data: resp.data, source: 'direct' }))
              .catch(() => null);

            const proxyFetches = this.PROXIES.map(proxyUrl => 
                this.client.get(proxyUrl(url), {
                    headers: { Referer: origin },
                    maxRedirects: 5,
                }).then(resp => ({ data: resp.data, source: 'proxy' }))
                  .catch(() => null)
            );

            const results = await Promise.race([
                Promise.any([directFetch, ...proxyFetches].filter(Boolean)),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('All fetches timed out')), 30000)
                )
            ]);

            if (!results) return null;

            const html: string = typeof results.data === 'string' ? results.data : JSON.stringify(results.data);
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
                });
                const iHtml: string =
                    typeof iResp.data === 'string' ? iResp.data : JSON.stringify(iResp.data);
                const iframe = scanForM3u8(iHtml);
                if (iframe) return iframe;
            }
            return null;
        };

        try {
            return await fetchWithProxies(embedUrl);
        } catch (e: any) {
            logger.warn(`[Yomi] HTTP extract failed for ${embedUrl}: ${e.message}`, undefined, 'Yomi');
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
        const anilistId = this.extractAnilistId(episodeId);
        if (!anilistId) return { sources: [], subtitles: [] };

        const episodeNum = this.extractEpisodeNum(episodeId, options);
        const cacheKey = `stream:${anilistId}:${episodeNum}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        const embedUrls = this.buildEmbedUrls(anilistId, episodeNum, category);
        logger.info(
            `[Yomi] Resolving anilist-${anilistId} ep${episodeNum} (${category}) via HTTP extract`,
            undefined,
            'Yomi'
        );

        // Race all embed URLs simultaneously — first M3U8 wins
        const racePromises = embedUrls.map(async (url) => {
            const m3u8 = await this.extractM3u8FromUrl(url);
            return m3u8 ? { url: m3u8, server: new URL(url).hostname } : null;
        });

        let winner: { url: string; server: string } | null = null;
        try {
            winner = await Promise.any(
                racePromises.map((p) =>
                    p.then((r) => {
                        if (!r) throw new Error('no stream');
                        return r;
                    })
                )
            );
        } catch {
            // Promise.any rejected (all null) — already resolved via map
        }

        const sources: VideoSource[] = [];
        if (winner) {
            sources.push({
                url: winner.url,
                quality: 'auto' as const,
                isM3U8: true,
                isEmbed: false,
                isDirect: false,
                server: winner.server,
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
