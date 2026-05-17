import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { streamExtractor } from '../services/stream-extractor.js';

export class GogoOrAtSource extends BaseAnimeSource {
    name = 'GogoOrAt';
    baseUrl = 'https://gogoanime.or.at';

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/?s=${encodeURIComponent(query)}`, {
                signal: options?.signal,
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            // Correctly parse the specialized WordPress AnimeTheme layout
            $('article').each((i, el) => {
                const linkEl = $(el).find('a').first();
                if (!linkEl.length) return;

                const href = linkEl.attr('href') || '';
                const title = linkEl.find('h2').text().trim() || linkEl.attr('title') || '';
                const image = linkEl.find('img').attr('src') || '';

                if (title && href && href.includes('/anime/')) {
                    const slug = href.split('/anime/')[1]?.replace(/\/$/, '') || '';
                    results.push({
                        id: `gogoorat-${slug}`,
                        title,
                        image,
                        cover: image,
                        description: $(el).find('.entry-summary').text().trim() || '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: 0,
                        episodesAired: 0,
                        year: 0,
                        subCount: 0,
                        dubCount: title.toLowerCase().includes('dub') ? 1 : 0,
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
            return { results: [], totalPages: 0, currentPage: 1, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const slug = id.replace('gogoorat-', '');
            const url = `${this.baseUrl}/anime/${slug}/`;
            
            const response = await axios.get(url, {
                signal: options?.signal,
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const $ = cheerio.load(response.data);
            const title = $('.entry-title').text().trim() || slug;
            const image = $('.ts-post-image').attr('src') || '';

            return {
                id,
                title,
                image,
                cover: image,
                description: $('.entry-content').text().trim() || '',
                type: 'TV',
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                year: 0,
                subCount: 0,
                dubCount: title.toLowerCase().includes('dub') ? 1 : 0,
                source: this.name,
                isMature: false,
                genres: [],
                studios: [],
                rating: 0
            };
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getTrending(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getLatest(page?: number, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getTopRated(page?: number, limit?: number, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const slug = animeId.replace('gogoorat-', '');
            const url = `${this.baseUrl}/anime/${slug}/`;
            
            const response = await axios.get(url, {
                signal: options?.signal,
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.includes('-episode-')) {
                    const epSlug = href.split('/').filter(Boolean).pop() || '';
                    const epMatch = epSlug.match(/-episode-(\d+)/i);
                    const epNum = epMatch ? parseInt(epMatch[1], 10) : i + 1;
                    
                    if (!episodes.some(e => e.id === `gogoorat-${epSlug}`)) {
                        episodes.push({
                            id: `gogoorat-${epSlug}`,
                            number: epNum,
                            title: `Episode ${epNum}`,
                            isFiller: false,
                            hasSub: !slug.includes('dub'),
                            hasDub: slug.includes('dub')
                        });
                    }
                }
            });

            return episodes.sort((a, b) => a.number - b.number);
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const epSlug = episodeId.replace('gogoorat-', '');
            const url = `${this.baseUrl}/${epSlug}/`;

            logger.info(`[GogoOrAt] Fetching episode page: ${url}`, undefined, this.name);
            const response = await axios.get(url, {
                signal: options?.signal,
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const $ = cheerio.load(response.data);
            const iframeSrc = $('iframe').attr('src');

            if (!iframeSrc) {
                logger.warn(`[GogoOrAt] No iframe found on ${url}`, undefined, this.name);
                return { sources: [], subtitles: [], source: this.name };
            }

            logger.info(`[GogoOrAt] Extracting from embed: ${iframeSrc}`, undefined, this.name);
            
            // Use puppeteer stream extractor to bypass cloudflare and get raw m3u8
            const result = await streamExtractor.extractFromEmbed(iframeSrc);
            
            if (result.success && result.streams.length > 0) {
                return {
                    sources: result.streams.map(s => ({
                        url: s.url,
                        quality: s.quality as any,
                        isM3U8: s.type === 'hls' || s.url.includes('.m3u8')
                    })),
                    subtitles: (result.subtitles || []).map(sub => ({
                        url: sub.url,
                        lang: sub.lang,
                        label: sub.lang
                    })),
                    source: this.name,
                    category
                };
            }

            return { sources: [], subtitles: [], source: this.name };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [], source: this.name };
        }
    }
}
