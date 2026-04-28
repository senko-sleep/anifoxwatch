import axios from 'axios';
import { BaseAnimeSource } from './base-source.js';
/**
 * DirectDownloadSource - Uses direct download links from various anime sites
 * This source tries to find direct MP4/MKV download links that can be streamed
 */
export class DirectDownloadSource extends BaseAnimeSource {
    name = 'DirectDownload';
    baseUrl = 'https://animepahe.com';
    async healthCheck(options) {
        try {
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 5000
            });
            return response.status === 200;
        }
        catch {
            return false;
        }
    }
    async search(query, page = 1, filters, options) {
        try {
            const response = await axios.get(`${this.baseUrl}/api`, {
                params: { m: 'search', q: query, l: 20 },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const data = response.data.data;
            const results = (data || []).map((item) => ({
                id: `direct-${item.id}`,
                title: item.title,
                image: item.poster,
                cover: item.poster,
                description: item.snapshot || '',
                type: 'TV',
                status: item.status === 'Completed' ? 'Completed' : 'Ongoing',
                rating: 0,
                episodes: item.episodes || 0,
                episodesAired: item.episodes || 0,
                genres: [],
                studios: [],
                year: item.year || 0,
                subCount: 0,
                dubCount: 0,
                source: this.name,
                isMature: false
            }));
            return {
                results,
                totalPages: results.length === 20 ? page + 1 : page,
                currentPage: page,
                hasNextPage: results.length === 20,
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
            const animeId = id.replace('direct-', '');
            const response = await axios.get(`${this.baseUrl}/api`, {
                params: { m: 'release_id', id: animeId },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const data = response.data.data;
            return {
                id: `direct-${data.id}`,
                title: data.title,
                image: data.poster,
                cover: data.poster,
                description: data.description || '',
                type: 'TV',
                status: data.status === 'Completed' ? 'Completed' : 'Ongoing',
                rating: 0,
                episodes: data.episodes || 0,
                episodesAired: data.episodes || 0,
                genres: data.genre || [],
                studios: [],
                year: data.year || 0,
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
            const id = animeId.replace('direct-', '');
            const response = await axios.get(`${this.baseUrl}/api`, {
                params: { m: 'release_id', id: id, s: 0 },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const data = response.data.data;
            const episodes = (data || []).map((ep, index) => ({
                id: `direct-${id}-${ep.session}`,
                number: ep.episode || index + 1,
                title: `Episode ${ep.episode || index + 1}`,
                isFiller: false,
                hasSub: true,
                hasDub: false,
                thumbnail: ep.snapshot || ''
            }));
            return episodes;
        }
        catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }
    async getEpisodeServers(episodeId, options) {
        return [
            { name: 'Direct Download', url: '', type: 'sub' }
        ];
    }
    async getStreamingLinks(episodeId, server, category = 'sub', options) {
        try {
            const id = episodeId.replace('direct-', '');
            const parts = id.split('-');
            const animeId = parts.slice(0, -1).join('-');
            const session = parts[parts.length - 1];
            const response = await axios.get(`${this.baseUrl}/api`, {
                params: { m: 'release_id', id: animeId, s: session },
                signal: options?.signal,
                timeout: options?.timeout || 15000
            });
            const data = response.data.data;
            if (!data || !data[0]) {
                return { sources: [], subtitles: [] };
            }
            // Try to extract direct download links
            const sources = [];
            // AnimePahe provides multiple quality options
            const qualities = ['1080p', '720p', '480p', '360p'];
            for (const quality of qualities) {
                if (data[0][quality]) {
                    const link = data[0][quality];
                    if (link && typeof link === 'string') {
                        sources.push({
                            url: link,
                            quality: quality.replace('p', ''),
                            isM3U8: link.includes('.m3u8')
                        });
                    }
                }
            }
            return {
                sources,
                subtitles: [],
                headers: { Referer: this.baseUrl },
                source: this.name
            };
        }
        catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }
    async getTrending(page = 1, options) {
        try {
            const response = await axios.get(`${this.baseUrl}/api`, {
                params: { m: 'airing', page: page },
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
            const data = response.data.data;
            return (data || []).map((item) => ({
                id: `direct-${item.id}`,
                title: item.title,
                image: item.poster,
                cover: item.poster,
                description: '',
                type: 'TV',
                status: 'Ongoing',
                rating: 0,
                episodes: item.episodes || 0,
                episodesAired: item.episodes || 0,
                genres: [],
                studios: [],
                year: item.year || 0,
                subCount: 0,
                dubCount: 0,
                source: this.name,
                isMature: false
            }));
        }
        catch {
            return [];
        }
    }
    async getLatest(page = 1, options) {
        return this.getTrending(page, options);
    }
    async getTopRated(page = 1, limit = 10, options) {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, i) => ({
            rank: (page - 1) * limit + i + 1,
            anime
        }));
    }
}
//# sourceMappingURL=direct-download-source.js.map