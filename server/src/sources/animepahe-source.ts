import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class AnimePaheSource extends BaseAnimeSource {
    name = 'AnimePahe';
    baseUrl = 'https://animepahe.ru';
    apiUrl = 'https://animepahe.ru/api';

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
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': this.baseUrl,
            'Cookie': '__ddg1=; __ddg2_='
        };
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.apiUrl}`, {
                params: { m: 'search', q: query },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });

            const data = response.data?.data || [];
            const results: AnimeBase[] = data.map((item: any) => ({
                id: `animepahe-${item.session}`,
                title: item.title,
                image: item.poster,
                cover: item.poster,
                description: '',
                type: item.type || 'TV',
                status: item.status || 'Ongoing',
                episodes: item.episodes || 0,
                episodesAired: item.episodes || 0,
                year: item.year || 0,
                subCount: item.episodes || 0,
                dubCount: 0,
                source: this.name,
                isMature: false,
                genres: [],
                studios: [],
                rating: item.score || 0
            }));

            return {
                results,
                totalPages: 1,
                currentPage: page,
                hasNextPage: false,
                source: this.name
            };
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const session = id.replace('animepahe-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${session}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);

            const title = $('h1 span').text().trim() || $('h1').text().trim();
            const image = $('.anime-poster img').attr('src') || '';
            const description = $('.anime-synopsis').text().trim();
            const genres: string[] = [];
            $('.anime-genre a').each((i, el) => {
                genres.push($(el).text().trim());
            });

            const infoText = $('.anime-info').text();
            const typeMatch = infoText.match(/Type:\s*(\w+)/);
            const statusMatch = infoText.match(/Status:\s*(\w+)/);
            const episodesMatch = infoText.match(/Episodes:\s*(\d+)/);

            return {
                id,
                title,
                image,
                cover: image,
                description,
                type: (typeMatch?.[1] as any) || 'TV',
                status: (statusMatch?.[1] as any) || 'Completed',
                rating: 0,
                episodes: parseInt(episodesMatch?.[1] || '0'),
                episodesAired: parseInt(episodesMatch?.[1] || '0'),
                genres,
                studios: [],
                year: 0,
                subCount: parseInt(episodesMatch?.[1] || '0'),
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
            const session = animeId.replace('animepahe-', '');
            const episodes: Episode[] = [];
            let page = 1;
            let hasMore = true;

            while (hasMore && page <= 10) {
                const response = await axios.get(`${this.apiUrl}`, {
                    params: { m: 'release', id: session, sort: 'episode_asc', page },
                    signal: options?.signal,
                    timeout: options?.timeout || 10000,
                    headers: this.getHeaders()
                });

                const data = response.data?.data || [];
                if (data.length === 0) {
                    hasMore = false;
                    break;
                }

                data.forEach((ep: any) => {
                    episodes.push({
                        id: `${session}/${ep.session}`,
                        number: ep.episode || 0,
                        title: `Episode ${ep.episode}`,
                        isFiller: ep.filler === 1,
                        hasSub: true,
                        hasDub: false,
                        thumbnail: ep.snapshot || ''
                    });
                });

                hasMore = response.data?.next_page_url !== null;
                page++;
            }

            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [
            { name: 'Kwik', url: '', type: 'sub' }
        ];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const [session, epSession] = episodeId.split('/');
            const response = await axios.get(`${this.baseUrl}/play/${session}/${epSession}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);

            const sources: VideoSource[] = [];
            const subtitles: Array<{ url: string; lang: string }> = [];

            // Extract kwik links
            $('#pickDownload a').each((i, el) => {
                const href = $(el).attr('href') || '';
                const quality = $(el).text().trim();
                if (href.includes('kwik')) {
                    sources.push({
                        url: href,
                        quality: this.normalizeQuality(quality),
                        isM3U8: false
                    });
                }
            });

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
            const response = await axios.get(`${this.apiUrl}`, {
                params: { m: 'airing', page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });

            const data = response.data?.data || [];
            return data.map((item: any) => ({
                id: `animepahe-${item.anime_session}`,
                title: item.anime_title,
                image: item.snapshot || '',
                cover: item.snapshot || '',
                description: '',
                type: 'TV',
                status: 'Ongoing',
                episodes: item.episode || 0,
                episodesAired: item.episode || 0,
                year: new Date().getFullYear(),
                subCount: item.episode || 0,
                dubCount: 0,
                source: this.name,
                isMature: false,
                genres: [],
                studios: [],
                rating: 0
            }));
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return this.getTrending(page, options);
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, index) => ({
            rank: (page - 1) * limit + index + 1,
            anime
        }));
    }

    private normalizeQuality(quality: string): VideoSource['quality'] {
        if (!quality) return 'auto';
        const q = quality.toLowerCase();
        if (q.includes('1080')) return '1080p';
        if (q.includes('720')) return '720p';
        if (q.includes('480')) return '480p';
        if (q.includes('360')) return '360p';
        return 'auto';
    }
}
