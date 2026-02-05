import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class AnimeLandSource extends BaseAnimeSource {
    name = 'AnimeLand';
    baseUrl = 'https://www.animeland.us';

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(this.baseUrl, { signal: options?.signal, timeout: options?.timeout || 5000, headers: this.getHeaders() });
            return response.status === 200;
        } catch { return false; }
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
            const response = await axios.get(`${this.baseUrl}`, { params: { s: query }, signal: options?.signal, timeout: options?.timeout || 10000, headers: this.getHeaders() });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];
            $('.post, .item').each((i, el) => {
                const title = $(el).find('.title a, h2 a').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.split('/').filter(Boolean).pop()?.replace('.html', '') || '';
                const image = $(el).find('img').attr('src') || '';
                if (id && title) {
                    results.push({ id: `animeland-${id}`, title, image, cover: image, description: '', type: 'TV', status: 'Ongoing', episodes: 0, episodesAired: 0, year: 0, subCount: 0, dubCount: 0, source: this.name, isMature: false, genres: [], studios: [], rating: 0 });
                }
            });
            return { results, totalPages: 1, currentPage: page, hasNextPage: false, source: this.name };
        } catch (error) { this.handleError(error, 'search'); return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name }; }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const animeId = id.replace('animeland-', '');
            const response = await axios.get(`${this.baseUrl}/${animeId}`, { signal: options?.signal, timeout: options?.timeout || 10000, headers: this.getHeaders() });
            const $ = cheerio.load(response.data);
            const title = $('h1, .entry-title').first().text().trim();
            const image = $('.entry-content img, .post-thumb img').first().attr('src') || '';
            const description = $('.entry-content p, .description').first().text().trim();
            return { id, title, image, cover: image, description, type: 'TV', status: 'Ongoing', rating: 0, episodes: 0, episodesAired: 0, genres: [], studios: [], year: 0, subCount: 0, dubCount: 0, source: this.name, isMature: false };
        } catch (error) { this.handleError(error, 'getAnime'); return null; }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const id = animeId.replace('animeland-', '');
            const response = await axios.get(`${this.baseUrl}/${id}`, { signal: options?.signal, timeout: options?.timeout || 10000, headers: this.getHeaders() });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];
            $('select option, .video-info a').each((i, el) => {
                const value = $(el).attr('value') || $(el).attr('href') || '';
                const text = $(el).text().trim();
                const epNum = parseInt(text.replace(/\D/g, '')) || i + 1;
                if (value && epNum) {
                    episodes.push({ id: value.split('/').pop() || `${id}-${epNum}`, number: epNum, title: `Episode ${epNum}`, isFiller: false, hasSub: false, hasDub: true, thumbnail: '' });
                }
            });
            return episodes.sort((a, b) => a.number - b.number);
        } catch (error) { this.handleError(error, 'getEpisodes'); return []; }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [{ name: 'Default', url: '', type: 'dub' }];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const response = await axios.get(`${this.baseUrl}/${episodeId}`, { signal: options?.signal, timeout: options?.timeout || 10000, headers: this.getHeaders() });
            const $ = cheerio.load(response.data);
            const sources: VideoSource[] = [];
            const iframeSrc = $('iframe').attr('src');
            if (iframeSrc) {
                sources.push({ url: iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`, quality: 'auto', isM3U8: false });
            }
            $('source').each((i, el) => {
                const src = $(el).attr('src');
                if (src) { sources.push({ url: src, quality: ($(el).attr('label') as VideoSource['quality']) || 'auto', isM3U8: src.includes('.m3u8') }); }
            });
            return { sources, subtitles: [], headers: { 'Referer': this.baseUrl } };
        } catch (error) { this.handleError(error, 'getStreamingLinks'); return { sources: [], subtitles: [] }; }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return this.getLatest(page, options);
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(this.baseUrl, { params: { page }, signal: options?.signal, timeout: options?.timeout || 10000, headers: this.getHeaders() });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];
            $('.post, .item').each((i, el) => {
                const title = $(el).find('.title a, h2 a').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.split('/').filter(Boolean).pop()?.replace('.html', '') || '';
                const image = $(el).find('img').attr('src') || '';
                if (id && title) {
                    results.push({ id: `animeland-${id}`, title, image, cover: image, description: '', type: 'TV', status: 'Ongoing', episodes: 0, episodesAired: 0, year: new Date().getFullYear(), subCount: 0, dubCount: 0, source: this.name, isMature: false, genres: [], studios: [], rating: 0 });
                }
            });
            return results;
        } catch (error) { this.handleError(error, 'getLatest'); return []; }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, index) => ({ rank: (page - 1) * limit + index + 1, anime }));
    }
}
