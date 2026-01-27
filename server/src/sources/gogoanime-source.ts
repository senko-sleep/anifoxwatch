import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class GogoanimeSource extends BaseAnimeSource {
    name = 'Gogoanime';
    baseUrl = 'https://anitaku.pe'; // Current working domain
    ajaxUrl = 'https://ajax.gogocdn.net/ajax';

    constructor() {
        super();
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.baseUrl}/home.html`);
            return response.status === 200;
        } catch (e) {
            return false;
        }
    }

    async search(query: string, page: number = 1): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/search.html`, {
                params: { keyword: query, page }
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.last_episodes .items li').each((i, el) => {
                const title = $(el).find('.name a').text();
                // id is the slug from href minus /category/
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
                        description: '', // Search doesn't provide description
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

            // Pagination simplified
            const hasNextPage = $('.pagination .next').length > 0;

            return {
                results,
                totalPages: hasNextPage ? page + 1 : page,
                currentPage: page,
                hasNextPage,
                source: this.name
            };
        } catch (error) {
            console.error('Gogoanime search error:', error);
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string): Promise<AnimeBase | null> {
        try {
            const animeId = id.replace('gogoanime-', '');
            const response = await axios.get(`${this.baseUrl}/category/${animeId}`);
            const $ = cheerio.load(response.data);

            const title = $('.anime_info_body_bg h1').text();
            const image = $('.anime_info_body_bg img').attr('src') || '';
            const type = $('.anime_info_body_bg p.type:contains("Type:") a').text();
            let desc = $('.anime_info_body_bg p.type:contains("Plot Summary:")').text().replace('Plot Summary:', '').trim();
            const released = $('.anime_info_body_bg p.type:contains("Released:")').text().replace('Released:', '').trim();
            const status = $('.anime_info_body_bg p.type:contains("Status:") a').text();
            // Genres scraping
            const genres: string[] = [];
            $('.anime_info_body_bg p.type:contains("Genre:") a').each((i, el) => {
                genres.push($(el).text().replace(',', '').trim());
            });

            // Get total episodes
            const epEnd = $('#episode_page li').last().find('a').attr('ep_end');
            const totalEpisodes = epEnd ? parseInt(epEnd) : 0;

            return {
                id: id,
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
            console.error('Gogoanime getAnime error:', error);
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        try {
            const id = animeId.replace('gogoanime-', '');
            const response = await axios.get(`${this.baseUrl}/category/${id}`);
            const $ = cheerio.load(response.data);

            const movieId = $('#movie_id').val();
            const alias = $('#alias_anime').val();
            const defaultEp = $('#default_ep').val();
            const epEnd = $('#episode_page li').last().find('a').attr('ep_end') || '2000';

            if (!movieId) return [];

            const listUrl = `${this.ajaxUrl}/load-list-episode?ep_start=0&ep_end=${epEnd}&id=${movieId}&default_ep=${defaultEp}&alias=${alias}`;
            const listResponse = await axios.get(listUrl);
            const $list = cheerio.load(listResponse.data);

            const episodes: Episode[] = [];
            $list('li a').each((i, el) => {
                const epNumStr = $(el).find('.name').text().replace('EP ', '').trim();
                const epNum = parseFloat(epNumStr);
                // /naruto-episode-1
                const href = $(el).attr('href')?.trim() || '';
                // We need episodeId for streaming. Usually it is the slug without leading /
                const epId = href.startsWith('/') ? href.substring(1) : href;

                episodes.push({
                    id: epId,
                    number: epNum || 0,
                    title: `Episode ${epNum}`,
                    isFiller: false,
                    hasSub: true,
                    hasDub: false,
                    thumbnail: '' // Not easily available in list
                });
            });

            return episodes.reverse();
        } catch (error) {
            console.error('Gogoanime getEpisodes error:', error);
            return [];
        }
    }

    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/${episodeId}`);
            const $ = cheerio.load(response.data);

            const servers: EpisodeServer[] = [];

            // Get available servers from the page
            $('.anime_muti_link ul li').each((i, el) => {
                const serverName = $(el).find('a').text().trim();
                const dataName = $(el).attr('class') || '';

                if (serverName) {
                    servers.push({
                        name: serverName,
                        url: '', // URL will be fetched when streaming
                        type: 'sub'
                    });
                }
            });

            // Default servers if none found
            if (servers.length === 0) {
                servers.push(
                    { name: 'Vidstreaming', url: '', type: 'sub' },
                    { name: 'Gogo server', url: '', type: 'sub' },
                    { name: 'Streamtape', url: '', type: 'sub' }
                );
            }

            return servers;
        } catch (error) {
            console.error('Gogoanime getEpisodeServers error:', error);
            // Return default servers
            return [
                { name: 'Vidstreaming', url: '', type: 'sub' },
                { name: 'Gogo server', url: '', type: 'sub' }
            ];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string): Promise<StreamingData> {
        try {
            // Get the episode page
            const response = await axios.get(`${this.baseUrl}/${episodeId}`);
            const $ = cheerio.load(response.data);

            const sources: VideoSource[] = [];
            const subtitles: Array<{ url: string; lang: string }> = [];

            // Method 1: Try to get streaming link from iframe
            const iframeSrc = $('#load_anime iframe').attr('src') ||
                $('.play-video iframe').attr('src');

            if (iframeSrc) {
                let streamingUrl = iframeSrc;
                if (!streamingUrl.startsWith('http')) {
                    streamingUrl = `https:${streamingUrl}`;
                }

                // Try to extract actual video source from the iframe
                try {
                    const iframeResponse = await axios.get(streamingUrl, {
                        headers: {
                            'Referer': this.baseUrl,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });

                    const iframeHtml = iframeResponse.data;

                    // Try to extract m3u8 or mp4 sources
                    const m3u8Match = iframeHtml.match(/file:\s*["']([^"']*\.m3u8[^"']*)["']/);
                    const mp4Match = iframeHtml.match(/file:\s*["']([^"']*\.mp4[^"']*)["']/);

                    if (m3u8Match) {
                        sources.push({
                            url: m3u8Match[1],
                            quality: 'auto',
                            isM3U8: true
                        });
                    } else if (mp4Match) {
                        sources.push({
                            url: mp4Match[1],
                            quality: '720p',
                            isM3U8: false
                        });
                    } else {
                        // Fallback: use iframe URL directly
                        sources.push({
                            url: streamingUrl,
                            quality: 'auto',
                            isM3U8: true
                        });
                    }
                } catch (iframeError) {
                    console.error('Error fetching iframe content:', iframeError);
                    // Use iframe URL as fallback
                    sources.push({
                        url: streamingUrl,
                        quality: 'auto',
                        isM3U8: true
                    });
                }
            }

            // Method 2: Try to get download links as alternative sources
            $('.dowloads a').each((i, el) => {
                const downloadUrl = $(el).attr('href');
                const quality = $(el).text().trim();

                if (downloadUrl && quality) {
                    sources.push({
                        url: downloadUrl,
                        quality: this.normalizeQuality(quality),
                        isM3U8: false
                    });
                }
            });

            // If no sources found, return error info
            if (sources.length === 0) {
                console.warn(`No streaming sources found for ${episodeId}`);
            }

            return {
                sources,
                subtitles,
                headers: {
                    'Referer': this.baseUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
        } catch (error) {
            console.error('Gogoanime getStreamingLinks error:', error);
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/popular.html`, {
                params: { page }
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
            console.error('Gogoanime getTrending error:', error);
            return [];
        }
    }

    async getLatest(page: number = 1): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/home.html`, {
                params: { page }
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.last_episodes .items li').each((i, el) => {
                const title = $(el).find('.name a').text();
                const image = $(el).find('.img a img').attr('src') || '';
                const href = $(el).find('.name a').attr('href') || '';
                // Latest on home.html links to episode, not category
                // href example: /boruto-episode-287
                const episodeId = href.substring(1); 
                // We need the anime ID. Usually we can't easily get it from episode slug without info call.
                // But for list display, we can use episodeId as ID temporarily or try to guess.
                // Gogoanime: /category/boruto from /boruto-episode-287
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
            console.error('Gogoanime getLatest error:', error);
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10): Promise<TopAnime[]> {
        return [];
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