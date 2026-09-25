/**
 * HentaiMama source — hentaimama.io (DooPlay). Its own search is JavaScript-driven and
 * returns nothing to a plain request, so title discovery goes through the full listing
 * (`/tvshows/`, 60+ pages) which the hentai index crawls; this class serves details,
 * episodes and streams.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import {
    HM_BASE,
    parseCards,
    parseEmbedFile,
    parseEmbedUrls,
    parseLastPage,
    parseSeries,
    type ParsedMamaSeries,
} from './hentaimama-parse.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const MIRRORS = [1, 2, 3, 4];

export class HentaiMamaSource extends BaseAnimeSource {
    name = 'HentaiMama';
    baseUrl = HM_BASE;

    private cache = new Map<string, { data: unknown; expires: number }>();
    private ttl = { list: 10 * 60 * 1000, series: 15 * 60 * 1000, stream: 10 * 60 * 1000 };

    private getCached<T>(key: string): T | null {
        const hit = this.cache.get(key);
        if (hit && hit.expires > Date.now()) return hit.data as T;
        this.cache.delete(key);
        return null;
    }
    private setCache(key: string, data: unknown, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    private async html(url: string, options?: SourceRequestOptions, headers: Record<string, string> = {}): Promise<string> {
        const res = await axios.get<string>(url, {
            headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', ...headers },
            signal: options?.signal,
            timeout: options?.timeout || 25000,
        });
        return res.data;
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const $ = cheerio.load(await this.html(`${this.baseUrl}/tvshows/`, options, {}));
            return parseCards($).length > 0;
        } catch {
            return false;
        }
    }

    /** One page of the full listing — the crawler walks these. */
    async listSeries(page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const key = `list:${page}`;
        const cached = this.getCached<AnimeSearchResult>(key);
        if (cached) return cached;
        try {
            const url = page > 1 ? `${this.baseUrl}/tvshows/page/${page}/` : `${this.baseUrl}/tvshows/`;
            const $ = cheerio.load(await this.html(url, options));
            const last = parseLastPage($);
            const result: AnimeSearchResult = {
                results: parseCards($),
                totalPages: last,
                currentPage: page,
                hasNextPage: page < last,
                source: this.name,
            };
            this.setCache(key, result, this.ttl.list);
            return result;
        } catch (error) {
            this.handleError(error, 'listSeries');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    /** The site's search is client-side; ask the index (services/hentai-index) instead. */
    async search(_query: string, page: number = 1): Promise<AnimeSearchResult> {
        return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
    }

    private slugOf(id: string): string | null {
        const clean = id.replace(/^hentaimama-/, '').replace(/\/+$/, '');
        if (clean.startsWith('episodes/') || clean.startsWith('http')) return null;
        return clean.replace(/^tvshows\//, '') || null;
    }

    async getSeriesDetail(slug: string, options?: SourceRequestOptions): Promise<ParsedMamaSeries | null> {
        const key = `series:${slug}`;
        const cached = this.getCached<ParsedMamaSeries>(key);
        if (cached) return cached;
        try {
            const $ = cheerio.load(await this.html(`${this.baseUrl}/tvshows/${slug}/`, options));
            const parsed = parseSeries($, slug);
            if (!parsed) return null;
            this.setCache(key, parsed, this.ttl.series);
            return parsed;
        } catch (error) {
            this.handleError(error, 'getSeriesDetail');
            return null;
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const slug = this.slugOf(id);
        return slug ? (await this.getSeriesDetail(slug, options))?.anime ?? null : null;
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const clean = animeId.replace(/^hentaimama-/, '').replace(/\/+$/, '');
        if (clean.startsWith('episodes/')) {
            const num = parseInt(clean.match(/-episode-(\d+)$/)?.[1] ?? '1', 10) || 1;
            return [{ id: `hentaimama-${clean}`, number: num, title: `Episode ${num}`, isFiller: false, hasSub: true, hasDub: false }];
        }
        const slug = this.slugOf(animeId);
        return slug ? (await this.getSeriesDetail(slug, options))?.episodes ?? [] : [];
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return (await this.listSeries(page, options)).results;
    }
    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return (await this.listSeries(page, options)).results;
    }
    async getTopRated(page: number = 1, _limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return (await this.listSeries(page, options)).results.map((anime, i) => ({ rank: i + 1, anime }));
    }

    async getEpisodeServers(_episodeId: string): Promise<EpisodeServer[]> {
        return [{ name: 'HentaiMama', url: '' }] as EpisodeServer[];
    }

    /**
     * One episode → its mirrors. The page's own script asks admin-ajax for each mirror's
     * embed, and each embed page hands its player a `file`; we do the same steps.
     * Order: HLS first (adaptive), then direct MP4s.
     */
    async getStreamingLinks(
        episodeId: string,
        _server?: string,
        _category: 'sub' | 'dub' = 'sub',
        options?: SourceRequestOptions
    ): Promise<StreamingData> {
        const slug = episodeId.replace(/^hentaimama-/, '').replace(/^episodes\//, '').replace(/\/+$/, '');
        const key = `stream:${slug}`;
        const cached = this.getCached<StreamingData>(key);
        if (cached) return cached;

        const empty: StreamingData = { sources: [], subtitles: [], source: this.name };
        try {
            const pageUrl = `${this.baseUrl}/episodes/${slug}/`;
            const html = await this.html(pageUrl, options, { Referer: `${this.baseUrl}/` });
            const post = cheerio.load(html)('[data-post]').first().attr('data-post') || html.match(/get_player_contents[^}]*?a:\s*['"](\d+)['"]/)?.[1];
            if (!post) return empty;

            const files: { kind: string; file: string }[] = [];
            await Promise.all(
                MIRRORS.map(async (i) => {
                    try {
                        const res = await axios.post(
                            `${this.baseUrl}/wp-admin/admin-ajax.php`,
                            new URLSearchParams({ action: 'get_player_contents', a: post, i: String(i) }).toString(),
                            {
                                headers: {
                                    'User-Agent': UA,
                                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                    'X-Requested-With': 'XMLHttpRequest',
                                    Referer: pageUrl,
                                },
                                timeout: 15000,
                                signal: options?.signal,
                                responseType: 'text',
                                transformResponse: (r) => r,
                            }
                        );
                        const entries = JSON.parse(String(res.data)) as string[];
                        for (const { kind, url } of parseEmbedUrls(entries)) {
                            const embed = await this.html(url, options, { Referer: pageUrl });
                            const file = parseEmbedFile(embed);
                            if (file) files.push({ kind, file });
                        }
                    } catch {
                        /* a dead mirror is normal — the others carry on */
                    }
                })
            );

            const seen = new Set<string>();
            const sources: VideoSource[] = [];
            for (const { kind, file } of files) {
                if (seen.has(file)) continue;
                seen.add(file);
                const hls = /\.m3u8/i.test(file);
                sources.push({
                    url: file,
                    quality: hls ? 'auto' : 'default',
                    isM3U8: hls,
                    isDirect: true,
                    server: `HentaiMama ${kind.toUpperCase()}`,
                });
            }
            // adaptive first, then MP4
            sources.sort((a, b) => Number(b.isM3U8) - Number(a.isM3U8));

            if (!sources.length) return empty;

            const result: StreamingData = {
                sources,
                subtitles: [],
                source: this.name,
                headers: { Referer: `${this.baseUrl}/`, 'User-Agent': UA },
            };
            this.setCache(key, result, this.ttl.stream);
            return result;
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            logger.warn(`[HentaiMama] no stream for ${slug}: ${(error as Error).message}`);
            return empty;
        }
    }
}

/** One instance for the process: the source manager and the hentai index share its cache. */
export const hentaiMamaSource = new HentaiMamaSource();
