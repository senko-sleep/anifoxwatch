import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class AnimeDubTVSource extends BaseAnimeSource {
    name = 'AnimeDubTV';
    baseUrl = 'https://animedub.tv';

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

    async search(query: string, page: number = 1, _filters?: Record<string, unknown>, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: { keyword: query },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            // Look for anime links in search results
            $('a[href*="/anime/"]').each((i, el) => {
                const $el = $(el);
                const title = $el.text().trim();
                const href = $el.attr('href') || '';
                const id = href.replace('/anime/', '').replace(/^\//, '') || '';
                
                if (id && title) {
                    results.push({
                        id: `animedubtv-${id}`,
                        title: title,
                        image: '',
                        cover: '',
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: 0,
                        subCount: 0,
                        dubCount: 1, // This is a dub site, so assume dub available
                        source: this.name,
                        isMature: false,
                        genres: [],
                        studios: [],
                        rating: 0
                    });
                }
            });

            return {
                results,
                hasMore: false,
                currentPage: page
            };
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], hasMore: false, currentPage: page };
        }
    }

    async getAnimeInfo(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const cleanId = id.replace('animedubtv-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${cleanId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);

            const title = $('h1, .title, .anime-title').first().text().trim() || '';
            const image = $('img[src*="poster"], img[src*="cover"]').first().attr('src') || '';
            const description = $('.description, .synopsis, .summary').first().text().trim() || '';

            if (!title) return null;

            return {
                id: `animedubtv-${cleanId}`,
                title,
                image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                description,
                type: 'TV',
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                year: 0,
                subCount: 0,
                dubCount: 1, // Dub site
                source: this.name,
                isMature: false,
                genres: [],
                studios: [],
                rating: 0
            };
        } catch (error) {
            this.handleError(error, 'getAnimeInfo');
            return null;
        }
    }

    async getEpisodes(id: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const cleanId = id.replace('animedubtv-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${cleanId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            // Look for episode links
            $('a[href*="/episode/"], a[href*="/watch/"]').each((i, el) => {
                const $el = $(el);
                const title = $el.text().trim();
                const href = $el.attr('href') || '';
                const epId = href.replace(/^\/+/, '').replace(/\.html$/, '') || '';
                
                // Extract episode number
                const epNumMatch = title.match(/(\d+)/);
                const epNum = epNumMatch ? parseInt(epNumMatch[1]) : i + 1;
                
                if (epId && title) {
                    episodes.push({
                        id: `animedubtv-${epId}`,
                        title: title,
                        number: epNum,
                        url: `${this.baseUrl}/${epId}`,
                        hasDub: true, // This is a dub site
                        hasSub: false,
                        thumbnail: ''
                    });
                }
            });

            return episodes.sort((a, b) => a.number - b.number);
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [{ name: 'Default', url: '', type: 'dub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'dub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            // AnimeDubTV is a dub-only site, so always return dub content
            if (category === 'sub') {
                return { sources: [], subtitles: [], source: this.name };
            }

            const cleanId = episodeId.replace('animedubtv-', '');
            const response = await axios.get(`${this.baseUrl}/${cleanId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            
            const $ = cheerio.load(response.data);
            const sources: VideoSource[] = [];

            // Look for video sources
            $('source, video source').each((i, el) => {
                const src = $(el).attr('src');
                if (src) {
                    sources.push({
                        url: src.startsWith('http') ? src : `${this.baseUrl}${src}`,
                        quality: $(el).attr('label') as VideoSource['quality'] || 'auto',
                        isM3U8: src.includes('.m3u8')
                    });
                }
            });

            // Try iframe sources
            $('iframe').each((i, el) => {
                const src = $(el).attr('src');
                if (src && sources.length === 0) {
                    const embedUrl = src.startsWith('http') ? src : `https:${src}`;
                    sources.push({
                        url: embedUrl,
                        quality: 'auto',
                        isM3U8: false
                    });
                }
            });

            // Try direct video URLs in script tags
            $('script').each((i, el) => {
                const scriptContent = $(el).html() || '';
                const urlMatches = scriptContent.match(/["']([^"']*\.m3u8[^"']*?)["']/g) ||
                                 scriptContent.match(/["']([^"']*\.mp4[^"']*?)["']/g);
                
                if (urlMatches && sources.length === 0) {
                    urlMatches.forEach(url => {
                        const cleanUrl = url.replace(/["']/g, '');
                        if (cleanUrl.startsWith('http')) {
                            sources.push({
                                url: cleanUrl,
                                quality: 'auto',
                                isM3U8: cleanUrl.includes('.m3u8')
                            });
                        }
                    });
                }
            });

            if (sources.length > 0) {
                console.log(`AnimeDubTV: Found ${sources.length} dub sources for ${episodeId}`);
                return {
                    sources,
                    subtitles: [],
                    headers: { 'Referer': this.baseUrl },
                    source: this.name
                } as StreamingData & { category: 'dub'; audioLanguage: 'en' };
            }

            console.log(`AnimeDubTV: No sources found for ${episodeId}`);
            return { sources: [], subtitles: [], source: this.name };
        } catch (error) {
            console.error(`AnimeDubTV: Error getting streaming links: ${error}`);
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [], source: this.name };
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

            // Look for featured/popular anime on homepage
            $('a[href*="/anime/"]').each((i, el) => {
                const $el = $(el);
                const title = $el.text().trim();
                const href = $el.attr('href') || '';
                const id = href.replace('/anime/', '').replace(/^\//, '') || '';
                
                if (id && title && results.length < 20) { // Limit to 20 results
                    results.push({
                        id: `animedubtv-${id}`,
                        title,
                        image: '',
                        cover: '',
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: 0,
                        subCount: 0,
                        dubCount: 1,
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
}
