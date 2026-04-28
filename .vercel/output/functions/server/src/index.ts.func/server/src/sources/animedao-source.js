import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource } from './base-source.js';
export class AnimeDAOSource extends BaseAnimeSource {
    name = 'AnimeDAO';
    baseUrl = 'https://animedao.to';
    async healthCheck(options) {
        try {
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 5000,
                headers: this.getHeaders()
            });
            return response.status === 200;
        }
        catch {
            return false;
        }
    }
    getHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Referer': this.baseUrl
        };
    }
    async search(query, page = 1, _filters, options) {
        try {
            const response = await axios.get(`${this.baseUrl}/search.html`, {
                params: { keyword: query },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('.col-md-6, .anime-item').each((i, el) => {
                const title = $(el).find('.anime-name, .name a').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.split('/').pop()?.replace('.html', '') || '';
                const image = $(el).find('img').attr('src') || '';
                if (id && title) {
                    results.push({
                        id: `animedao-${id}`,
                        title,
                        image,
                        cover: image,
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
        }
        catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }
    async getAnime(id, options) {
        try {
            const animeId = id.replace('animedao-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${animeId}.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const title = $('h1, .anime-title').text().trim();
            const image = $('.anime-image img, .poster img').attr('src') || '';
            const description = $('.anime-desc, .description').text().trim();
            const genres = [];
            $('.genres a, .genre-item').each((i, el) => {
                genres.push($(el).text().trim());
            });
            return {
                id,
                title,
                image,
                cover: image,
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
        }
        catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }
    async getEpisodes(animeId, options) {
        try {
            const id = animeId.replace('animedao-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${id}.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const episodes = [];
            $('.episode-item a, .episodes a').each((i, el) => {
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
            return episodes;
        }
        catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }
    async getEpisodeServers(episodeId, options) {
        return [{ name: 'Default', url: '', type: 'sub' }];
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        try {
            const response = await axios.get(`${this.baseUrl}/watch/${episodeId}.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const sources = [];
            const iframeSrc = $('iframe').attr('src');
            if (iframeSrc) {
                const embedResponse = await axios.get(iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`, {
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
        }
        catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }
    async getTrending(page = 1, options) {
        try {
            const response = await axios.get(`${this.baseUrl}/popular.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('.col-md-6, .anime-item').each((i, el) => {
                const title = $(el).find('.anime-name, .name a').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.split('/').pop()?.replace('.html', '') || '';
                const image = $(el).find('img').attr('src') || '';
                if (id && title) {
                    results.push({
                        id: `animedao-${id}`,
                        title,
                        image,
                        cover: image,
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
        }
        catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }
    async getLatest(page = 1, options) {
        try {
            const response = await axios.get(`${this.baseUrl}/latest.html`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('.col-md-6, .anime-item').each((i, el) => {
                const title = $(el).find('.anime-name, .name a').text().trim();
                const href = $(el).find('a').first().attr('href') || '';
                const id = href.split('/').pop()?.replace('.html', '') || '';
                const image = $(el).find('img').attr('src') || '';
                if (id && title) {
                    results.push({
                        id: `animedao-${id}`,
                        title,
                        image,
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
                }
            });
            return results;
        }
        catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }
    async getTopRated(page = 1, limit = 10, options) {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, index) => ({
            rank: (page - 1) * limit + index + 1,
            anime
        }));
    }
}
//# sourceMappingURL=animedao-source.js.map