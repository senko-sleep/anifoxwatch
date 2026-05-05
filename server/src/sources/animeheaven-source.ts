import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class AnimeHeavenSource extends BaseAnimeSource {
    name = 'AnimeHeaven';
    baseUrl = 'https://animeheaven.ru';

     async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
         try {
             const response = await axios.get(this.baseUrl, {
                 signal: options?.signal,
                 timeout: options?.timeout || 15000, // Increased from 5000 to 15000
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

     async search(query: string, page: number = 1, _filters?: Record<string, unknown>, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
         try {
             const response = await axios.get(`${this.baseUrl}/search.php`, {
                 params: { s: query },
                 signal: options?.signal,
                 timeout: options?.timeout || 30000, // Increased from 10000 to 30000
                 headers: this.getHeaders()
             });
             const $ = cheerio.load(response.data);
             const results: AnimeBase[] = [];

             $('.chartlist .chart.bc1, .searchlist .item').each((i, el) => {
                 const title = $(el).find('.c2 a, .info a').text().trim();
                 const href = $(el).find('a').first().attr('href') || '';
                 const id = href.replace('/anime/', '').replace('.html', '') || '';
                 const image = $(el).find('img').attr('src') || '';

                 if (id && title) {
                     results.push({
                         id: `animeheaven-${id}`,
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
            const animeId = id.replace('animeheaven-', '');
             const response = await axios.get(`${this.baseUrl}/anime/${animeId}.html`, {
                 signal: options?.signal,
                 timeout: options?.timeout || 30000, // Increased from 10000 to 30000
                 headers: this.getHeaders()
             });
            const $ = cheerio.load(response.data);

            const title = $('h1.anime-title, .infodiv .infodes h1').text().trim();
            const image = $('.animepic img, .poster img').attr('src') || '';
            const description = $('.syntext, .desc').text().trim();
            const genres: string[] = [];
            $('.genres a, .infodiv a[href*="genre"]').each((i, el) => {
                genres.push($(el).text().trim());
            });

            return {
                id,
                title,
                image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
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
            const id = animeId.replace('animeheaven-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${id}.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            $('.s1list .s1list-n a, .episodelist a').each((i, el) => {
                const href = $(el).attr('href') || '';
                const epText = $(el).text().trim();
                const epNum = parseInt(epText.replace(/\D/g, '')) || i + 1;

                episodes.push({
                    id: href.split('/').pop()?.replace('.html', '') || `${id}-ep-${epNum}`,
                    number: epNum,
                    title: `Episode ${epNum}`,
                    isFiller: false,
                    hasSub: true,
                    hasDub: false,
                    thumbnail: ''
                });
            });

            return episodes.sort((a, b) => a.number - b.number);
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [{ name: 'Default', url: '', type: 'sub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            // For dub category, try to find dub content
            if (category === 'dub') {
                return await this.extractDubStreams(episodeId, options);
            }

            const response = await axios.get(`${this.baseUrl}/watch/${episodeId}.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const sources: VideoSource[] = [];

            // Extract video sources
            $('source, .video-container source').each((i, el) => {
                const src = $(el).attr('src');
                if (src) {
                    sources.push({
                        url: src.startsWith('http') ? src : `${this.baseUrl}${src}`,
                        quality: $(el).attr('label') as VideoSource['quality'] || 'auto',
                        isM3U8: src.includes('.m3u8')
                    });
                }
            });

            // Try iframe
            const iframeSrc = $('iframe').attr('src');
            if (iframeSrc && sources.length === 0) {
                const embedUrl = iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`;
                const embedResponse = await axios.get(embedUrl, {
                    signal: options?.signal,
                    timeout: options?.timeout || 10000,
                    headers: this.getHeaders()
                });

                const m3u8Match = embedResponse.data.match(/file:\s*["']([^"']*\.m3u8[^"']*)["']/);
                if (m3u8Match) {
                    sources.push({ url: m3u8Match[1], quality: 'auto', isM3U8: true });
                }
            }

            return { sources, subtitles: [], headers: { 'Referer': this.baseUrl } };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    private async extractDubStreams(episodeId: string, options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            console.log(`AnimeHeaven: Extracting dub streams for ${episodeId}`);
            
            const response = await axios.get(`${this.baseUrl}/watch/${episodeId}.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            
            const $ = cheerio.load(response.data);
            const pageContent = response.data.toLowerCase();
            
            // Check for dub indicators
            const hasDubIndicators = 
                pageContent.includes('dub') ||
                pageContent.includes('english') ||
                $('[data-dub]').length > 0 ||
                $('.dub').length > 0 ||
                $('*:contains("Dub")').length > 0 ||
                $('*:contains("English")').length > 0;
            
            if (!hasDubIndicators) {
                console.log(`AnimeHeaven: No dub indicators found for ${episodeId}`);
                return { sources: [], subtitles: [], source: this.name };
            }
            
            console.log(`AnimeHeaven: Found dub indicators, extracting streams...`);
            
            const sources: VideoSource[] = [];
            
            // Look for dub-specific video sources
            $('source, .video-container source').each((i, el) => {
                const src = $(el).attr('src');
                if (src) {
                    const parentText = $(el).parent().text().toLowerCase();
                    const isDub = parentText.includes('dub') || 
                                 parentText.includes('english') ||
                                 $(el).hasClass('dub') ||
                                 $(el).attr('data-dub') !== undefined;
                    
                    if (isDub) {
                        sources.push({
                            url: src.startsWith('http') ? src : `${this.baseUrl}${src}`,
                            quality: $(el).attr('label') as VideoSource['quality'] || 'auto',
                            isM3U8: src.includes('.m3u8')
                        });
                    }
                }
            });
            
            // If no specific dub sources found, extract all and validate
            if (sources.length === 0) {
                $('source, .video-container source').each((i, el) => {
                    const src = $(el).attr('src');
                    if (src) {
                        sources.push({
                            url: src.startsWith('http') ? src : `${this.baseUrl}${src}`,
                            quality: $(el).attr('label') as VideoSource['quality'] || 'auto',
                            isM3U8: src.includes('.m3u8')
                        });
                    }
                });
                
                // Also try iframe sources
                const iframeSrc = $('iframe').attr('src');
                if (iframeSrc) {
                    const embedUrl = iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`;
                    try {
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
                    } catch (e) {
                        // Continue with other sources
                    }
                }
            }
            
            if (sources.length > 0) {
                console.log(`AnimeHeaven: Found ${sources.length} potential dub sources`);
                
                // Validate that at least one source has English audio
                for (const source of sources) {
                    const isEnglishDub = await this.validateEnglishDub(source.url, options);
                    if (isEnglishDub) {
                        console.log(`AnimeHeaven: Verified English dub stream: ${source.url}`);
                        return {
                            sources: [source],
                            subtitles: [],
                            headers: { 'Referer': this.baseUrl },
                            source: this.name,
                            category: 'dub',
                            audioLanguage: 'en'
                        } as StreamingData & { category: 'dub'; audioLanguage: 'en' };
                    }
                }
            }
            
            console.log(`AnimeHeaven: No verified English dub streams found for ${episodeId}`);
            return { sources: [], subtitles: [], source: this.name };
            
        } catch (error) {
            console.error(`AnimeHeaven: Error extracting dub streams: ${error}`);
            return { sources: [], subtitles: [], source: this.name };
        }
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
            const response = await axios.get(`${this.baseUrl}/popular.php`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.chartlist .chart.bc1').each((i, el) => {
                const title = $(el).find('.c2 a').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.replace('/anime/', '').replace('.html', '') || '';
                const image = $(el).find('img').attr('src') || '';

                if (id && title) {
                    results.push({
                        id: `animeheaven-${id}`,
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
            const response = await axios.get(`${this.baseUrl}/latest.php`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.chartlist .chart.bc1').each((i, el) => {
                const title = $(el).find('.c2 a').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.replace('/anime/', '').replace('.html', '') || '';
                const image = $(el).find('img').attr('src') || '';

                if (id && title) {
                    results.push({
                        id: `animeheaven-${id}`,
                        title,
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
}
