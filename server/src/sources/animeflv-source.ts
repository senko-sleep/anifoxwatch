import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class AnimeFLVSource extends BaseAnimeSource {
    name = 'AnimeFLV';
    baseUrl = 'https://www3.animeflv.net';

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
            'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
            'Referer': this.baseUrl
        };
    }

    async search(query: string, page: number = 1, _filters?: Record<string, unknown>, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/browse`, {
                params: { q: query, page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.ListAnimes .Anime').each((i, el) => {
                const title = $(el).find('.Title').text().trim();
                const href = $(el).find('a').attr('href') || '';
                const id = href.split('/anime/').pop() || '';
                const image = $(el).find('img').attr('src') || '';
                const type = $(el).find('.Type').text().trim();

                if (id && title) {
                    results.push({
                        id: `animeflv-${id}`,
                        title,
                        image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        description: '',
                        type: this.mapType(type),
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

            const hasNextPage = $('.pagination .active + li a').length > 0;

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
            const animeId = id.replace('animeflv-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);

            const title = $('.Title').first().text().trim();
            const image = $('.AnimeCover img').attr('src') || '';
            const description = $('.Description').text().trim();
            const genres: string[] = [];
            $('.Nvgnrs a').each((i, el) => {
                genres.push($(el).text().trim());
            });

            const type = $('.Type').first().text().trim();
            const status = $('.AnmStts span').text().trim();

            return {
                id,
                title,
                image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                description,
                type: this.mapType(type),
                status: status.toLowerCase().includes('emision') ? 'Ongoing' : 'Completed',
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
            const id = animeId.replace('animeflv-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${id}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            // Extract episode info from script
            const scriptContent = $('script:contains("var episodes")').html() || '';
            const episodesMatch = scriptContent.match(/var episodes\s*=\s*(\[[\s\S]*?\]);/);
            if (episodesMatch) {
                try {
                    const epList: number[][] = JSON.parse(episodesMatch[1]);
                    epList.forEach((ep) => {
                        const epNum = ep[0];
                        episodes.push({
                            id: `animeflv-${id}-${epNum}`,
                            number: epNum,
                            title: `Episode ${epNum}`,
                            isFiller: false,
                            hasSub: true,
                            hasDub: false,
                            thumbnail: ''
                        });
                    });
                } catch {
                    // Parse failed
                }
            }

            // Fallback: scrape episode list
            if (episodes.length === 0) {
                $('.ListCaps li a, #episodeList a').each((i, el) => {
                    const href = $(el).attr('href') || '';
                    const epNum = parseInt(href.split('-').pop() || '0') || i + 1;
                    const rawEpId = href.split('/ver/').pop() || `${id}-${epNum}`;
                    episodes.push({
                        id: `animeflv-${rawEpId}`,
                        number: epNum,
                        title: `Episode ${epNum}`,
                        isFiller: false,
                        hasSub: true,
                        hasDub: false,
                        thumbnail: ''
                    });
                });
            }

            return episodes.sort((a, b) => a.number - b.number);
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        try {
            const epId = episodeId.replace('animeflv-', '');
            const response = await axios.get(`${this.baseUrl}/ver/${epId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const servers: EpisodeServer[] = [];

            $('.RTbl .Optns li').each((i, el) => {
                const serverName = $(el).find('.Stmvideo').text().trim();
                if (serverName) {
                    servers.push({ name: serverName, url: '', type: 'sub' });
                }
            });

            return servers.length > 0 ? servers : [{ name: 'Default', url: '', type: 'sub' }];
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [{ name: 'Default', url: '', type: 'sub' }];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const epId = episodeId.replace('animeflv-', '');
            const response = await axios.get(`${this.baseUrl}/ver/${epId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const sources: VideoSource[] = [];

            // Extract videos from script — format: var videos = {"SUB":[{"server":"sw","title":"SW","code":"https://..."},...]}
            const scriptContent = $('script:contains("var videos")').html() || '';
            const videosMatch = scriptContent.match(/var videos\s*=\s*(\{[\s\S]*?\});/);
            if (videosMatch) {
                try {
                    const videos = JSON.parse(videosMatch[1]);
                    const category_key = category === 'dub' ? 'LAT' : 'SUB';
                    const serverList = videos[category_key] || videos.SUB || [];
                    serverList.forEach((v: { code: string; title: string; url?: string }) => {
                        // code can be a direct URL or an iframe src="..." string
                        let url = '';
                        if (v.code.startsWith('http')) {
                            url = v.code;
                        } else {
                            const srcMatch = v.code.match(/src="([^"]+)"/);
                            if (srcMatch) url = srcMatch[1];
                        }
                        if (url) {
                            sources.push({
                                url: url.startsWith('http') ? url : `https:${url}`,
                                quality: 'auto',
                                isM3U8: url.includes('.m3u8')
                            });
                        }
                    });
                } catch {
                    // Parse failed
                }
            }

            // Fallback: extract iframe
            const iframeSrc = $('iframe').attr('src');
            if (iframeSrc && sources.length === 0) {
                sources.push({
                    url: iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`,
                    quality: 'auto',
                    isM3U8: false
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
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.ListAnimes .Anime').slice(0, 20).each((i, el) => {
                const title = $(el).find('.Title').text().trim();
                const href = $(el).find('a').attr('href') || '';
                const id = href.split('/anime/').pop() || '';
                const image = $(el).find('img').attr('src') || '';

                if (id && title) {
                    results.push({
                        id: `animeflv-${id}`,
                        title,
                        image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
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
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.ListEpisodios li').each((i, el) => {
                const title = $(el).find('.Title').text().trim();
                const href = $(el).find('a').attr('href') || '';
                const epId = href.split('/ver/').pop() || '';
                const animeId = epId.replace(/-\d+$/, '');
                const image = $(el).find('img').attr('src') || '';

                if (animeId && title) {
                    results.push({
                        id: `animeflv-${animeId}`,
                        title: title.replace(/\s*-\s*\d+$/, ''),
                        image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
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

    private mapType(type: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = type.toLowerCase();
        if (t.includes('película') || t.includes('movie')) return 'Movie';
        if (t.includes('ova')) return 'OVA';
        if (t.includes('ona')) return 'ONA';
        if (t.includes('especial') || t.includes('special')) return 'Special';
        return 'TV';
    }
}
