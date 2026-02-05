import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class AnimeSugeSource extends BaseAnimeSource {
    name = 'AnimeSuge';
    baseUrl = 'https://animesuge.to';

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
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': this.baseUrl
        };
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
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
                const id = href.split('/').pop() || '';
                const image = $(el).find('.film-poster img').attr('data-src') || $(el).find('.film-poster img').attr('src') || '';
                const subCount = parseInt($(el).find('.tick-sub').text()) || 0;
                const dubCount = parseInt($(el).find('.tick-dub').text()) || 0;

                if (id) {
                    results.push({
                        id: `animesuge-${id}`,
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

            const hasNextPage = $('.pagination .page-item.active + .page-item').length > 0;

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
            const animeId = id.replace('animesuge-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${animeId}`, {
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

            const type = $('.item-title:contains("Type:") + .name').text().trim() || 'TV';
            const status = $('.item-title:contains("Status:") + .name').text().trim() || 'Ongoing';
            const episodes = parseInt($('.tick-sub').first().text()) || 0;

            return {
                id,
                title,
                image,
                cover: image,
                description,
                type: type as any,
                status: status as any,
                rating: 0,
                episodes,
                episodesAired: episodes,
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
            const id = animeId.replace('animesuge-', '');
            const response = await axios.get(`${this.baseUrl}/ajax/episode/list/${id}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'X-Requested-With': 'XMLHttpRequest' }
            });

            const $ = cheerio.load(response.data.html || response.data);
            const episodes: Episode[] = [];

            $('.ep-item').each((i, el) => {
                const epNum = parseInt($(el).attr('data-number') || '0');
                const epId = $(el).attr('data-id') || '';
                const title = $(el).attr('title') || `Episode ${epNum}`;

                episodes.push({
                    id: epId,
                    number: epNum,
                    title,
                    isFiller: false,
                    hasSub: true,
                    hasDub: $(el).hasClass('ssl-item-dub'),
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
            const response = await axios.get(`${this.baseUrl}/ajax/episode/servers/${episodeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'X-Requested-With': 'XMLHttpRequest' }
            });

            const $ = cheerio.load(response.data.html || response.data);
            const servers: EpisodeServer[] = [];

            $('.server-item').each((i, el) => {
                const serverName = $(el).text().trim();
                const serverId = $(el).attr('data-id') || '';
                const type = $(el).attr('data-type') || 'sub';

                servers.push({
                    name: serverName,
                    url: serverId,
                    type: type as 'sub' | 'dub'
                });
            });

            return servers;
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const response = await axios.get(`${this.baseUrl}/ajax/episode/sources/${episodeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'X-Requested-With': 'XMLHttpRequest' }
            });

            const embedUrl = response.data?.link;
            if (!embedUrl) {
                return { sources: [], subtitles: [] };
            }

            const sources: VideoSource[] = [];
            const subtitles: Array<{ url: string; lang: string }> = [];

            // Extract from embed
            const embedResponse = await axios.get(embedUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });

            const m3u8Match = embedResponse.data.match(/file:\s*["']([^"']*\.m3u8[^"']*)["']/);
            if (m3u8Match) {
                sources.push({
                    url: m3u8Match[1],
                    quality: 'auto',
                    isM3U8: true
                });
            }

            return {
                sources,
                subtitles,
                headers: { 'Referer': this.baseUrl }
            };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
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
                const id = href.split('/').pop() || '';
                const image = $(el).find('.film-poster img').attr('data-src') || '';

                if (id) {
                    results.push({
                        id: `animesuge-${id}`,
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
                const id = href.split('/').pop() || '';
                const image = $(el).find('.film-poster img').attr('data-src') || '';

                if (id) {
                    results.push({
                        id: `animesuge-${id}`,
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
