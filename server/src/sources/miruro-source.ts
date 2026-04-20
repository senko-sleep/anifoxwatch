/**
 * MiruroSource — scrapes miruro.in for episode metadata, then resolves streams
 * via the official `aniwatch` scraper (aniwatchtv / hianime embeds) and @consumet/extensions Hianime as fallback.
 * (Consumet v1.8+ removed ANIME.Zoro — use Hianime + aniwatch package instead.)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { HiAnime } from 'aniwatch';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { streamExtractor } from '../services/stream-extractor.js';

let CONSUMET_MOD: any = null;
async function getConsumetMod() {
    if (!CONSUMET_MOD) CONSUMET_MOD = await import('@consumet/extensions');
    return CONSUMET_MOD;
}

let aniwatchScraper: InstanceType<typeof HiAnime.Scraper> | null = null;
function getAniwatchScraper(): InstanceType<typeof HiAnime.Scraper> {
    if (!aniwatchScraper) aniwatchScraper = new HiAnime.Scraper();
    return aniwatchScraper;
}

export class MiruroSource extends BaseAnimeSource {
    name = 'Miruro';
    baseUrl = 'https://www.miruro.in';
    private consumetProvider: any = null;

    /**
     * Timestamp until which we skip the aniwatch scraper and puppeteer because
     * aniwatchtv.to is returning a Cloudflare challenge page (non-HTML) for all
     * server-side requests. Set when we see "cheerio.load() expects a string".
     */
    private aniwatchSiteBlockedUntil = 0;
    private readonly SITE_BLOCK_TTL_MS = 5 * 60 * 1000;

    private async getConsumetProvider() {
        if (!this.consumetProvider) {
            const mod = await getConsumetMod();
            this.consumetProvider = new mod.ANIME.Hianime();
            (this.consumetProvider as { baseUrl: string }).baseUrl = 'https://aniwatchtv.to';
        }
        return this.consumetProvider;
    }

    private stripPrefix(id: string): string {
        return id.replace(/^miruro-/i, '').replace(/^kaido-/i, '');
    }

    /** `aniwatch` package expects `slug?ep=EPISODE_KEY` (same as the watch URL). */
    private toAniwatchEpisodeQuery(id: string): string {
        let s = this.stripPrefix(id);
        const tokenForm = /^(.+)\$ep=\d+\$token=(.+)$/i.exec(s);
        if (tokenForm) return `${tokenForm[1]}?ep=${tokenForm[2]}`;
        const dollarEp = /^(.+)\$ep=(\d+)$/i.exec(s);
        if (dollarEp) return `${dollarEp[1]}?ep=${dollarEp[2]}`;
        if (s.includes('?ep=')) return s;
        if (s.includes('$episode$')) return s.replace('$episode$', '?ep=');
        return s;
    }

    /** Consumet Hianime expects `slug$episode$KEY` with literal `$episode$`. */
    private toConsumetEpId(id: string): string {
        let s = this.stripPrefix(id);
        const tokenForm = /^(.+)\$ep=\d+\$token=(.+)$/i.exec(s);
        if (tokenForm) return `${tokenForm[1]}$episode$${tokenForm[2]}`;
        const dollarEp = /^(.+)\$ep=(\d+)$/i.exec(s);
        if (dollarEp) return `${dollarEp[1]}$episode$${dollarEp[2]}`;
        return s.replace('?ep=', '$episode$');
    }

    /**
     * For `slug$ep=N$token=KEY` embeds, sites sometimes resolve streams with either the token or the display ep#.
     * Try both so at least one matches the upstream episode table.
     */
    private episodeIdVariantsForStreaming(id: string): { aniwatch: string[]; consumet: string[] } {
        const raw = this.stripPrefix(id);
        const tok = /^(.+)\$ep=(\d+)\$token=(.+)$/i.exec(raw);
        if (tok) {
            const slug = tok[1];
            const epNum = tok[2];
            const tokenKey = tok[3];
            const aw = [`${slug}?ep=${tokenKey}`, `${slug}?ep=${epNum}`];
            const cc = [`${slug}$episode$${tokenKey}`, `${slug}$episode$${epNum}`];
            return {
                aniwatch: [...new Set(aw)],
                consumet: [...new Set(cc)],
            };
        }
        return {
            aniwatch: [this.toAniwatchEpisodeQuery(id)],
            consumet: [this.toConsumetEpId(id)],
        };
    }

    /** `HiAnime.Scraper().getEpisodeSources` expects `slug?ep=INTERNAL_ID` (watch page shape). Skip malformed IDs. */
    private isValidAniwatchEpQuery(q: string): boolean {
        const idx = q.indexOf('?ep=');
        if (idx < 1) return false;
        const slug = q.slice(0, idx).trim();
        const epVal = q.slice(idx + 4).trim();
        return slug.length >= 3 && epVal.length >= 1 && !slug.includes('/');
    }

    /**
     * Watch URLs use `?ep=<internal id>`. Users often pass `?ep=1` for episode 1.
     * Only values in 1…MAX are treated as display episode numbers; HiAnime internal keys are usually
     * much larger (e.g. 94388) and must not trigger a full episode-list fetch before every stream.
     */
    private static readonly DISPLAY_EPISODE_RESOLVE_MAX = 3000;

    private async resolveDisplayEpisodeIfNeeded(id: string): Promise<string> {
        if (Date.now() < this.aniwatchSiteBlockedUntil) return id;

        const aw = this.toAniwatchEpisodeQuery(id);
        const m = /^([^?]+)\?ep=(\d+)$/.exec(aw);
        if (!m) return id;
        const slug = m[1];
        const epNum = parseInt(m[2], 10);
        const max = MiruroSource.DISPLAY_EPISODE_RESOLVE_MAX;
        if (!Number.isFinite(epNum) || epNum < 1 || epNum > max) return id;

        try {
            const scraper = getAniwatchScraper();
            const list = await Promise.race([
                scraper.getEpisodes(slug),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 12_000)),
            ]);
            const hit = list.episodes?.find((e: { number: number }) => e.number === epNum);
            if (!hit?.episodeId?.includes('?ep=')) return id;

            const internal = hit.episodeId;
            logger.info(
                `[Miruro] resolved display episode ${epNum} → ${internal.split('?ep=')[1]} (HiAnime internal ?ep=)`,
                undefined,
                this.name,
            );
            if (/^miruro-/i.test(id)) return `miruro-${internal}`;
            if (/^kaido-/i.test(id)) return `kaido-${internal}`;
            return internal;
        } catch {
            return id;
        }
    }

    private normalizeAniwatchServer(server?: string): 'hd-1' | 'hd-2' | 'megacloud' | 'streamsb' | 'streamtape' {
        const s = (server || 'hd-1').toLowerCase();
        if (s.includes('hd-2') || s.includes('vidcloud')) return 'hd-2';
        if (s.includes('mega')) return 'megacloud';
        if (s.includes('sb')) return 'streamsb';
        if (s.includes('tape')) return 'streamtape';
        return 'hd-1';
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const res = await axios.get(this.baseUrl, {
                timeout: options?.timeout || 6000,
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            this.isAvailable = res.status === 200;
            return this.isAvailable;
        } catch {
            this.isAvailable = true;
            return true;
        }
    }

    private mapAnime(data: any): AnimeBase {
        return {
            id: `miruro-${data.id || ''}`,
            title: data.title || data.name || '',
            image: data.image || data.poster || '',
            cover: data.cover || data.image || '',
            description: data.description || '',
            type: (data.type || 'TV') as AnimeBase['type'],
            status: (data.status || 'Ongoing') as AnimeBase['status'],
            rating: data.rating || 0,
            episodes: data.totalEpisodes || data.episodes || 0,
            episodesAired: data.totalEpisodes || 0,
            genres: data.genres || [],
            studios: [],
            year: data.releaseDate ? parseInt(data.releaseDate, 10) : 0,
            subCount: data.sub || data.totalEpisodes || 0,
            dubCount: data.dub || 0,
            source: this.name,
            isMature: false,
        };
    }

    async search(query: string, page: number = 1, _filters?: unknown, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const p = await this.getConsumetProvider();
            const res = await Promise.race([
                p.search(query, page),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            const results = (res.results || []).map((r: unknown) => this.mapAnime(r));
            this.handleSuccess();
            return {
                results,
                totalPages: res.totalPages || (res.hasNextPage ? page + 1 : page),
                currentPage: page,
                hasNextPage: !!res.hasNextPage,
                source: this.name,
            };
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const slug = this.stripPrefix(id);

        try {
            const res = await axios.get(`${this.baseUrl}/details/${slug}`, {
                timeout: options?.timeout || 12000,
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0', Referer: `${this.baseUrl}/` },
            });
            const $ = cheerio.load(res.data);
            const title =
                $('h2').first().text().trim() ||
                $('meta[property="og:title"]').attr('content')?.replace(/\| Miruro$/, '').trim() ||
                slug;
            const image = $('meta[property="og:image"]').attr('content') || '';
            const description = $('meta[property="og:description"]').attr('content') || '';
            const genres: string[] = [];
            $('a[href*="/genre/"]').each((_i, el) => {
                const g = $(el).text().trim();
                if (g) genres.push(g);
            });
            this.handleSuccess();
            return {
                id,
                title,
                image,
                cover: image,
                description,
                type: 'TV',
                status: 'Ongoing',
                rating: 0,
                episodes: 0,
                episodesAired: 0,
                genres,
                studios: [],
                year: 0,
                subCount: 0,
                dubCount: 0,
                source: this.name,
                isMature: false,
            };
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const slug = this.stripPrefix(animeId);

        try {
            const episodes = await this.scrapeEpisodesFromMiruro(slug, options);
            if (episodes.length > 0) {
                this.handleSuccess();
                return episodes;
            }
        } catch (e) {
            logger.warn(`[Miruro] HTML scrape failed: ${(e as Error).message?.substring(0, 80)}`, undefined, this.name);
        }

        try {
            const p = await this.getConsumetProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(slug),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            const episodes: Episode[] = (info.episodes || []).map((ep: Record<string, unknown>, i: number) => ({
                id: ep.id ? String(ep.id).replace('$episode$', '?ep=') : `${slug}?ep=${i + 1}`,
                number: (ep.number as number) || i + 1,
                title: (ep.title as string) || `Episode ${(ep.number as number) || i + 1}`,
                isFiller: !!ep.isFiller,
                hasSub: ep.isSubbed !== false,
                hasDub: !!ep.isDubbed,
                thumbnail: (ep.image as string) || '',
            }));
            this.handleSuccess();
            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    private async scrapeEpisodesFromMiruro(slug: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const res = await axios.get(`${this.baseUrl}/watch/${slug}`, {
            signal: options?.signal,
            timeout: options?.timeout || 12000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: `${this.baseUrl}/`,
            },
            maxRedirects: 5,
        });
        const $ = cheerio.load(res.data);
        const episodes: Episode[] = [];

        $(`a[href*="/watch/${slug}/ep-"]`).each((_i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            const epMatch = href.match(/\/ep-(\d+)$/);
            if (!epMatch) return;

            const numMatch = text.match(/^(\d+)/);
            const epNum = numMatch ? parseInt(numMatch[1], 10) : _i + 1;

            episodes.push({
                id: `${slug}?ep=${epMatch[1]}`,
                number: epNum,
                title: text.replace(/^\d+\s*/, '').trim() || `Episode ${epNum}`,
                isFiller: false,
                hasSub: true,
                hasDub: true,
                thumbnail: '',
            });
        });

        return episodes;
    }

    async getEpisodeServers(_episodeId: string, _options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [
            { name: 'HD-1', url: 'hd-1', type: 'sub' },
            { name: 'HD-2', url: 'hd-2', type: 'sub' },
            { name: 'HD-1', url: 'hd-1', type: 'dub' },
            { name: 'HD-2', url: 'hd-2', type: 'dub' },
        ];
    }

    async getStreamingLinks(
        episodeId: string,
        server?: string,
        category: 'sub' | 'dub' = 'sub',
        options?: SourceRequestOptions,
    ): Promise<StreamingData> {
        const resolvedEpisodeId = await this.resolveDisplayEpisodeIfNeeded(episodeId);
        let data = await this.runMiruroStack(resolvedEpisodeId, server, category, options);
        if (data.sources.length > 0) return data;
        if (category === 'dub') {
            logger.info(`[Miruro] no dub sources, trying sub for same episode`, undefined, this.name);
            data = await this.runMiruroStack(resolvedEpisodeId, server, 'sub', options);
        }
        return data;
    }

    private async runMiruroStack(
        resolvedEpisodeId: string,
        server: string | undefined,
        category: 'sub' | 'dub',
        options?: SourceRequestOptions,
    ): Promise<StreamingData> {
        const fromAniwatch = await this.tryAniwatchPackage(resolvedEpisodeId, server, category, options);
        if (fromAniwatch.sources.length > 0) return fromAniwatch;
        const fromConsumet = await this.tryConsumetHianime(resolvedEpisodeId, server, category, options);
        if (fromConsumet.sources.length > 0) return fromConsumet;
        return this.tryPuppeteerAniwatchTv(resolvedEpisodeId, category);
    }

    /**
     * When `aniwatch` npm + in-process Consumet fail (TLS / decoder / API quirks), load the real
     * watch page on aniwatchtv.to and capture HLS the same way Kaido does for 9animetv.
     */
    private async tryPuppeteerAniwatchTv(
        episodeId: string,
        category: 'sub' | 'dub',
    ): Promise<StreamingData> {
        if (Date.now() < this.aniwatchSiteBlockedUntil) {
            logger.warn(`[Miruro/puppeteer] skipping — aniwatchtv.to Cloudflare-blocked`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }

        const raw = this.stripPrefix(episodeId);
        const m = /^([^?]+)\?ep=(.+)$/.exec(raw);
        if (!m) return { sources: [], subtitles: [] };

        const slug = m[1];
        const epKey = m[2].trim();
        if (!slug || !epKey) return { sources: [], subtitles: [] };

        try {
            logger.info(`[Miruro/puppeteer] ${category} aniwatchtv.to/${slug}?ep=${epKey}`, undefined, this.name);
            const result = await streamExtractor.extractFrom9Anime(slug, epKey, 'https://aniwatchtv.to');
            if (!result.success || result.streams.length === 0) {
                return { sources: [], subtitles: [] };
            }
            this.handleSuccess();
            return {
                sources: result.streams.map(
                    (s): VideoSource => ({
                        url: s.url,
                        quality: (s.quality as VideoSource['quality']) || 'auto',
                        isM3U8: s.type === 'hls',
                    }),
                ),
                subtitles: result.subtitles.map((t) => ({
                    url: t.url,
                    lang: t.lang,
                    label: t.lang,
                })),
                headers: { Referer: 'https://aniwatchtv.to/' },
                source: this.name,
            };
        } catch (e) {
            logger.warn(`[Miruro/puppeteer] ${(e as Error).message?.slice(0, 120)}`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }
    }

    /** Primary: `aniwatch` npm (maintained for aniwatchtv.to / hianime-style IDs). */
    private async tryAniwatchPackage(
        episodeId: string,
        server: string | undefined,
        category: 'sub' | 'dub',
        options?: SourceRequestOptions,
    ): Promise<StreamingData> {
        if (Date.now() < this.aniwatchSiteBlockedUntil) {
            logger.warn(`[Miruro/aniwatch] skipping — site blocked until cache expires`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }

        const { aniwatch: epQueries } = this.episodeIdVariantsForStreaming(episodeId);
        const cat: 'sub' | 'dub' | 'raw' = category === 'dub' ? 'dub' : 'sub';
        const prefer = this.normalizeAniwatchServer(server);
        /** Prefer requested embed, then same rotation as REST discovery when one id is missing for dub/sub. */
        const defaultRotation: HiAnime.AnimeServers[] = ['hd-1', 'hd-2', 'megacloud', 'streamsb', 'streamtape'];
        const serversToTry: HiAnime.AnimeServers[] = server
            ? [prefer, ...defaultRotation.filter((s) => s !== prefer)]
            : [...defaultRotation];

        for (const epQuery of epQueries) {
            if (!this.isValidAniwatchEpQuery(epQuery)) {
                logger.warn(`[Miruro/aniwatch] skip invalid episode query shape`, { epQuery }, this.name);
                continue;
            }
            for (const srv of serversToTry) {
                try {
                    logger.info(`[Miruro/aniwatch] ${category} ${epQuery} → ${srv}`, undefined, this.name);
                    const scraper = getAniwatchScraper();
                    const data = await Promise.race([
                        scraper.getEpisodeSources(epQuery, srv, cat),
                        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 14_000)),
                    ]);

                    if (data.sources?.length) {
                        const sd = this.mapAniwatchToStreaming(data);
                        logger.info(`[Miruro/aniwatch] ✅ ${sd.sources.length} ${category} sources (${srv})`, undefined, this.name);
                        this.handleSuccess();
                        return sd;
                    }
                } catch (err) {
                    const msg = (err as Error).message || '';
                    // "cheerio.load() expects a string" means aniwatchtv.to returned a non-HTML
                    // Cloudflare challenge page. Puppeteer (headless Chrome) is also blocked, so
                    // skip both for the next 5 minutes.
                    if (msg.includes('cheerio.load() expects a string')) {
                        this.aniwatchSiteBlockedUntil = Date.now() + this.SITE_BLOCK_TTL_MS;
                        logger.warn(`[Miruro/aniwatch] Cloudflare block detected — suppressing puppeteer for ${this.SITE_BLOCK_TTL_MS / 60000} min`, undefined, this.name);
                        return { sources: [], subtitles: [] };
                    }
                    logger.warn(`[Miruro/aniwatch] ${srv} fail: ${msg.substring(0, 100)}`, undefined, this.name);
                }
            }
        }
        return { sources: [], subtitles: [] };
    }

    private mapAniwatchToStreaming(data: {
        sources?: Array<{ url: string; quality?: string; isM3U8?: boolean }>;
        subtitles?: Array<{ url: string; lang?: string }>;
        headers?: Record<string, string>;
        intro?: StreamingData['intro'];
    }): StreamingData {
        const sources = data.sources || [];
        const subtitles = data.subtitles || [];
        return {
            sources: sources.map(
                (s): VideoSource => ({
                    url: s.url,
                    quality: (s.quality as VideoSource['quality']) || 'auto',
                    isM3U8: !!(s.isM3U8 || s.url?.includes?.('.m3u8')),
                }),
            ),
            subtitles: subtitles.map((t) => ({
                url: t.url,
                lang: t.lang || 'Unknown',
                label: t.lang || 'Unknown',
            })),
            headers: data.headers || { Referer: 'https://aniwatchtv.to/' },
            intro: data.intro,
            source: this.name,
        };
    }

    /** Fallback: @consumet/extensions Hianime (same site family; useful if aniwatch pkg hits extractor edge cases). */
    private async tryConsumetHianime(
        episodeId: string,
        server: string | undefined,
        category: 'sub' | 'dub' = 'sub',
        _options?: SourceRequestOptions,
    ): Promise<StreamingData> {
        try {
            const mod = await getConsumetMod();
            const subOrDub = category === 'dub' ? mod.SubOrSub.DUB : mod.SubOrSub.SUB;
            const { consumet: consumetIds } = this.episodeIdVariantsForStreaming(episodeId);

            const serversToTry = server
                ? [this.mapStreamServerToConsumet(server, mod)]
                : [mod.StreamingServers.MegaCloud, mod.StreamingServers.VidCloud, mod.StreamingServers.VidStreaming];

            for (const consumetId of consumetIds) {
                for (const srv of serversToTry) {
                    if (srv === undefined) continue;
                    try {
                        logger.info(`[Miruro/consumet] ${category} ${consumetId} → ${srv}`, undefined, this.name);
                        const p = await this.getConsumetProvider();
                        const data = await Promise.race([
                            p.fetchEpisodeSources(consumetId, srv, subOrDub),
                            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 11_000)),
                        ]);

                        if (data.sources?.length > 0) {
                            const sd = this.mapStreamingData(data);
                            logger.info(`[Miruro/consumet] ✅ ${sd.sources.length} ${category} sources via ${srv}`, undefined, this.name);
                            this.handleSuccess();
                            return sd;
                        }
                    } catch (err) {
                        logger.warn(`[Miruro/consumet] ${srv} fail: ${(err as Error).message?.substring(0, 80)}`, undefined, this.name);
                    }
                }
            }
        } catch (err) {
            logger.warn(`[Miruro/consumet] init fail: ${(err as Error).message?.substring(0, 60)}`, undefined, this.name);
        }
        return { sources: [], subtitles: [] };
    }

    private mapStreamServerToConsumet(server: string, mod: any) {
        const s = server.toLowerCase();
        if (s.includes('vid') && s.includes('stream')) return mod.StreamingServers.VidStreaming;
        if (s.includes('vid') || s.includes('hd-2')) return mod.StreamingServers.VidCloud;
        if (s.includes('mega')) return mod.StreamingServers.MegaCloud;
        return mod.StreamingServers.VidCloud;
    }

    private mapStreamingData(data: {
        sources?: Array<{ url: string; quality?: VideoSource['quality']; isM3U8?: boolean }>;
        subtitles?: Array<{ url: string; lang?: string; label?: string }>;
        headers?: Record<string, string>;
        intro?: StreamingData['intro'];
        outro?: StreamingData['outro'];
    }): StreamingData {
        const sources = data.sources || [];
        const subtitles = data.subtitles || [];
        return {
            sources: sources.map(
                (s): VideoSource => ({
                    url: s.url,
                    quality: s.quality || 'auto',
                    isM3U8: !!(s.isM3U8 || s.url?.includes('.m3u8')),
                }),
            ),
            subtitles: subtitles
                .filter((t) => t.lang !== 'Thumbnails' && t.lang !== 'thumbnails')
                .map((sub) => ({
                    url: sub.url,
                    lang: sub.lang || 'Unknown',
                    label: sub.label || sub.lang || 'Unknown',
                })),
            headers: data.headers || { Referer: 'https://megacloud.blog/' },
            intro: data.intro,
            outro: data.outro,
            source: this.name,
        };
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const p = await this.getConsumetProvider();
            const res = await Promise.race([
                p.fetchMostPopular(page),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            this.handleSuccess();
            return (res.results || []).map((r: unknown) => this.mapAnime(r));
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const p = await this.getConsumetProvider();
            const res = await Promise.race([
                p.fetchRecentlyUpdated(page),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            this.handleSuccess();
            return (res.results || []).map((r: unknown) => this.mapAnime(r));
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, i) => ({
            rank: (page - 1) * limit + i + 1,
            anime,
        }));
    }
}
