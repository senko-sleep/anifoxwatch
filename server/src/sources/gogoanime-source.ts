import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class GogoanimeSource extends BaseAnimeSource {
    name = 'Gogoanime';
    baseUrl = 'https://anitaku.pe';
    ajaxUrl = 'https://ajax.gogocdn.net/ajax';

    constructor() {
        super();
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(`${this.baseUrl}/home.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 5000
            });
            return response.status === 200;
        } catch (e) {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/search.html`, {
                params: { keyword: query, page },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.last_episodes .items li').each((i, el) => {
                const title = $(el).find('.name a').text();
                const href = $(el).find('.name a').attr('href') || '';
                const id = href.split('/category/')[1] || '';
                const image = $(el).find('.img a img').attr('src') || '';
                const released = $(el).find('.released').text().trim().replace('Released: ', '');

                if (id) {
                    results.push({
                        id: `gogoanime-${id}`,
                        title: title,
                        image: image,
                        cover: image,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: parseInt(released) || 0,
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
            const animeId = id.replace('gogoanime-', '');
            const response = await axios.get(`${this.baseUrl}/category/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);

            const title = $('.anime_info_body_bg h1').text();
            const image = $('.anime_info_body_bg img').attr('src') || '';
            const type = $('.anime_info_body_bg p.type:contains("Type:") a').text();
            let desc = $('.anime_info_body_bg p.type:contains("Plot Summary:")').text().replace('Plot Summary:', '').trim();
            const released = $('.anime_info_body_bg p.type:contains("Released:")').text().replace('Released:', '').trim();
            const status = $('.anime_info_body_bg p.type:contains("Status:") a').text();
            const genres: string[] = [];
            $('.anime_info_body_bg p.type:contains("Genre:") a').each((i, el) => {
                genres.push($(el).text().replace(',', '').trim());
            });

            const epEnd = $('#episode_page li').last().find('a').attr('ep_end');
            const totalEpisodes = epEnd ? parseInt(epEnd) : 0;

            return {
                id,
                title,
                titleJapanese: '',
                image,
                cover: image,
                description: desc,
                type: (type as any) || 'TV',
                status: (status as any) || 'Completed',
                rating: 0,
                episodes: totalEpisodes,
                episodesAired: totalEpisodes,
                duration: '24m',
                genres,
                studios: [],
                year: parseInt(released) || 0,
                subCount: totalEpisodes,
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
            const id = animeId.replace('gogoanime-', '');
            const response = await axios.get(`${this.baseUrl}/category/${id}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);

            const movieId = $('#movie_id').val();
            const alias = $('#alias_anime').val();
            const defaultEp = $('#default_ep').val();
            const epEnd = $('#episode_page li').last().find('a').attr('ep_end') || '2000';

            if (!movieId) return [];

            const listUrl = `${this.ajaxUrl}/load-list-episode?ep_start=0&ep_end=${epEnd}&id=${movieId}&default_ep=${defaultEp}&alias=${alias}`;
            const listResponse = await axios.get(listUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $list = cheerio.load(listResponse.data);

            const episodes: Episode[] = [];
            $list('li a').each((i, el) => {
                const epNumStr = $(el).find('.name').text().replace('EP ', '').trim();
                const epNum = parseFloat(epNumStr);
                const href = $(el).attr('href')?.trim() || '';
                const epId = href.startsWith('/') ? href.substring(1) : href;

                episodes.push({
                    id: epId,
                    number: epNum || 0,
                    title: `Episode ${epNum}`,
                    isFiller: false,
                    hasSub: true,
                    hasDub: false,
                    thumbnail: ''
                });
            });

            return episodes.reverse();
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/${episodeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);

            const servers: EpisodeServer[] = [];
            $('.anime_muti_link ul li').each((i, el) => {
                const serverName = $(el).find('a').text().trim();
                if (serverName) {
                    servers.push({
                        name: serverName,
                        url: '',
                        type: 'sub'
                    });
                }
            });

            return servers;
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [
                { name: 'Vidstreaming', url: '', type: 'sub' },
                { name: 'Gogo server', url: '', type: 'sub' }
            ];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        const epId = episodeId.replace(/^gogoanime-/i, '');
        try {
            const response = await axios.get(`${this.baseUrl}/${epId}`, {
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
            const subtitles: Array<{ url: string; lang: string }> = [];

            const iframeSrc = $('#load_anime iframe').attr('src') ||
                $('.play-video iframe').attr('src') ||
                $('iframe[src*="vidstreaming"]').attr('src') ||
                $('iframe[src*="gogocdn"]').attr('src') ||
                $('iframe[src*="streamani"]').attr('src');

            if (iframeSrc) {
                let streamingUrl = iframeSrc;
                if (!streamingUrl.startsWith('http')) {
                    streamingUrl = `https:${streamingUrl}`;
                }

                try {
                    const iframeResponse = await axios.get(streamingUrl, {
                        signal: options?.signal,
                        timeout: options?.timeout || 15000,
                        headers: {
                            'Referer': this.baseUrl,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,*/*;q=0.8'
                        }
                    });

                    const iframeHtml = typeof iframeResponse.data === 'string'
                        ? iframeResponse.data
                        : JSON.stringify(iframeResponse.data);

                    // Try to find m3u8 first (HLS stream), then mp4
                    const m3u8Matches = [...iframeHtml.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)];
                    const mp4Match = iframeHtml.match(/file:\s*["']([^"']*\.mp4[^"']*)["']/);

                    if (m3u8Matches.length > 0) {
                        // Filter out obviously wrong URLs and pick the best one
                        const validM3u8 = m3u8Matches
                            .map(m => m[1])
                            .filter(u => u.startsWith('http') && !u.includes('thumb') && !u.includes('poster'));
                        if (validM3u8.length > 0) {
                            sources.push({
                                url: validM3u8[0],
                                quality: 'auto',
                                isM3U8: true
                            });
                        }
                    }

                    if (sources.length === 0 && mp4Match) {
                        sources.push({
                            url: mp4Match[1],
                            quality: '720p',
                            isM3U8: false
                        });
                    }
                } catch {
                    // If iframe fetch fails, don't add the iframe URL as a source (it's not playable)
                }
            }

            return {
                sources,
                subtitles,
                headers: {
                    'Referer': this.baseUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                source: this.name
            };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/popular.html`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.last_episodes .items li').each((i, el) => {
                const title = $(el).find('.name a').text();
                const image = $(el).find('.img a img').attr('src') || '';
                const href = $(el).find('.name a').attr('href') || '';
                const id = href.split('/category/')[1] || '';
                const released = $(el).find('.released').text().trim().replace('Released: ', '');

                if (id) {
                    results.push({
                        id: `gogoanime-${id}`,
                        title: title,
                        image: image,
                        cover: image,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: parseInt(released) || 0,
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
            const response = await axios.get(`${this.baseUrl}/home.html`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.last_episodes .items li').each((i, el) => {
                const title = $(el).find('.name a').text();
                const image = $(el).find('.img a img').attr('src') || '';
                const href = $(el).find('.name a').attr('href') || '';
                const episodeId = href.substring(1);
                const animeId = episodeId.replace(/-episode-\d+$/, '');

                results.push({
                    id: `gogoanime-${animeId}`,
                    title: title,
                    image: image,
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
            });

            return results;
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }

}
