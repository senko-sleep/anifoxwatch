import axios from 'axios';
import { BaseAnimeSource } from './base-source.js';
export class CrunchyrollSource extends BaseAnimeSource {
    name = 'Crunchyroll';
    baseUrl = 'https://www.crunchyroll.com';
    apiUrl = 'https://beta-api.crunchyroll.com';
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
            'Accept': 'application/json',
            'Referer': this.baseUrl
        };
    }
    async search(query, page = 1, _filters, options) {
        try {
            const response = await axios.get(`${this.apiUrl}/content/v2/discover/search`, {
                params: { q: query, n: 20, start: (page - 1) * 20, type: 'series' },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const items = response.data?.data?.[0]?.items || [];
            const results = items.map((item) => ({
                id: `crunchyroll-${item.id}`,
                title: item.title || item.slug_title,
                image: item.images?.poster_tall?.[0]?.[0]?.source || '',
                cover: item.images?.poster_tall?.[0]?.[0]?.source || '',
                description: item.description || '',
                type: 'TV',
                status: 'Ongoing',
                episodes: item.series_metadata?.episode_count || 0,
                episodesAired: item.series_metadata?.episode_count || 0,
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
                totalPages: Math.ceil((response.data?.total || 0) / 20),
                currentPage: page,
                hasNextPage: items.length === 20,
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
            const seriesId = id.replace('crunchyroll-', '');
            const response = await axios.get(`${this.apiUrl}/content/v2/cms/series/${seriesId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data?.data?.[0];
            if (!data)
                return null;
            const genres = (data.genres || []).map((g) => g);
            return {
                id,
                title: data.title,
                titleJapanese: data.title,
                image: data.images?.poster_tall?.[0]?.[0]?.source || '',
                cover: data.images?.poster_wide?.[0]?.[0]?.source || '',
                description: data.description || '',
                type: 'TV',
                status: data.is_simulcast ? 'Ongoing' : 'Completed',
                rating: 0,
                episodes: data.episode_count || 0,
                episodesAired: data.episode_count || 0,
                genres,
                studios: [],
                year: data.series_launch_year || 0,
                subCount: data.episode_count || 0,
                dubCount: 0,
                source: this.name,
                isMature: data.is_mature || false
            };
        }
        catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }
    async getEpisodes(animeId, options) {
        try {
            const seriesId = animeId.replace('crunchyroll-', '');
            const response = await axios.get(`${this.apiUrl}/content/v2/cms/series/${seriesId}/seasons`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const seasons = response.data?.data || [];
            const episodes = [];
            for (const season of seasons) {
                const epResponse = await axios.get(`${this.apiUrl}/content/v2/cms/seasons/${season.id}/episodes`, {
                    signal: options?.signal,
                    timeout: options?.timeout || 10000,
                    headers: this.getHeaders()
                });
                const eps = epResponse.data?.data || [];
                eps.forEach((ep) => {
                    episodes.push({
                        id: ep.id,
                        number: ep.episode_number || 0,
                        title: ep.title || `Episode ${ep.episode_number}`,
                        isFiller: false,
                        hasSub: ep.is_subbed || true,
                        hasDub: ep.is_dubbed || false,
                        thumbnail: ep.images?.thumbnail?.[0]?.[0]?.source || ''
                    });
                });
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
            { name: 'Crunchyroll', url: '', type: 'sub' },
            { name: 'Crunchyroll Dub', url: '', type: 'dub' }
        ];
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        try {
            const response = await axios.get(`${this.apiUrl}/content/v2/cms/objects/${episodeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data?.data?.[0];
            const streams = data?.streams_link;
            if (!streams) {
                return { sources: [], subtitles: [] };
            }
            const streamResponse = await axios.get(streams, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const sources = [];
            const subtitles = [];
            // Extract HLS streams
            const hlsStreams = streamResponse.data?.streams?.adaptive_hls || {};
            Object.entries(hlsStreams).forEach(([lang, stream]) => {
                const s = stream;
                if (s.url) {
                    sources.push({
                        url: s.url,
                        quality: 'auto',
                        isM3U8: true
                    });
                }
            });
            // Extract subtitles
            const subs = streamResponse.data?.subtitles || {};
            Object.entries(subs).forEach(([lang, sub]) => {
                const s = sub;
                if (s.url) {
                    subtitles.push({ url: s.url, lang });
                }
            });
            return { sources, subtitles, headers: { 'Referer': this.baseUrl } };
        }
        catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }
    async getTrending(page = 1, options) {
        try {
            const response = await axios.get(`${this.apiUrl}/content/v2/discover/browse`, {
                params: { sort_by: 'popularity', n: 20, start: (page - 1) * 20 },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const items = response.data?.data || [];
            return items.map((item) => ({
                id: `crunchyroll-${item.id}`,
                title: item.title,
                image: item.images?.poster_tall?.[0]?.[0]?.source || '',
                cover: item.images?.poster_tall?.[0]?.[0]?.source || '',
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
            const response = await axios.get(`${this.apiUrl}/content/v2/discover/browse`, {
                params: { sort_by: 'newly_added', n: 20, start: (page - 1) * 20 },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const items = response.data?.data || [];
            return items.map((item) => ({
                id: `crunchyroll-${item.id}`,
                title: item.title,
                image: item.images?.poster_tall?.[0]?.[0]?.source || '',
                cover: item.images?.poster_tall?.[0]?.[0]?.source || '',
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
//# sourceMappingURL=crunchyroll-source.js.map