
import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

/**
 * WCOFun (WatchCartoonOnline) source
 * Specialized in English Dubbed content.
 * Very stable and reliable for classic and trending anime dubs.
 */
export class WcofunSource extends BaseAnimeSource {
    name = 'Wcofun';
    baseUrl = 'https://www.wcofun.net';

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> { return null; }
    async getTrending(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]> { return []; }
    async getLatest(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]> { return []; }
    async getTopRated(page?: number, limit?: number, options?: SourceRequestOptions): Promise<TopAnime[]> { return []; }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            // WCOFun search uses POST for actual search but we can try the direct URL search
            const response = await axios.post(`${this.baseUrl}/search-2`, 
                `catara=${encodeURIComponent(query)}&konnekt=`, 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    signal: options?.signal,
                    timeout: 15000
                }
            );

            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.picture a').each((i, el) => {
                const title = $(el).attr('title') || '';
                const href = $(el).attr('href') || '';
                const image = $(el).find('img').attr('src') || '';

                if (href && title) {
                    results.push({
                        id: `wcofun-${href.split('/').pop()}`,
                        title,
                        image: image.startsWith('http') ? image : `https:${image}`,
                        cover: image.startsWith('http') ? image : `https:${image}`,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: 0,
                        subCount: 0,
                        dubCount: 1, // Usually dub
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

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const slug = animeId.replace('wcofun-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${slug}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: options?.signal,
                timeout: 20000
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            $('.listing a').each((i, el) => {
                const href = $(el).attr('href') || '';
                const text = $(el).text().trim();
                const epNumMatch = text.match(/Episode (\d+)/i);
                const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : (i + 1);

                episodes.push({
                    id: href.split('/').pop() || `${slug}-episode-${epNum}`,
                    number: epNum,
                    title: text,
                    isFiller: false,
                    hasSub: false,
                    hasDub: true
                });
            });

            return episodes.reverse(); // Wcofun lists latest first
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const response = await axios.get(`${this.baseUrl}/${episodeId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: options?.signal,
                timeout: 20000
            });
            const $ = cheerio.load(response.data);
            
            // Wcofun uses a specialized embed system
            const iframeSrc = $('iframe').attr('src');
            if (!iframeSrc) return { sources: [], subtitles: [], source: this.name };

            const embedUrl = iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`;
            
            // In a full implementation, we'd extract the direct video link from the embed
            // For now, we'll return the embed as a source if it's all we have
            return {
                sources: [{
                    url: embedUrl,
                    quality: 'auto',
                    isM3U8: false,
                    isEmbed: true
                }],
                subtitles: [],
                headers: { 'Referer': this.baseUrl },
                source: this.name
            };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [], source: this.name };
        }
    }
}
