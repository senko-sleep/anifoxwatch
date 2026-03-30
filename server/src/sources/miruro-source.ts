/**
 * MiruroSource — scrapes miruro.in for episode metadata, then uses
 * two streaming backends:
 *   1) @consumet/extensions Hianime (with hianime.nz mirror)
 *   2) aniwatch HiAnime.Scraper (aniwatchtv.to fallback)
 *
 * Both support sub + dub via the same episode ID format.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { HiAnime } from 'aniwatch';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

let CONSUMET_MOD: any = null;
async function getConsumetMod() {
    if (!CONSUMET_MOD) CONSUMET_MOD = await import('@consumet/extensions');
    return CONSUMET_MOD;
}

export class MiruroSource extends BaseAnimeSource {
    name = 'Miruro';
    baseUrl = 'https://www.miruro.in';
    private consumetProvider: any = null;
    private aniwatchScraper: HiAnime.Scraper | null = null;

    private async getConsumetProvider() {
        if (!this.consumetProvider) {
            const mod = await getConsumetMod();
            this.consumetProvider = new mod.ANIME.Hianime();
            (this.consumetProvider as any).baseUrl = 'https://hianime.nz';
        }
        return this.consumetProvider;
    }

    private getAniwatchScraper(): HiAnime.Scraper {
        if (!this.aniwatchScraper) {
            // @ts-expect-error - aniwatch scraper constructor
            this.aniwatchScraper = new HiAnime.Scraper('https://aniwatchtv.to');
        }
        return this.aniwatchScraper;
    }

    private stripPrefix(id: string): string {
        return id.replace(/^miruro-/i, '');
    }

    private toConsumetEpId(id: string): string {
        return id.replace('?ep=', '$episode$');
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
            type: (data.type || 'TV') as any,
            status: (data.status || 'Ongoing') as any,
            rating: data.rating || 0,
            episodes: data.totalEpisodes || data.episodes || 0,
            episodesAired: data.totalEpisodes || 0,
            genres: data.genres || [],
            studios: [],
            year: data.releaseDate ? parseInt(data.releaseDate) : 0,
            subCount: data.sub || data.totalEpisodes || 0,
            dubCount: data.dub || 0,
            source: this.name,
            isMature: false,
        };
    }

    async search(query: string, page: number = 1, _filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const p = await this.getConsumetProvider();
            const res = await Promise.race([
                p.search(query, page),
                new Promise<any>((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            const results = (res.results || []).map((r: any) => this.mapAnime(r));
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

        // Try miruro.in details page first
        try {
            const res = await axios.get(`${this.baseUrl}/details/${slug}`, {
                timeout: options?.timeout || 12000,
                signal: options?.signal,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': this.baseUrl + '/' },
            });
            const $ = cheerio.load(res.data);
            const title = $('h2').first().text().trim()
                || $('meta[property="og:title"]').attr('content')?.replace(/\| Miruro$/, '').trim()
                || slug;
            const image = $('meta[property="og:image"]').attr('content') || '';
            const description = $('meta[property="og:description"]').attr('content') || '';
            const genres: string[] = [];
            $('a[href*="/genre/"]').each((_i, el) => {
                const g = $(el).text().trim();
                if (g) genres.push(g);
            });
            this.handleSuccess();
            return {
                id, title, image, cover: image, description,
                type: 'TV', status: 'Ongoing', rating: 0,
                episodes: 0, episodesAired: 0, genres, studios: [],
                year: 0, subCount: 0, dubCount: 0, source: this.name, isMature: false,
            };
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const slug = this.stripPrefix(animeId);

        // Primary: scrape miruro.in watch page
        try {
            const episodes = await this.scrapeEpisodesFromMiruro(slug, options);
            if (episodes.length > 0) {
                this.handleSuccess();
                return episodes;
            }
        } catch (e) {
            logger.warn(`[Miruro] HTML scrape failed: ${(e as Error).message?.substring(0, 80)}`, undefined, this.name);
        }

        // Fallback: consumet Hianime
        try {
            const p = await this.getConsumetProvider();
            const info = await Promise.race([
                p.fetchAnimeInfo(slug),
                new Promise<any>((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            const episodes: Episode[] = (info.episodes || []).map((ep: any, i: number) => ({
                id: ep.id ? ep.id.replace('$episode$', '?ep=') : `${slug}?ep=${i + 1}`,
                number: ep.number || i + 1,
                title: ep.title || `Episode ${ep.number || i + 1}`,
                isFiller: ep.isFiller || false,
                hasSub: ep.isSubbed !== false,
                hasDub: ep.isDubbed || false,
                thumbnail: ep.image || '',
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
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': this.baseUrl + '/' },
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
            const epNum = numMatch ? parseInt(numMatch[1]) : _i + 1;

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
        // Strategy 1: consumet Hianime provider (hianime.nz)
        const consumetResult = await this.tryConsumetStreaming(episodeId, server, category);
        if (consumetResult.sources.length > 0) return consumetResult;

        // Strategy 2: aniwatch HiAnime.Scraper (aniwatchtv.to)
        const aniwatchResult = await this.tryAniwatchStreaming(episodeId, server, category);
        if (aniwatchResult.sources.length > 0) return aniwatchResult;

        return { sources: [], subtitles: [] };
    }

    private async tryConsumetStreaming(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub'): Promise<StreamingData> {
        try {
            const mod = await getConsumetMod();
            const subOrDub = category === 'dub' ? mod.SubOrSub.DUB : mod.SubOrSub.SUB;
            const consumetId = this.toConsumetEpId(episodeId);

            const serversToTry = server
                ? [server]
                : [mod.StreamingServers.MegaCloud, mod.StreamingServers.VidCloud];

            for (const srv of serversToTry) {
                try {
                    logger.info(`[Miruro/consumet] ${category} ${consumetId} → ${srv}`, undefined, this.name);
                    const p = await this.getConsumetProvider();
                    const data = await Promise.race([
                        p.fetchEpisodeSources(consumetId, srv, subOrDub),
                        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
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
        } catch (err) {
            logger.warn(`[Miruro/consumet] init fail: ${(err as Error).message?.substring(0, 60)}`, undefined, this.name);
        }
        return { sources: [], subtitles: [] };
    }

    private async tryAniwatchStreaming(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub'): Promise<StreamingData> {
        const serversToTry = server ? [server] : ['hd-1', 'hd-2'];

        for (const srv of serversToTry) {
            try {
                logger.info(`[Miruro/aniwatch] ${category} ${episodeId} → ${srv}`, undefined, this.name);
                const data = await Promise.race([
                    this.getAniwatchScraper().getEpisodeSources(
                        episodeId,
                        srv as HiAnime.AnimeServers,
                        category,
                    ),
                    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
                ]);

                if (data.sources?.length > 0) {
                    const rawData = data as Record<string, unknown>;
                    const streamData: StreamingData = {
                        sources: (data.sources as Array<{ url: string; isM3U8?: boolean }>).map((s): VideoSource => ({
                            url: s.url,
                            quality: 'auto',
                            isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
                        })),
                        subtitles: ((rawData.tracks || rawData.subtitles || []) as Array<{ url: string; lang?: string; language?: string; label?: string }>)
                            .filter((t) => t.lang !== 'thumbnails')
                            .map((sub) => ({ url: sub.url, lang: sub.lang || sub.language || 'Unknown', label: sub.label || sub.lang || sub.language })),
                        headers: (rawData.headers as Record<string, string>) || { 'Referer': 'https://megacloud.blog/' },
                        source: this.name,
                    };
                    logger.info(`[Miruro/aniwatch] ✅ ${streamData.sources.length} ${category} sources via ${srv}`, undefined, this.name);
                    this.handleSuccess();
                    return streamData;
                }
            } catch (err) {
                logger.warn(`[Miruro/aniwatch] ${srv} fail: ${(err as Error).message?.substring(0, 80)}`, undefined, this.name);
            }
        }
        return { sources: [], subtitles: [] };
    }

    private mapStreamingData(data: any): StreamingData {
        return {
            sources: (data.sources || []).map((s: any): VideoSource => ({
                url: s.url,
                quality: s.quality || 'auto',
                isM3U8: s.isM3U8 || s.url?.includes('.m3u8'),
            })),
            subtitles: (data.subtitles || [])
                .filter((t: any) => t.lang !== 'Thumbnails' && t.lang !== 'thumbnails')
                .map((sub: any) => ({ url: sub.url, lang: sub.lang || 'Unknown', label: sub.label || sub.lang })),
            headers: data.headers || { 'Referer': 'https://megacloud.blog/' },
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
                new Promise<any>((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            this.handleSuccess();
            return (res.results || []).map((r: any) => this.mapAnime(r));
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
                new Promise<any>((_, r) => setTimeout(() => r(new Error('timeout')), 12000)),
            ]);
            this.handleSuccess();
            return (res.results || []).map((r: any) => this.mapAnime(r));
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
