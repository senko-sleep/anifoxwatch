/**
 * HentaiHaven source — hentaihaven.xxx. A Next.js front over a WordPress catalogue:
 *   listing   /api/manga/?page=N&per_page=30      JSON, 1,000+ titles
 *   series    /watch/<slug>/                       server-rendered, episode links + stills
 *   episode   /watch/<slug>/episode-N/             VideoObject JSON-LD → HLS manifest
 * Its own search is fuzzy to the point of junk, so title discovery goes through the
 * listing which the hentai index crawls; this class serves details, episodes and streams.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { curlGet } from '../utils/curl-fetch.js';
import { HH_BASE, parseEpisode, parseListing, parseMasterSubtitles, parseSeries, type ApiListing, type ParsedHavenSeries } from './hentaihaven-parse.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PER_PAGE = 30; // the API rejects anything above this

export class HentaiHavenSource extends BaseAnimeSource {
    name = 'HentaiHaven';
    baseUrl = HH_BASE;

    private cache = new Map<string, { data: unknown; expires: number }>();
    private ttl = { list: 10 * 60 * 1000, series: 15 * 60 * 1000, stream: 30 * 60 * 1000 };

    private getCached<T>(key: string): T | null {
        const hit = this.cache.get(key);
        if (hit && hit.expires > Date.now()) return hit.data as T;
        this.cache.delete(key);
        return null;
    }
    private setCache(key: string, data: unknown, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    /**
     * The site challenges Node's TLS fingerprint with a 403 (see utils/curl-fetch), so pages go
     * through curl. It also throttles bursts, so a failed request is retried a couple of times.
     */
    private async get(url: string, options?: SourceRequestOptions, accept = 'text/html,*/*;q=0.8'): Promise<string> {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt) await new Promise((r) => setTimeout(r, 700 * attempt));
            try {
                return await curlGet(url, {
                    headers: { 'User-Agent': UA, Accept: accept, Referer: `${HH_BASE}/` },
                    timeoutMs: options?.timeout || 25000,
                    signal: options?.signal,
                });
            } catch (e) {
                lastError = e;
                if (options?.signal?.aborted) break;
            }
        }
        throw lastError;
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            return (await this.listSeries(1, options)).results.length > 0;
        } catch {
            return false;
        }
    }

    /** One page of the full catalogue, newest first — the crawler walks these. */
    async listSeries(page: number = 1, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const key = `list:${page}`;
        const cached = this.getCached<AnimeSearchResult>(key);
        if (cached) return cached;
        try {
            const json = JSON.parse(
                await this.get(`${this.baseUrl}/api/manga/?page=${page}&per_page=${PER_PAGE}&orderby=id&order=desc`, options, 'application/json')
            ) as ApiListing;
            const { results, totalPages } = parseListing(json);
            const result: AnimeSearchResult = { results, totalPages, currentPage: page, hasNextPage: page < totalPages, source: this.name };
            this.setCache(key, result, this.ttl.list);
            return result;
        } catch (error) {
            this.handleError(error, 'listSeries');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    /** The site's search is fuzzy junk; the hentai index does the matching. */
    async search(_query: string, page: number = 1): Promise<AnimeSearchResult> {
        return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
    }

    private slugOf(id: string): string | null {
        const clean = id.replace(/^hentaihaven-/, '').replace(/\/+$/, '');
        if (clean.startsWith('episodes/') || clean.startsWith('http')) return null;
        return clean.replace(/^watch\//, '') || null;
    }

    async getSeriesDetail(slug: string, options?: SourceRequestOptions): Promise<ParsedHavenSeries | null> {
        const key = `series:${slug}`;
        const cached = this.getCached<ParsedHavenSeries>(key);
        if (cached) return cached;
        try {
            const $ = cheerio.load(await this.get(`${this.baseUrl}/watch/${encodeURIComponent(slug)}/`, options));
            const parsed = parseSeries($, slug);
            if (!parsed) return null;
            await this.settlePoster(parsed);
            this.setCache(key, parsed, this.ttl.series);
            return parsed;
        } catch (error) {
            this.handleError(error, 'getSeriesDetail');
            return null;
        }
    }

    /** Keep the first poster that actually loads (the media host isn't behind the page's bot check). */
    private async settlePoster(parsed: ParsedHavenSeries): Promise<void> {
        for (const url of parsed.imageCandidates) {
            const ok = await axios
                .head(url, { headers: { 'User-Agent': UA }, timeout: 8000, validateStatus: (s) => s < 400 })
                .then(() => true)
                .catch(() => false);
            if (ok) {
                parsed.anime.image = url;
                parsed.anime.cover = url;
                return;
            }
        }
        // none resolved: parseSeries' own fallback (an episode still, or nothing) stays
        if (parsed.imageCandidates.length) {
            const still = parsed.episodes.find((e) => e.thumbnail)?.thumbnail ?? '';
            parsed.anime.image = still;
            parsed.anime.cover = still || undefined;
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const slug = this.slugOf(id);
        return slug ? (await this.getSeriesDetail(slug, options))?.anime ?? null : null;
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const clean = animeId.replace(/^hentaihaven-/, '').replace(/\/+$/, '');
        if (clean.startsWith('episodes/')) {
            const num = parseInt(clean.match(/-episode-(\d+)$/)?.[1] ?? '1', 10) || 1;
            return [{ id: `hentaihaven-${clean}`, number: num, title: `Episode ${num}`, isFiller: false, hasSub: true, hasDub: false }];
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
        return [{ name: 'HentaiHaven', url: '' }] as EpisodeServer[];
    }

    /** `hentaihaven-episodes/<slug>-episode-<n>` → the episode page's HLS manifest. */
    async getStreamingLinks(
        episodeId: string,
        _server?: string,
        _category: 'sub' | 'dub' = 'sub',
        options?: SourceRequestOptions
    ): Promise<StreamingData> {
        const id = episodeId.replace(/^hentaihaven-/, '').replace(/^episodes\//, '').replace(/\/+$/, '');
        const m = id.match(/^(.*)-episode-(\d+)$/);
        const empty: StreamingData = { sources: [], subtitles: [], source: this.name };
        if (!m) return empty;

        const key = `stream:${id}`;
        const cached = this.getCached<StreamingData>(key);
        if (cached) return cached;

        try {
            const [, slug, num] = m;
            const $ = cheerio.load(await this.get(`${this.baseUrl}/watch/${encodeURIComponent(slug)}/episode-${num}/`, options));
            const ep = parseEpisode($);
            if (!ep) return empty;

            // The manifest host isn't behind the page's bot check, so plain HTTP is enough here.
            const subtitles = await axios
                .get<string>(ep.manifest, { headers: { 'User-Agent': UA, Referer: `${HH_BASE}/` }, timeout: 10000, signal: options?.signal, responseType: 'text' })
                .then((r) => parseMasterSubtitles(String(r.data), ep.manifest))
                .catch(() => []);

            const result: StreamingData = {
                sources: [{ url: ep.manifest, quality: 'auto', isM3U8: true, isDirect: true, server: 'HentaiHaven HLS' }],
                subtitles,
                source: this.name,
                headers: { Referer: `${this.baseUrl}/`, 'User-Agent': UA },
            };
            this.setCache(key, result, this.ttl.stream);
            return result;
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            logger.warn(`[HentaiHaven] no stream for ${id}: ${(error as Error).message}`);
            return empty;
        }
    }
}

/** One instance for the process: the source manager and the hentai index share its cache. */
export const hentaiHavenSource = new HentaiHavenSource();
