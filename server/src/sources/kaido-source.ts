import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { streamExtractor } from '../services/stream-extractor.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

export class KaidoSource extends BaseAnimeSource {
    name = 'Kaido';
    baseUrl = 'https://kaido.to';

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 5000,
                headers: this.getHeaders()
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    private getHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Referer': this.baseUrl
        };
    }

    private stripProviderPrefix(id: string): string {
        return id.replace(/^kaido-/i, '');
    }

    async search(query: string, page: number = 1, _filters?: Record<string, unknown>, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: { keyword: query, page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.film_list-wrap .flw-item').each((i, el) => {
                const title = $(el).find('.film-name a').text().trim();
                const href = $(el).find('.film-name a').attr('href') || '';
                const id = href.split('/').pop()?.split('?')[0] || '';
                const image = $(el).find('.film-poster img').attr('data-src') || $(el).find('.film-poster img').attr('src') || '';
                const subCount = parseInt($(el).find('.tick-sub').text()) || 0;
                const dubCount = parseInt($(el).find('.tick-dub').text()) || 0;

                if (id && title) {
                    results.push({
                        id: `kaido-${id}`,
                        title,
                        image,
                        cover: image,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: subCount || dubCount,
                        episodesAired: subCount || dubCount,
                        year: 0,
                        subCount,
                        dubCount,
                        source: this.name,
                        isMature: false,
                        genres: [],
                        studios: [],
                        rating: 0
                    });
                }
            });

            const hasNextPage = $('.pagination .page-item:last-child:not(.disabled)').length > 0;

            return {
                results,
                totalPages: hasNextPage ? page + 1 : page,
                currentPage: page,
                hasNextPage,
                source: this.name
            };
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const animeId = this.stripProviderPrefix(id);
            const response = await axios.get(`${this.baseUrl}/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);

            const title = $('.anisc-detail .film-name').text().trim();
            const image = $('.anisc-poster img').attr('src') || '';
            const description = $('.film-description .text').text().trim();
            const genres: string[] = [];
            $('.item-list a[href*="/genre/"]').each((i, el) => {
                genres.push($(el).text().trim());
            });

            const type = $('.item:contains("Type:") .name').text().trim() || 'TV';
            const status = $('.item:contains("Status:") .name').text().trim() || 'Ongoing';

            return {
                id,
                title,
                image,
                cover: image,
                description,
                type: type as 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special',
                status: status as 'Ongoing' | 'Completed' | 'Upcoming',
                rating: 0,
                episodes: 0,
                episodesAired: 0,
                genres,
                studios: [],
                year: 0,
                subCount: 0,
                dubCount: 0,
                source: this.name,
                isMature: false
            };
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const id = this.stripProviderPrefix(animeId);
            const dataId = id.split('-').pop();
            const response = await axios.get(`${this.baseUrl}/ajax/episode/list/${dataId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'X-Requested-With': 'XMLHttpRequest' }
            });

            const $ = cheerio.load(response.data.html || response.data);
            const episodes: Episode[] = [];

            $('.ep-item, .ssl-item').each((i, el) => {
                const epNum = parseInt($(el).attr('data-number') || '0') || i + 1;
                const epId = $(el).attr('data-id') || '';
                const href = $(el).attr('href') || '';
                const title = $(el).attr('title') || `Episode ${epNum}`;

                // Build episode ID in aniwatch format: "anime-slug?ep=12345"
                // href is like "/watch/road-of-naruto-18220?ep=94736"
                const hrefSlug = href.replace(/^\/watch\//, '').replace(/\?.*/, '');
                const hrefEpId = href.split('?ep=')[1] || epId;
                const fullEpId = hrefSlug ? `${hrefSlug}?ep=${hrefEpId}` : (hrefEpId || `${id}-${epNum}`);

                episodes.push({
                    id: fullEpId,
                    number: epNum,
                    title,
                    isFiller: $(el).hasClass('ssl-item-filler'),
                    hasSub: true,
                    hasDub: $(el).find('.tick-dub').length > 0,
                    thumbnail: ''
                });
            });

            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/ajax/episode/servers?episodeId=${encodeURIComponent(episodeId)}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'X-Requested-With': 'XMLHttpRequest' }
            });

            const $ = cheerio.load(response.data.html || response.data);
            const servers: EpisodeServer[] = [];

            $('.server-item').each((i, el) => {
                const serverName = $(el).text().trim();
                const serverId = $(el).attr('data-id') || '';
                const type = $(el).closest('.servers-sub').length > 0 ? 'sub' : 'dub';

                servers.push({
                    name: serverName,
                    url: serverId,
                    type: type as 'sub' | 'dub'
                });
            });

            return servers.length > 0 ? servers : [{ name: 'Default', url: '', type: 'sub' }];
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [{ name: 'Default', url: '', type: 'sub' }];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const cleanId = this.stripProviderPrefix(episodeId);
        const [animeSlug, epPart] = cleanId.split('?');
        const epNum = epPart?.replace('ep=', '')?.trim() || '';

        if (!animeSlug || !epNum) {
            logger.warn(`Kaido: invalid episode ID "${episodeId}"`, undefined, this.name);
            return { sources: [], subtitles: [] };
        }

        logger.info(`Getting streams for ${cleanId} via Puppeteer`, undefined, this.name);

        // 1) Try kaido.to — same watch URL format, distinct domain from 9anime
        try {
            const result = await Promise.race([
                streamExtractor.extractFromKaido(animeSlug, epNum),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error('kaido extraction timeout')), 22000))
            ]);
            if (result.success && result.streams?.length > 0) {
                logger.info(`Kaido.to Puppeteer got ${result.streams.length} sources for ${cleanId}`, undefined, this.name);
                return {
                    sources: result.streams.map((s) => ({
                        url: s.url,
                        quality: 'auto' as const,
                        isM3U8: s.type === 'hls' || s.url?.includes('.m3u8'),
                    })),
                    subtitles: (result.subtitles || []).map((sub) => ({
                        url: sub.url, lang: sub.lang, label: sub.lang
                    })),
                    headers: { Referer: 'https://kaido.to/' },
                    source: this.name
                };
            }
        } catch {
            logger.warn(`Kaido.to Puppeteer failed for ${cleanId}, trying 9animetv.to`, undefined, this.name);
        }

        // 2) Fallback: 9animetv.to (same slug format)
        try {
            const result = await Promise.race([
                streamExtractor.extractFrom9Anime(animeSlug, epNum),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error('9anime extraction timeout')), 22000))
            ]);
            if (result.success && result.streams?.length > 0) {
                logger.info(`9animetv.to Puppeteer got ${result.streams.length} sources for ${cleanId}`, undefined, this.name);
                return {
                    sources: result.streams.map((s) => ({
                        url: s.url,
                        quality: 'auto' as const,
                        isM3U8: s.type === 'hls' || s.url?.includes('.m3u8'),
                    })),
                    subtitles: (result.subtitles || []).map((sub) => ({
                        url: sub.url, lang: sub.lang, label: sub.lang
                    })),
                    headers: { Referer: 'https://9animetv.to/' },
                    source: this.name
                };
            }
        } catch {
            logger.warn(`9animetv.to Puppeteer also failed for ${cleanId}`, undefined, this.name);
        }

        return { sources: [], subtitles: [] };
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/most-popular`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.film_list-wrap .flw-item').each((i, el) => {
                const title = $(el).find('.film-name a').text().trim();
                const href = $(el).find('.film-name a').attr('href') || '';
                const id = href.split('/').pop()?.split('?')[0] || '';
                const image = $(el).find('.film-poster img').attr('data-src') || '';

                if (id && title) {
                    results.push({
                        id: `kaido-${id}`,
                        title,
                        image,
                        cover: image,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: 0,
                        subCount: 0,
                        dubCount: 0,
                        source: this.name,
                        isMature: false,
                        genres: [],
                        studios: [],
                        rating: 0
                    });
                }
            });

            return results;
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/recently-updated`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.film_list-wrap .flw-item').each((i, el) => {
                const title = $(el).find('.film-name a').text().trim();
                const href = $(el).find('.film-name a').attr('href') || '';
                const id = href.split('/').pop()?.split('?')[0] || '';
                const image = $(el).find('.film-poster img').attr('data-src') || '';

                if (id && title) {
                    results.push({
                        id: `kaido-${id}`,
                        title,
                        image,
                        cover: image,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: new Date().getFullYear(),
                        subCount: 0,
                        dubCount: 0,
                        source: this.name,
                        isMature: false,
                        genres: [],
                        studios: [],
                        rating: 0
                    });
                }
            });

            return results;
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, index) => ({
            rank: (page - 1) * limit + index + 1,
            anime
        }));
    }
}
