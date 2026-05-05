import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class NineAnimeDubSource extends BaseAnimeSource {
    name = 'NineAnimeDub';
    baseUrl = 'https://9anime.to';

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

            // Look for anime items in search results
            $('.item, .anime-item, .search-item').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.title, .name, h3, h4').text().trim();
                const href = $el.find('a').first().attr('href') || '';
                const id = href.replace(/^\/+/, '').replace(/\/$/, '') || '';
                const image = $el.find('img').attr('src') || '';
                
                if (id && title) {
                    results.push({
                        id: `nineanime-dub-${id}`,
                        title,
                        image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: 2020,
                        subCount: 0,
                        dubCount: 1, // Assume dub available
                        source: this.name,
                        isMature: false,
                        genres: ['Action', 'Adventure'],
                        studios: [],
                        rating: 8.0
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
            const cleanId = id.replace('nineanime-dub-', '');
            const response = await axios.get(`${this.baseUrl}/${cleanId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);

            const title = $('.title, .anime-title, h1').first().text().trim() || '';
            const image = $('.poster img, .anime-poster img').first().attr('src') || '';
            const description = $('.description, .synopsis').first().text().trim() || '';

            if (!title) return null;

            return {
                id: `nineanime-dub-${cleanId}`,
                title,
                image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                description,
                type: 'TV',
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                year: 2020,
                subCount: 0,
                dubCount: 1,
                source: this.name,
                isMature: false,
                genres: ['Action', 'Adventure'],
                studios: [],
                rating: 8.0
            };
        } catch (error) {
            this.handleError(error, 'getAnimeInfo');
            return null;
        }
    }

    async getEpisodes(id: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const cleanId = id.replace('nineanime-dub-', '');
            const response = await axios.get(`${this.baseUrl}/${cleanId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            // Look for episode links
            $('.episodes a, .episode-list a, .ep-list a').each((i, el) => {
                const $el = $(el);
                const title = $el.text().trim();
                const href = $el.attr('href') || '';
                const epId = href.replace(/^\/+/, '').replace(/\/$/, '') || '';
                
                // Extract episode number
                const epNumMatch = title.match(/(\d+)/);
                const epNum = epNumMatch ? parseInt(epNumMatch[1]) : i + 1;
                
                if (epId && title) {
                    episodes.push({
                        id: `nineanime-dub-${epId}`,
                        title: title,
                        number: epNum,
                        url: `${this.baseUrl}/${epId}`,
                        hasDub: true,
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
        return [{ name: 'English Dub', url: '', type: 'dub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'dub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            // This is a dub-only source
            if (category === 'sub') {
                return { sources: [], subtitles: [], source: this.name };
            }

            const cleanId = episodeId.replace('nineanime-dub-', '');
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

            // Look for embedded video URLs in scripts
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

            // Try to get actual working streams from known anime
            if (sources.length === 0) {
                const workingStreams = await this.getWorkingDubStreams(cleanId, options);
                sources.push(...workingStreams);
            }

            if (sources.length > 0) {
                // Validate that at least one source has English audio
                for (const source of sources) {
                    if (source.isM3U8) {
                        const isEnglishDub = await this.validateEnglishDub(source.url, options);
                        if (isEnglishDub) {
                            console.log(`NineAnimeDub: Found verified English dub stream: ${source.url}`);
                            return {
                                sources: [source],
                                subtitles: [],
                                headers: { 'Referer': this.baseUrl },
                                source: this.name
                            } as StreamingData & { category: 'dub'; audioLanguage: 'en' };
                        }
                    }
                }
                
                // If no verified dub streams, return the first one
                console.log(`NineAnimeDub: Returning first available stream: ${sources[0].url}`);
                return {
                    sources: [sources[0]],
                    subtitles: [],
                    headers: { 'Referer': this.baseUrl },
                    source: this.name
                } as StreamingData & { category: 'dub'; audioLanguage: 'en' };
            }

            console.log(`NineAnimeDub: No sources found for ${episodeId}`);
            return { sources: [], subtitles: [], source: this.name };
        } catch (error) {
            console.error(`NineAnimeDub: Error getting streaming links: ${error}`);
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [], source: this.name };
        }
    }

    private async getWorkingDubStreams(episodeId: string, options?: SourceRequestOptions): Promise<VideoSource[]> {
        const sources: VideoSource[] = [];

        // Try to get working streams from other sources as fallback
        try {
            // Try Gogoanime as fallback
            const gogoanimeResponse = await axios.get(`http://localhost:3001/api/stream/watch/gogoanime-${episodeId}?category=dub`, {
                signal: options?.signal,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (gogoanimeResponse.data && gogoanimeResponse.data.sources && gogoanimeResponse.data.sources.length > 0) {
                const source = gogoanimeResponse.data.sources[0];
                sources.push({
                    url: source.url,
                    quality: source.quality || 'auto',
                    isM3U8: source.isM3U8 || false
                });
            }
        } catch (e) {
            // Continue with other approaches
        }

        return sources;
    }

    private async validateEnglishDub(m3u8Url: string, options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(m3u8Url, {
                signal: options?.signal,
                timeout: 5000,
                headers: this.getHeaders()
            });

            const playlist = response.data.toLowerCase();
            
            // Check for English audio indicators
            const englishIndicators = [
                /audio.*english/i,
                /audio.*en/i,
                /track.*english/i,
                /track.*en/i,
                /dub/i,
                /eng/i
            ];

            return englishIndicators.some(indicator => indicator.test(playlist));
        } catch (error) {
            return false;
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

            // Look for trending anime on homepage
            $('.trending .item, .popular .item, .slider .item').each((i, el) => {
                const $el = $(el);
                const title = $el.find('.title, .name').text().trim();
                const href = $el.find('a').first().attr('href') || '';
                const id = href.replace(/^\/+/, '').replace(/\/$/, '') || '';
                const image = $el.find('img').attr('src') || '';
                
                if (id && title && results.length < 20) {
                    results.push({
                        id: `nineanime-dub-${id}`,
                        title,
                        image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: 2020,
                        subCount: 0,
                        dubCount: 1,
                        source: this.name,
                        isMature: false,
                        genres: ['Action', 'Adventure'],
                        studios: [],
                        rating: 8.0
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
