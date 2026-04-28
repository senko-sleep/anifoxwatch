import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class CrazyAnimeTVSource extends BaseAnimeSource {
    name = 'CrazyAnimeTV';
    baseUrl = 'https://crazy-animetv.net';

    constructor() {
        super();
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(`${this.baseUrl}/`, {
                signal: options?.signal,
                timeout: options?.timeout || 5000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: { q: query, page },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.card a').each((i, el) => {
                const title = $(el).find('.title').text();
                const href = $(el).attr('href') || '';
                const id = href.split('/series/')[1] || '';
                const image = $(el).find('img').attr('src') || '';

                if (id) {
                    results.push({
                        id: `crazyanimetv-${id}`,
                        title: title,
                        image: image,
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

            const hasNextPage = $('.pagination .next').length > 0;

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
            const animeId = id.replace('crazyanimetv-', '');
            const response = await axios.get(`${this.baseUrl}/series/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);

            const title = $('.info h1').text();
            const image = $('.poster img').attr('src') || '';
            const desc = $('.description').text().trim();
            const type = 'TV';
            const status = 'Ongoing';
            const genres: string[] = [];
            $('.genres a').each((i, el) => {
                genres.push($(el).text().trim());
            });
            const episodes = parseInt($('.episodes').text().match(/\d+/)?.[0] || '0');

            return {
                id,
                title,
                titleJapanese: '',
                image,
                cover: image,
                description: desc,
                type: type as any,
                status: status as any,
                rating: 0,
                episodes,
                episodesAired: episodes,
                duration: '24m',
                genres,
                studios: [],
                year: 0,
                subCount: episodes,
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
            const id = animeId.replace('crazyanimetv-', '');
            const response = await axios.get(`${this.baseUrl}/series/${id}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            $('.episode a').each((i, el) => {
                const href = $(el).attr('href') || '';
                const epNum = parseInt(href.split('-ep-')[1] || '0');
                const title = $(el).text().trim() || `Episode ${epNum}`;

                episodes.push({
                    id: `crazyanimetv-${id}-episode-${epNum}`,
                    number: epNum,
                    title,
                    isFiller: false,
                    hasSub: true,
                    hasDub: false,
                    thumbnail: '',
                });
            });

            return episodes.reverse();
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [{ name: 'CrazyAnimeTV', url: '', type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const response = await axios.get(`${this.baseUrl}/${episodeId.replace('crazyanimetv-', '')}`, {
                signal: options?.signal,
                timeout: options?.timeout || 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': this.baseUrl
                }
            });
            const $ = cheerio.load(response.data);
            const sources: VideoSource[] = [];

            const scripts = $('script').toArray().map(s => $(s).html()).join('\n');
            const iframeSrc = $('iframe').attr('src');

            if (iframeSrc) {
                try {
                    const embedResp = await axios.get(iframeSrc.startsWith('http') ? iframeSrc : `${this.baseUrl}${iframeSrc}`, {
                        signal: options?.signal,
                        timeout: 8000,
                        headers: { 'Referer': this.baseUrl }
                    });
                    const html = embedResp.data;
                    const m3u8Matches = [...html.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)]
                        .map(m => m[1])
                        .filter(u => u.startsWith('http'));
                    if (m3u8Matches.length > 0) {
                        sources.push({
                            url: m3u8Matches[0],
                            quality: 'auto',
                            isM3U8: true,
                        });
                    }

                    const mp4Matches = [...html.matchAll(/["']([^"']*\.mp4[^"']*?)["']/g)]
                        .map(m => m[1])
                        .filter(u => u.startsWith('http'));
                    if (mp4Matches.length > 0 && sources.length === 0) {
                        sources.push({
                            url: mp4Matches[0],
                            quality: '720p',
                            isM3U8: false,
                        });
                    }
                } catch {
                    // Ignore embed fetch errors
                }
            }

            return {
                sources,
                subtitles: [],
                headers: { 'Referer': this.baseUrl },
                source: this.name
            };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.trending a').each((i, el) => {
                const title = $(el).find('.title').text();
                const href = $(el).attr('href') || '';
                const id = href.split('/series/')[1] || '';
                const image = $(el).find('img').attr('src') || '';

                if (id) {
                    results.push({
                        id: `crazyanimetv-${id}`,
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
        return this.getTrending(page, options);
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }
}