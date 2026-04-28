import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource } from './base-source.js';
export class ZoroSource extends BaseAnimeSource {
    name = 'Zoro';
    baseUrl = 'https://aniwatch.to';
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
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': this.baseUrl
        };
    }
    async search(query, page = 1, filters, options) {
        try {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: { keyword: query, page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('.film_list-wrap .flw-item').each((i, el) => {
                const title = $(el).find('.film-name a').text().trim();
                const href = $(el).find('.film-name a').attr('href') || '';
                const id = href.split('/').pop()?.split('?')[0] || '';
                const image = $(el).find('.film-poster img').attr('data-src') || '';
                const subCount = parseInt($(el).find('.tick-sub').text()) || 0;
                const dubCount = parseInt($(el).find('.tick-dub').text()) || 0;
                const eps = parseInt($(el).find('.tick-eps').text()) || 0;
                if (id) {
                    results.push({
                        id: `zoro-${id}`,
                        title,
                        image,
                        cover: image,
                        description: '',
                        type: 'TV',
                        status: 'Ongoing',
                        episodes: eps || subCount || dubCount,
                        episodesAired: eps || subCount || dubCount,
                        year: 0,
                        subCount,
                        dubCount,
                        source: this.name,
                        isMature: false,
                        genres: [],
                        studios: [],
                        rating: 0
                    });
                }
            });
            const hasNextPage = $('.pagination .page-item:last-child:not(.disabled)').length > 0;
            return {
                results,
                totalPages: hasNextPage ? page + 1 : page,
                currentPage: page,
                hasNextPage,
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
            const animeId = id.replace('zoro-', '');
            const response = await axios.get(`${this.baseUrl}/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const title = $('.anisc-detail .film-name').text().trim();
            const image = $('.anisc-poster img').attr('src') || '';
            const description = $('.film-description .text').text().trim();
            const genres = [];
            $('.item-list a[href*="/genre/"]').each((i, el) => {
                genres.push($(el).text().trim());
            });
            const type = $('.item:contains("Type:") .name').text().trim() || 'TV';
            const status = $('.item:contains("Status:") .name').text().trim() || 'Ongoing';
            const subCount = parseInt($('.tick-sub').first().text()) || 0;
            const dubCount = parseInt($('.tick-dub').first().text()) || 0;
            return {
                id,
                title,
                image,
                cover: image,
                description,
                type: type,
                status: status,
                rating: 0,
                episodes: subCount || dubCount,
                episodesAired: subCount || dubCount,
                genres,
                studios: [],
                year: 0,
                subCount,
                dubCount,
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
            const id = animeId.replace('zoro-', '');
            const dataId = id.split('-').pop();
            const response = await axios.get(`${this.baseUrl}/ajax/v2/episode/list/${dataId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'X-Requested-With': 'XMLHttpRequest' }
            });
            const $ = cheerio.load(response.data.html || response.data);
            const episodes = [];
            $('.ss-list a').each((i, el) => {
                const epNum = parseInt($(el).attr('data-number') || '0');
                const epId = $(el).attr('data-id') || '';
                const href = $(el).attr('href') || '';
                const title = $(el).attr('title') || `Episode ${epNum}`;
                const isFiller = $(el).hasClass('ssl-item-filler');
                episodes.push({
                    id: href.split('?ep=')[1] || epId,
                    number: epNum,
                    title,
                    isFiller,
                    hasSub: true,
                    hasDub: $(el).find('.tick-dub').length > 0,
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
        try {
            const response = await axios.get(`${this.baseUrl}/ajax/v2/episode/servers?episodeId=${episodeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'X-Requested-With': 'XMLHttpRequest' }
            });
            const $ = cheerio.load(response.data.html || response.data);
            const servers = [];
            $('.servers-sub .server-item, .servers-dub .server-item').each((i, el) => {
                const serverName = $(el).text().trim();
                const serverId = $(el).attr('data-id') || '';
                const type = $(el).closest('.servers-sub').length > 0 ? 'sub' : 'dub';
                servers.push({
                    name: serverName,
                    url: serverId,
                    type: type
                });
            });
            return servers;
        }
        catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [];
        }
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        try {
            const serverId = server || episodeId;
            const response = await axios.get(`${this.baseUrl}/ajax/v2/episode/sources?id=${serverId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'X-Requested-With': 'XMLHttpRequest' }
            });
            const embedUrl = response.data?.link;
            if (!embedUrl) {
                return { sources: [], subtitles: [] };
            }
            const sources = [];
            const subtitles = [];
            // Parse embed URL for streams
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
            // Extract subtitles
            const subtitleMatch = embedResponse.data.match(/tracks:\s*(\[[^\]]+\])/);
            if (subtitleMatch) {
                try {
                    const tracks = JSON.parse(subtitleMatch[1]);
                    tracks.forEach((track) => {
                        if (track.kind === 'captions') {
                            subtitles.push({
                                url: track.file,
                                lang: track.label || 'English'
                            });
                        }
                    });
                }
                catch { }
            }
            return {
                sources,
                subtitles,
                headers: { 'Referer': this.baseUrl }
            };
        }
        catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }
    async getTrending(page = 1, options) {
        try {
            const response = await axios.get(`${this.baseUrl}/most-popular`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('.film_list-wrap .flw-item').each((i, el) => {
                const title = $(el).find('.film-name a').text().trim();
                const href = $(el).find('.film-name a').attr('href') || '';
                const id = href.split('/').pop()?.split('?')[0] || '';
                const image = $(el).find('.film-poster img').attr('data-src') || '';
                if (id) {
                    results.push({
                        id: `zoro-${id}`,
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
            const response = await axios.get(`${this.baseUrl}/recently-updated`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('.film_list-wrap .flw-item').each((i, el) => {
                const title = $(el).find('.film-name a').text().trim();
                const href = $(el).find('.film-name a').attr('href') || '';
                const id = href.split('/').pop()?.split('?')[0] || '';
                const image = $(el).find('.film-poster img').attr('data-src') || '';
                if (id) {
                    results.push({
                        id: `zoro-${id}`,
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
//# sourceMappingURL=zoro-source.js.map