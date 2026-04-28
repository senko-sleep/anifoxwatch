import axios from 'axios';
import { BaseAnimeSource } from './base-source.js';
export class KickassAnimeSource extends BaseAnimeSource {
    name = 'KickassAnime';
    baseUrl = 'https://kickassanime.am';
    apiUrl = 'https://kickassanime.am/api';
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
            'Accept': 'application/json, text/html, */*',
            'Referer': this.baseUrl
        };
    }
    async search(query, page = 1, _filters, options) {
        try {
            const response = await axios.get(`${this.apiUrl}/search`, {
                params: { q: query },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data || [];
            const results = data.map((item) => ({
                id: `kickassanime-${item.slug}`,
                title: item.name,
                image: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                cover: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                description: '',
                type: 'TV',
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                year: item.year || 0,
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
            const slug = id.replace('kickassanime-', '');
            const response = await axios.get(`${this.apiUrl}/show/${slug}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data;
            const genres = (data.genres || []).map((g) => g.name);
            return {
                id,
                title: data.name,
                titleJapanese: data.title_japanese,
                image: data.poster?.startsWith('http') ? data.poster : `${this.baseUrl}${data.poster}`,
                cover: data.banner?.startsWith('http') ? data.banner : `${this.baseUrl}${data.banner}`,
                description: data.description || '',
                type: data.type || 'TV',
                status: data.status === 'finished' ? 'Completed' : 'Ongoing',
                rating: parseFloat(data.rating) || 0,
                episodes: data.episode_count || 0,
                episodesAired: data.episode_count || 0,
                genres,
                studios: [],
                year: data.year || 0,
                subCount: data.episode_count || 0,
                dubCount: 0,
                source: this.name,
                isMature: data.nsfw || false
            };
        }
        catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }
    async getEpisodes(animeId, options) {
        try {
            const slug = animeId.replace('kickassanime-', '');
            const response = await axios.get(`${this.apiUrl}/show/${slug}/episodes`, {
                params: { lang: 'en-US' },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data || [];
            return data.map((ep, i) => ({
                id: `${slug}/${ep.slug}`,
                number: ep.episode_number || i + 1,
                title: ep.title || `Episode ${ep.episode_number || i + 1}`,
                isFiller: false,
                hasSub: true,
                hasDub: false,
                thumbnail: ep.thumbnail ? (ep.thumbnail.startsWith('http') ? ep.thumbnail : `${this.baseUrl}${ep.thumbnail}`) : ''
            }));
        }
        catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }
    async getEpisodeServers(episodeId, options) {
        try {
            const [showSlug, epSlug] = episodeId.split('/');
            const response = await axios.get(`${this.apiUrl}/show/${showSlug}/episode/${epSlug}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const servers = response.data?.servers || [];
            return servers.map((s) => ({
                name: s.name || s.shortName,
                url: s.shortName,
                type: 'sub'
            }));
        }
        catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [{ name: 'Default', url: '', type: 'sub' }];
        }
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        try {
            const [showSlug, epSlug] = episodeId.split('/');
            const response = await axios.get(`${this.apiUrl}/show/${showSlug}/episode/${epSlug}/source`, {
                params: { server: server || 'duck' },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data;
            const sources = [];
            if (data?.source) {
                sources.push({
                    url: data.source,
                    quality: 'auto',
                    isM3U8: data.source.includes('.m3u8')
                });
            }
            const subtitles = (data?.subtitles || []).map((sub) => ({
                url: sub.src,
                lang: sub.label
            }));
            return { sources, subtitles, headers: { 'Referer': this.baseUrl } };
        }
        catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }
    async getTrending(page = 1, options) {
        try {
            const response = await axios.get(`${this.apiUrl}/trending`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data || [];
            return data.map((item) => ({
                id: `kickassanime-${item.slug}`,
                title: item.name,
                image: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                cover: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                description: '',
                type: 'TV',
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                year: item.year || 0,
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
            const response = await axios.get(`${this.apiUrl}/recent`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data || [];
            return data.map((item) => ({
                id: `kickassanime-${item.slug}`,
                title: item.name,
                image: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                cover: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                description: '',
                type: 'TV',
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                year: item.year || new Date().getFullYear(),
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
//# sourceMappingURL=kickassanime-source.js.map