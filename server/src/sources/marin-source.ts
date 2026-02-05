import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class MarinSource extends BaseAnimeSource {
    name = 'Marin';
    baseUrl = 'https://marin.moe';

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
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': this.baseUrl
        };
    }

    async search(query: string, page: number = 1, _filters?: Record<string, unknown>, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/anime`, {
                params: { search: query, page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.anime-card, .card').each((i, el) => {
                const title = $(el).find('.title, .card-title').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.split('/').filter(Boolean).pop() || '';
                const image = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';

                if (id && title) {
                    results.push({
                        id: `marin-${id}`,
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

            const hasNextPage = $('.pagination .next:not(.disabled)').length > 0;

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
            const animeId = id.replace('marin-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);

            const title = $('h1, .anime-title').first().text().trim();
            const image = $('.poster img, .anime-poster img').attr('src') || '';
            const description = $('.synopsis, .description').text().trim();
            const genres: string[] = [];
            $('.genres a, .genre-tag').each((i, el) => {
                genres.push($(el).text().trim());
            });

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
                isMature: false
            };
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const id = animeId.replace('marin-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${id}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            $('.episode-item, .ep-card').each((i, el) => {
                const href = $(el).find('a').attr('href') || $(el).attr('href') || '';
                const epNum = parseInt($(el).find('.ep-num').text().replace(/\D/g, '')) || i + 1;
                const title = $(el).find('.ep-title').text().trim() || `Episode ${epNum}`;

                episodes.push({
                    id: href.split('/').pop() || `${id}-${epNum}`,
                    number: epNum,
                    title,
                    isFiller: false,
                    hasSub: true,
                    hasDub: false,
                    thumbnail: $(el).find('img').attr('src') || ''
                });
            });

            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [{ name: 'Marin', url: '', type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const response = await axios.get(`${this.baseUrl}/watch/${episodeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const sources: VideoSource[] = [];

            // Try to extract video source from script
            const scriptContent = $('script:contains("source")').html() || '';
            const sourceMatch = scriptContent.match(/source:\s*["']([^"']+)["']/);
            if (sourceMatch) {
                sources.push({
                    url: sourceMatch[1],
                    quality: 'auto',
                    isM3U8: sourceMatch[1].includes('.m3u8')
                });
            }

            // Try iframe extraction
            const iframeSrc = $('iframe, video source').attr('src');
            if (iframeSrc && sources.length === 0) {
                sources.push({
                    url: iframeSrc.startsWith('http') ? iframeSrc : `${this.baseUrl}${iframeSrc}`,
                    quality: 'auto',
                    isM3U8: iframeSrc.includes('.m3u8')
                });
            }

            return { sources, subtitles: [], headers: { 'Referer': this.baseUrl } };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/anime`, {
                params: { sort: 'popular', page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.anime-card, .card').each((i, el) => {
                const title = $(el).find('.title, .card-title').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.split('/').filter(Boolean).pop() || '';
                const image = $(el).find('img').attr('src') || '';

                if (id && title) {
                    results.push({
                        id: `marin-${id}`,
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
            const response = await axios.get(`${this.baseUrl}/anime`, {
                params: { sort: 'latest', page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.anime-card, .card').each((i, el) => {
                const title = $(el).find('.title, .card-title').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.split('/').filter(Boolean).pop() || '';
                const image = $(el).find('img').attr('src') || '';

                if (id && title) {
                    results.push({
                        id: `marin-${id}`,
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
