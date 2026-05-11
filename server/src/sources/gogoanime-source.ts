import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

export class GogoanimeSource extends BaseAnimeSource {
    name = 'Gogoanime';
    baseUrl = 'https://anitaku.to';
    private readonly fallbackDomains = ['https://gogoanimehd.to', 'https://gogoanimes.fi'];

    constructor() {
        super();
    }

    /**
     * Known ad CDN domains — m3u8 playlists whose segments resolve to these
     * hosts are serving ad blobs, not video data (causes fragParsingError).
     */
    private static readonly AD_CDN_PATTERNS = [
        'ibyteimg.com',
        'ad-site-i18n',
        'doubleclick.net',
        'googlesyndication.com',
    ];

    /**
     * Validate that an m3u8 URL actually serves real video segments, not ad blobs.
     * Fetches the playlist and checks that segment URLs don't resolve to known ad CDNs.
     */
    private async isAdPoisonedM3u8(m3u8Url: string, options?: SourceRequestOptions): Promise<boolean> {
        try {
            const resp = await axios.get(m3u8Url, {
                signal: options?.signal,
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': this.baseUrl,
                },
            });
            const playlist = typeof resp.data === 'string' ? resp.data : '';
            if (!playlist) return false;

            // For master playlists (contain #EXT-X-STREAM-INF), fetch first variant
            if (playlist.includes('#EXT-X-STREAM-INF')) {
                const lines = playlist.split('\n');
                for (const line of lines) {
                    const t = line.trim();
                    if (!t || t.startsWith('#')) continue;
                    const variantUrl = t.startsWith('http') ? t : new URL(t, m3u8Url).href;
                    // Check the first variant playlist
                    return this.isAdPoisonedM3u8(variantUrl, options);
                }
                return false;
            }

            // Media playlist — check segment URLs
            const segmentUrls: string[] = [];
            for (const line of playlist.split('\n')) {
                const t = line.trim();
                if (!t || t.startsWith('#')) continue;
                const abs = t.startsWith('http') ? t : new URL(t, m3u8Url).href;
                segmentUrls.push(abs);
            }

            if (segmentUrls.length === 0) return false;

            const adCount = segmentUrls.filter(u => {
                const lower = u.toLowerCase();
                return GogoanimeSource.AD_CDN_PATTERNS.some(p => lower.includes(p));
            }).length;

            const ratio = adCount / segmentUrls.length;
            if (ratio > 0.3) {
                logger.warn(`Gogoanime: Ad-poisoned m3u8 detected (${adCount}/${segmentUrls.length} ad segments)`, undefined, this.name);
                return true;
            }
            return false;
        } catch {
            return false; // On error, assume OK
        }
    }


     async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
         try {
             const response = await axios.get(`${this.baseUrl}/search.html?keyword=test`, {
                 signal: options?.signal,
                 timeout: options?.timeout || 15000, // Increased from 5000 to 15000
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
                 timeout: options?.timeout || 30000 // Increased from 10000 to 30000
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
                        id: id,
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
                 timeout: options?.timeout || 30000, // Increased from 10000 to 30000
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

            // Check if dub is available by testing the dub episode 1 page
            let dubCount = 0;
            try {
                const animeIdForDub = id.replace('gogoanime-', '');
                 const dubTestResp = await axios.get(`${this.baseUrl}/${animeIdForDub}-dub-episode-1`, {
                     timeout: 15000, // Increased from 5000 to 15000
                     headers: { 'User-Agent': 'Mozilla/5.0' },
                     validateStatus: s => s < 500,
                 });
                if (dubTestResp.status === 200 && typeof dubTestResp.data === 'string' &&
                    (dubTestResp.data.includes('anime_muti_link') || dubTestResp.data.includes('data-video') || dubTestResp.data.includes('iframe'))) {
                    // Dub is available - assume all episodes have dub
                    dubCount = totalEpisodes;
                }
            } catch { /* dub not available */ }

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
                dubCount,
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
                 timeout: options?.timeout || 30000, // Increased from 10000 to 30000,
                 headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
             });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            // Method 1: Extract episode count from episode links on the page
            // Look for links containing "-episode-" and extract the highest episode number
            const episodeNumbers: number[] = [];
            $('a[href*="-episode-"]').each((_, el) => {
                const href = $(el).attr('href') || '';
                // Match patterns like /anime-name-episode-123 or anime-name-episode-123
                const match = href.match(/-episode-(\d+)/);
                if (match) {
                    const epNum = parseInt(match[1], 10);
                    if (epNum > 0 && !episodeNumbers.includes(epNum)) {
                        episodeNumbers.push(epNum);
                    }
                }
            });

            // Also try script-based extraction as fallback
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

            // Use the maximum episode count from all methods
            const maxEpFromLinks = episodeNumbers.length > 0 ? Math.max(...episodeNumbers) : 0;
            const epCount = Math.max(maxEpFromLinks, totalEps, schemaEps);

            // Check if dub is available by testing episode 1 dub page
            let hasDubAvailable = false;
            try {
                const dubTestResp = await axios.get(`${this.baseUrl}/${id}-dub-episode-1`, {
                    timeout: 5000,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    validateStatus: s => s < 500,
                });
                // If dub page returns 200 and has video content, dub is available
                if (dubTestResp.status === 200 && typeof dubTestResp.data === 'string' &&
                    (dubTestResp.data.includes('anime_muti_link') || dubTestResp.data.includes('data-video') || dubTestResp.data.includes('iframe'))) {
                    hasDubAvailable = true;
                }
            } catch { /* dub not available or error */ }

            // If we found an episode count, generate episode list
            if (epCount > 0) {
                for (let i = 1; i <= epCount; i++) {
                    episodes.push({
                        id: `${id}-episode-${i}`,
                        number: i,
                        title: `Episode ${i}`,
                        isFiller: false,
                        hasSub: true,
                        hasDub: hasDubAvailable,
                        thumbnail: '',
                    });
                }
            } else {
                // Fallback: try fetching ep 1 to verify the show exists, assume a single episode
                try {
                    const testR = await axios.get(`${this.baseUrl}/${id}-episode-1`, {
                        timeout: 15000,
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        validateStatus: s => s < 500,
                    });
                    if (testR.status === 200 && typeof testR.data === 'string' && 
                        (testR.data.includes('anime_muti_link') || testR.data.includes('iframe') || testR.data.includes('data-video'))) {
                        episodes.push({
                            id: `${id}-episode-1`,
                            number: 1,
                            title: 'Episode 1',
                            isFiller: false,
                            hasSub: true,
                            hasDub: hasDubAvailable,
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
            // Get sub episode servers
            const response = await axios.get(`${this.baseUrl}/${episodeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                validateStatus: s => s < 500
            });

            const servers: EpisodeServer[] = [];

            if (response.status === 200) {
                const $ = cheerio.load(response.data);
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
            }

            // Check if dub exists and add dub servers
            const dubEpisodeId = episodeId.replace(/-episode-(\d+)$/, '-dub-episode-$1');
            try {
                const dubResponse = await axios.get(`${this.baseUrl}/${dubEpisodeId}`, {
                    signal: options?.signal,
                    timeout: options?.timeout || 8000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    validateStatus: s => s < 500
                });

                if (dubResponse.status === 200) {
                    const $dub = cheerio.load(dubResponse.data);
                    const dubServers: string[] = [];
                    $dub('.anime_muti_link ul li').each((i, el) => {
                        const serverName = $dub(el).find('a').text().trim();
                        if (serverName && !dubServers.includes(serverName)) {
                            dubServers.push(serverName);
                        }
                    });

                    // Add dub servers with 'dub' type
                    for (const serverName of dubServers) {
                        servers.push({
                            name: serverName,
                            url: '',
                            type: 'dub'
                        });
                    }
                }
            } catch { /* dub not available */ }

            return servers.length > 0 ? servers : [
                { name: 'Vidstreaming', url: '', type: 'sub' },
                { name: 'Gogo server', url: '', type: 'sub' }
            ];
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
        const isDubRequest = category === 'dub';

        // ── DUB: Try dedicated dub URL first ──────────────────────────────
        if (isDubRequest) {
            // Gogoanime hosts dub episodes at a separate slug: <anime>-dub-episode-<N>
            const dubEpId = epId.replace(/-episode-(\d+)$/, '-dub-episode-$1');
            if (dubEpId !== epId) {
                const dubResult = await this.tryDubUrl(dubEpId, options);
                if (dubResult.sources.length > 0) {
                    logger.info(`Gogoanime: Dub stream found via dub URL: ${dubEpId}`, undefined, this.name);
                    return {
                        ...dubResult,
                        category: 'dub',
                        audioLanguage: 'en',
                    } as StreamingData & { category: 'dub'; audioLanguage: 'en' };
                }
            }

            // Fallback: search for a separate "(Dub)" entry on Gogoanime
            const animeTitle = epId
                .replace(/-episode-\d+$/, '')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
            const searchResult = await this.searchForDubVersion(animeTitle, epId, options);
            if (searchResult.sources.length > 0) {
                logger.info(`Gogoanime: Dub stream found via title search`, undefined, this.name);
                return {
                    ...searchResult,
                    category: 'dub',
                    audioLanguage: 'en',
                } as StreamingData & { category: 'dub'; audioLanguage: 'en' };
            }

            // No dub available — return empty so the caller knows dub genuinely failed
            // and can fall back to sub rather than serving sub content labeled as dub.
            logger.info(`Gogoanime: No dub sources found for ${epId}, returning empty`, undefined, this.name);
            return { sources: [], subtitles: [], source: this.name, category: 'sub' } as any;
        }

        // ── SUB: Normal sub extraction ─────────────────────────────────────
        try {
            const response = await axios.get(`${this.baseUrl}/${epId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': this.baseUrl
                },
                validateStatus: (status) => status < 500
            });

            if (response.status === 404) {
                return {
                    sources: [],
                    subtitles: [],
                    headers: {
                        'Referer': this.baseUrl,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    source: this.name
                };
            }

            const $ = cheerio.load(response.data);

            const sources: VideoSource[] = [];
            const subtitles: Array<{ url: string; lang: string }> = [];

            const embedUrls: Array<{ name: string; url: string }> = [];
            $('.anime_muti_link ul li, .anime_video_body_watch_items li').each((_, el) => {
                const dataVideo = $(el).find('a').attr('data-video') || '';
                const name = $(el).text().replace('Choose this server', '').trim();
                if (dataVideo) {
                    const url = dataVideo.startsWith('http') ? dataVideo : `https:${dataVideo}`;
                    embedUrls.push({ name, url });
                }
            });

            if (embedUrls.length === 0) {
                $('iframe').each((_, el) => {
                    const src = $(el).attr('src');
                    if (src) {
                        const url = src.startsWith('http') ? src : `https:${src}`;
                        embedUrls.push({ name: 'iframe', url });
                    }
                });
            }

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

                    const m3u8Matches = [...html.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)]
                        .map(m => m[1])
                        .filter(u => u.startsWith('http') && !u.includes('thumb') && !u.includes('poster'));
                    if (m3u8Matches.length > 0) {
                        // Validate that the m3u8 isn't ad-poisoned before accepting
                        const isPoisoned = await this.isAdPoisonedM3u8(m3u8Matches[0], options);
                        if (isPoisoned) {
                            logger.info(`Gogoanime: Skipping ad-poisoned m3u8 from ${embed.name}`, undefined, this.name);
                        } else {
                            const subMatch = embed.url.match(/[?&]sub=(https?[^&]+)/) || embed.url.match(/[?&]caption_1=(https?[^&]+)/);
                            if (subMatch) subtitles.push({ url: decodeURIComponent(subMatch[1]), lang: 'English' });

                            sources.push({
                                url: m3u8Matches[0],
                                quality: 'auto',
                                isM3U8: true,
                            });
                        }
                    }

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
                source: this.name,
                category: 'sub',
            } as any;
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
                        id: id,
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

    private async tryDubUrl(dubEpId: string, options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const response = await axios.get(`${this.baseUrl}/${dubEpId}`, {
                signal: options?.signal,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': this.baseUrl
                },
                validateStatus: (status) => status < 500
            });
            
            if (response.status === 404) {
                return { sources: [], subtitles: [], source: this.name };
            }
            
            // Extract streams from dub page
            return await this.extractStreamsFromPage(response.data, dubEpId, options);
        } catch (error) {
            return { sources: [], subtitles: [], source: this.name };
        }
    }

    private async searchForDubVersion(animeTitle: string, originalEpId: string, options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            // Search for dub version with common patterns
            const searchQueries = [
                `${animeTitle} dub`,
                `${animeTitle} (dub)`,
                `${animeTitle} english dub`
            ];
            
            for (const query of searchQueries) {
                const searchResponse = await axios.get(`${this.baseUrl}/search.html`, {
                    params: { keyword: query },
                    signal: options?.signal,
                    timeout: 8000
                });
                
                const $ = cheerio.load(searchResponse.data);
                let dubAnimeId = null;
                
                $('.last_episodes .items li').each((i, el) => {
                    const title = $(el).find('.name a').text();
                    const href = $(el).find('.name a').attr('href') || '';
                    
                    // Check if this is actually a dub version
                    if (title.toLowerCase().includes('dub') && href.includes('/category/')) {
                        dubAnimeId = href.split('/category/')[1];
                        return false; // Break the loop
                    }
                });
                
                if (dubAnimeId) {
                    // Try to get the episode from the dub version
                    const epNum = originalEpId.match(/-episode-(\d+)/)?.[1] || '1';
                    const dubEpId = `${dubAnimeId}-episode-${epNum}`;
                    const dubResult = await this.tryDubUrl(dubEpId, options);
                    if (dubResult.sources.length > 0) {
                        return dubResult;
                    }
                }
            }
            
            return { sources: [], subtitles: [], source: this.name };
        } catch (error) {
            return { sources: [], subtitles: [], source: this.name };
        }
    }

    private async extractStreamsFromPage(html: string, epId: string, options?: SourceRequestOptions): Promise<StreamingData> {
        const $ = cheerio.load(html);
        const sources: VideoSource[] = [];
        const subtitles: Array<{ url: string; lang: string }> = [];
        
        // Extract embed URLs
        const embedUrls: Array<{ name: string; url: string }> = [];
        $('.anime_muti_link ul li, .anime_video_body_watch_items li').each((_, el) => {
            const dataVideo = $(el).find('a').attr('data-video') || '';
            const name = $(el).text().replace('Choose this server', '').trim();
            if (dataVideo) {
                const url = dataVideo.startsWith('http') ? dataVideo : `https:${dataVideo}`;
                embedUrls.push({ name, url });
            }
        });
        
        // Extract m3u8 from embed URLs
        for (const embed of embedUrls) {
            try {
                const embedResp = await axios.get(embed.url, {
                    signal: options?.signal,
                    timeout: 8000,
                    headers: {
                        'Referer': this.baseUrl,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                });
                
                const htmlContent = typeof embedResp.data === 'string' ? embedResp.data : JSON.stringify(embedResp.data);
                const m3u8Matches = [...htmlContent.matchAll(/["']([^"']*\.m3u8[^"']*?)["']/g)]
                    .map(m => m[1])
                    .filter(u => u.startsWith('http') && !u.includes('thumb') && !u.includes('poster'));
                
                if (m3u8Matches.length > 0) {
                    // Validate this is actually a dub stream
                    const isDubStream = await this.validateDubStream(m3u8Matches[0], options);
                    if (isDubStream) {
                        sources.push({
                            url: m3u8Matches[0],
                            quality: 'auto',
                            isM3U8: true,
                        });
                        break; // Found a valid dub stream
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
    }

    private async extractDubFromRegularPage(epId: string, options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            logger.info(`Gogoanime: Extracting dub from regular page: ${epId}`, undefined, this.name);
            
            const response = await axios.get(`${this.baseUrl}/${epId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': this.baseUrl
                }
            });
            
            if (response.status !== 200) {
                logger.info(`Gogoanime: Episode page not found: ${response.status}`, undefined, this.name);
                return { sources: [], subtitles: [], source: this.name };
            }
            
            const $ = cheerio.load(response.data);
            
            // Check if page has dub indicators
            const pageContent = response.data.toLowerCase();
            const hasDubIndicators = 
                pageContent.includes('dub') ||
                $('[data-dub]').length > 0 ||
                $('.dub').length > 0 ||
                $('*:contains("Dub")').length > 0;
            
            if (!hasDubIndicators) {
                logger.info(`Gogoanime: No dub indicators found on page: ${epId}`, undefined, this.name);
                return { sources: [], subtitles: [], source: this.name };
            }
            
            logger.info(`Gogoanime: Found dub indicators, extracting streams...`, undefined, this.name);
            
            // Extract all video sources from the page
            const sources: VideoSource[] = [];
            const subtitles: Array<{ url: string; lang: string }> = [];
            
            // Extract embed URLs using the same logic as regular streaming
            const embedUrls: Array<{ name: string; url: string }> = [];
            $('.anime_muti_link ul li, .anime_video_body_watch_items li').each((_, el) => {
                const dataVideo = $(el).find('a').attr('data-video') || '';
                const name = $(el).text().replace('Choose this server', '').trim();
                if (dataVideo) {
                    const url = dataVideo.startsWith('http') ? dataVideo : `https:${dataVideo}`;
                    embedUrls.push({ name, url });
                }
            });
            
            // Prioritize vibeplayer servers for better quality
            const prioritized = [
                ...embedUrls.filter(e => e.url.includes('vibeplayer')),
                ...embedUrls.filter(e => !e.url.includes('vibeplayer') && !e.url.includes('dood') && !e.url.includes('myvidplay')),
                ...embedUrls.filter(e => e.url.includes('dood') || e.url.includes('myvidplay')),
            ];
            
            // Extract m3u8 from embed URLs
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

                        // Return the stream as dub - many streams contain both audio tracks or default to dub
                        sources.push({
                            url: m3u8Matches[0],
                            quality: 'auto',
                            isM3U8: true,
                        });
                        logger.info(`Gogoanime: Returning stream as dub: ${embed.name}`, undefined, this.name);
                    }
                } catch (error) {
                    logger.info(`Gogoanime: Error processing embed ${embed.name}: ${error}`, undefined, this.name);
                }
            }
            
            if (sources.length > 0) {
                logger.info(`Gogoanime: Successfully extracted ${sources.length} dub sources for ${epId}`, undefined, this.name);
                return {
                    sources,
                    subtitles,
                    headers: {
                        'Referer': this.baseUrl,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    source: this.name,
                    category: 'dub',
                    audioLanguage: 'en'
                } as StreamingData & { category: 'dub'; audioLanguage: 'en' };
            }
            
            logger.info(`Gogoanime: No valid dub sources found for ${epId}`, undefined, this.name);
            return { sources: [], subtitles: [], source: this.name };
            
        } catch (error) {
            logger.error(`Gogoanime: Error extracting dub from regular page: ${error}`, undefined, undefined, this.name);
            return { sources: [], subtitles: [], source: this.name };
        }
    }

    private async validateDubStream(m3u8Url: string, options?: SourceRequestOptions): Promise<boolean> {
        try {
            // Fetch the m3u8 playlist
            const response = await axios.get(m3u8Url, {
                signal: options?.signal,
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': this.baseUrl
                }
            });

            const playlist = response.data;
            
            // Check for English audio indicators in the playlist
            const englishIndicators = [
                /audio.*english/i,
                /audio.*en/i,
                /track.*english/i,
                /track.*en/i,
                /dub/i,
                /eng/i
            ];

            // Check if any English audio tracks are present
            for (const indicator of englishIndicators) {
                if (indicator.test(playlist)) {
                    return true;
                }
            }

            // Check for multiple audio tracks (indicating dub availability)
            const audioTrackMatches = playlist.match(/#EXT-X-MEDIA:TYPE=AUDIO[^\\n]*/gi);
            if (audioTrackMatches && audioTrackMatches.length > 1) {
                // Multiple audio tracks suggest dub/sub options
                return true;
            }

            // Check if URL contains dub indicators
            if (m3u8Url.includes('dub') || m3u8Url.includes('eng') || m3u8Url.includes('english')) {
                return true;
            }

            // If no clear indicators, assume it's not a verified dub stream
            return false;
        } catch (error) {
            console.log(`[Gogoanime] Failed to validate dub stream: ${error instanceof Error ? error.message : String(error)}`);
            return false;
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
