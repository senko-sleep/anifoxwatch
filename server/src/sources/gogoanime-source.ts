import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class GogoanimeSource extends BaseAnimeSource {
    name = 'Gogoanime';
    baseUrl = 'https://anitaku.to';
    private readonly fallbackDomains = ['https://gogoanimehd.to', 'https://gogoanimes.fi'];

    constructor() {
        super();
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(`${this.baseUrl}/search.html?keyword=test`, {
                signal: options?.signal,
                timeout: options?.timeout || 5000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });
            return response.status === 200 && (response.data as string).includes('last_episodes');
        } catch {
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
                timeout: options?.timeout || 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            // New structure: look for episode links in the page JSON-LD or episode list
            const scriptContent = $('script:contains("episode_page")').html() || $('script').toArray().map(s => $(s).html()).join('\n');
            const epEndMatch = scriptContent.match(/ep_end\s*=\s*["'](\d+)["']/) || scriptContent.match(/ep_end["']?\s*:\s*["']?(\d+)/);
            const totalEps = epEndMatch ? parseInt(epEndMatch[1]) : 0;

            // Also try schema.org data
            const schemaScript = $('script[type="application/ld+json"]').html();
            let schemaEps = 0;
            if (schemaScript) {
                try {
                    const schema = JSON.parse(schemaScript);
                    schemaEps = schema.numberOfEpisodes || 0;
                } catch { /* ignore */ }
            }

            const epCount = Math.max(totalEps, schemaEps);

            // If we found an episode count, generate episode list
            if (epCount > 0) {
                for (let i = 1; i <= epCount; i++) {
                    episodes.push({
                        id: `${id}-episode-${i}`,
                        number: i,
                        title: `Episode ${i}`,
                        isFiller: false,
                        hasSub: true,
                        hasDub: false,
                        thumbnail: '',
                    });
                }
            } else {
                // Fallback: try fetching ep 1 to verify the show exists, assume a single episode
                try {
                    const testR = await axios.get(`${this.baseUrl}/${id}-episode-1`, {
                        timeout: 5000,
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        validateStatus: s => s < 500,
                    });
                    if (testR.status === 200) {
                        episodes.push({
                            id: `${id}-episode-1`,
                            number: 1,
                            title: 'Episode 1',
                            isFiller: false,
                            hasSub: true,
                            hasDub: false,
                            thumbnail: '',
                        });
                    }
                } catch { /* ignore */ }
            }

            return episodes;
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
        const epId = episodeId.replace(/^gogoanime-/i, '').split('?')[0];
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

            // New anitaku.to structure: server list with data-video attributes
            const embedUrls: Array<{ name: string; url: string }> = [];
            $('.anime_muti_link ul li, .anime_video_body_watch_items li').each((_, el) => {
                const dataVideo = $(el).find('a').attr('data-video') || '';
                const name = $(el).text().replace('Choose this server', '').trim();
                if (dataVideo) {
                    const url = dataVideo.startsWith('http') ? dataVideo : `https:${dataVideo}`;
                    embedUrls.push({ name, url });
                }
            });

            // Fallback: check iframes
            if (embedUrls.length === 0) {
                $('iframe').each((_, el) => {
                    const src = $(el).attr('src');
                    if (src) {
                        const url = src.startsWith('http') ? src : `https:${src}`;
                        embedUrls.push({ name: 'iframe', url });
                    }
                });
            }

            // Extract m3u8 from embed URLs (prioritize vibeplayer/HD servers)
            const prioritized = [
                ...embedUrls.filter(e => e.url.includes('vibeplayer')),
                ...embedUrls.filter(e => !e.url.includes('vibeplayer') && !e.url.includes('dood') && !e.url.includes('myvidplay')),
                ...embedUrls.filter(e => e.url.includes('dood') || e.url.includes('myvidplay')),
            ];

            for (const embed of prioritized) {
                if (sources.length > 0) break;
                try {
                    const embedResp = await axios.get(embed.url, {
                        signal: options?.signal,
                        timeout: 8000,
                        headers: {
                            'Referer': this.baseUrl,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        },
                    });
                    const html = typeof embedResp.data === 'string' ? embedResp.data : JSON.stringify(embedResp.data);

                    // Extract m3u8 URLs
                    const m3u8Matches = [...html.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)]
                        .map(m => m[1])
                        .filter(u => u.startsWith('http') && !u.includes('thumb') && !u.includes('poster'));
                    if (m3u8Matches.length > 0) {
                        // Parse subtitle from URL query param
                        const subMatch = embed.url.match(/[?&]sub=(https?[^&]+)/) || embed.url.match(/[?&]caption_1=(https?[^&]+)/);
                        if (subMatch) subtitles.push({ url: decodeURIComponent(subMatch[1]), lang: 'English' });

                        sources.push({
                            url: m3u8Matches[0],
                            quality: 'auto',
                            isM3U8: true,
                        });
                    }

                    // Fallback: mp4
                    if (sources.length === 0) {
                        const mp4Match = html.match(/file:\s*["'](https?[^"']*\.mp4[^"']*)["']/);
                        if (mp4Match) {
                            sources.push({ url: mp4Match[1], quality: '720p', isM3U8: false });
                        }
                    }
                } catch {
                    // Try next embed
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
