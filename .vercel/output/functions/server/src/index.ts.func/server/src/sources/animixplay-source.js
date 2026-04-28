import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource } from './base-source.js';
export class AniMixPlaySource extends BaseAnimeSource {
    name = 'AniMixPlay';
    baseUrl = 'https://animixplay.to';
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
            const response = await axios.post(`${this.baseUrl}/api/search`, { q: query }, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: { ...this.getHeaders(), 'Content-Type': 'application/json' }
            });
            const data = response.data?.result || [];
            const results = data.map((item) => ({
                id: `animixplay-${item.id || item.url?.split('/').pop()}`,
                title: item.title,
                image: item.img,
                cover: item.img,
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
            }));
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
            const animeId = id.replace('animixplay-', '');
            const response = await axios.get(`${this.baseUrl}/v1/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const title = $('#aligncenter h1, .title').first().text().trim();
            const image = $('#poster img, .poster').attr('src') || '';
            const description = $('#synp, .synopsis').text().trim();
            const genres = [];
            $('#genres a, .genre').each((i, el) => {
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
            const id = animeId.replace('animixplay-', '');
            const response = await axios.get(`${this.baseUrl}/v1/${id}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const episodes = [];
            $('#epslistplace .ep-item, .episode-list a').each((i, el) => {
                const epNum = parseInt($(el).attr('data-num') || $(el).text().replace(/\D/g, '')) || i + 1;
                const epId = $(el).attr('data-id') || `${id}-${epNum}`;
                episodes.push({
                    id: epId,
                    number: epNum,
                    title: `Episode ${epNum}`,
                    isFiller: false,
                    hasSub: true,
                    hasDub: false,
                    thumbnail: ''
                });
            });
            // If no episodes found via HTML, try extracting from script
            if (episodes.length === 0) {
                const scriptMatch = response.data.match(/epslistplace.*?(\[[\s\S]*?\])/);
                if (scriptMatch) {
                    try {
                        const epList = JSON.parse(scriptMatch[1]);
                        epList.forEach((ep, i) => {
                            episodes.push({
                                id: typeof ep === 'string' ? ep : ep.id || `${id}-${i + 1}`,
                                number: i + 1,
                                title: `Episode ${i + 1}`,
                                isFiller: false,
                                hasSub: true,
                                hasDub: false,
                                thumbnail: ''
                            });
                        });
                    }
                    catch {
                        // JSON parse failed, ignore
                    }
                }
            }
            return episodes;
        }
        catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }
    async getEpisodeServers(episodeId, options) {
        return [
            { name: 'Vidstream', url: '', type: 'sub' },
            { name: 'Gogo', url: '', type: 'sub' }
        ];
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        try {
            const response = await axios.get(`${this.baseUrl}/api/live${episodeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const sources = [];
            const data = response.data;
            if (data?.url) {
                sources.push({
                    url: data.url,
                    quality: 'auto',
                    isM3U8: data.url.includes('.m3u8')
                });
            }
            // Try alternative extraction
            if (sources.length === 0 && typeof data === 'string') {
                const m3u8Match = data.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
                if (m3u8Match) {
                    sources.push({ url: m3u8Match[0], quality: 'auto', isM3U8: true });
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
            const response = await axios.get(`${this.baseUrl}/api/popular`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data?.result || [];
            return data.map((item) => ({
                id: `animixplay-${item.id || item.url?.split('/').pop()}`,
                title: item.title,
                image: item.img,
                cover: item.img,
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
            }));
        }
        catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }
    async getLatest(page = 1, options) {
        try {
            const response = await axios.get(`${this.baseUrl}/api/recent`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data?.result || [];
            return data.map((item) => ({
                id: `animixplay-${item.id || item.url?.split('/').pop()}`,
                title: item.title,
                image: item.img,
                cover: item.img,
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
            }));
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
//# sourceMappingURL=animixplay-source.js.map