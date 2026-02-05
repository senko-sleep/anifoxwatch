import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

export class KickassAnimeSource extends BaseAnimeSource {
    name = 'KickassAnime';
    baseUrl = 'https://kickassanime.am';
    apiUrl = 'https://kickassanime.am/api';

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 5000,
                headers: this.getHeaders()
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    private getHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/html, */*',
            'Referer': this.baseUrl
        };
    }

    async search(query: string, page: number = 1, _filters?: Record<string, unknown>, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.apiUrl}/search`, {
                params: { q: query },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data || [];
            const results: AnimeBase[] = data.map((item: { slug: string; name: string; poster: string; year: number }) => ({
                id: `kickassanime-${item.slug}`,
                title: item.name,
                image: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                cover: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                description: '',
                type: 'TV' as const,
                status: 'Ongoing' as const,
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
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const slug = id.replace('kickassanime-', '');
            const response = await axios.get(`${this.apiUrl}/show/${slug}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data;

            const genres = (data.genres || []).map((g: { name: string }) => g.name);

            return {
                id,
                title: data.name,
                titleJapanese: data.title_japanese,
                image: data.poster?.startsWith('http') ? data.poster : `${this.baseUrl}${data.poster}`,
                cover: data.banner?.startsWith('http') ? data.banner : `${this.baseUrl}${data.banner}`,
                description: data.description || '',
                type: (data.type as 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special') || 'TV',
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
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const slug = animeId.replace('kickassanime-', '');
            const response = await axios.get(`${this.apiUrl}/show/${slug}/episodes`, {
                params: { lang: 'en-US' },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data || [];
            
            return data.map((ep: { slug: string; episode_number: number; title: string; thumbnail: string }, i: number) => ({
                id: `${slug}/${ep.slug}`,
                number: ep.episode_number || i + 1,
                title: ep.title || `Episode ${ep.episode_number || i + 1}`,
                isFiller: false,
                hasSub: true,
                hasDub: false,
                thumbnail: ep.thumbnail ? (ep.thumbnail.startsWith('http') ? ep.thumbnail : `${this.baseUrl}${ep.thumbnail}`) : ''
            }));
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        try {
            const [showSlug, epSlug] = episodeId.split('/');
            const response = await axios.get(`${this.apiUrl}/show/${showSlug}/episode/${epSlug}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });

            const servers = response.data?.servers || [];
            return servers.map((s: { name: string; shortName: string }) => ({
                name: s.name || s.shortName,
                url: s.shortName,
                type: 'sub' as const
            }));
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [{ name: 'Default', url: '', type: 'sub' }];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const [showSlug, epSlug] = episodeId.split('/');
            const response = await axios.get(`${this.apiUrl}/show/${showSlug}/episode/${epSlug}/source`, {
                params: { server: server || 'duck' },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });

            const data = response.data;
            const sources: VideoSource[] = [];

            if (data?.source) {
                sources.push({
                    url: data.source,
                    quality: 'auto',
                    isM3U8: data.source.includes('.m3u8')
                });
            }

            const subtitles = (data?.subtitles || []).map((sub: { src: string; label: string }) => ({
                url: sub.src,
                lang: sub.label
            }));

            return { sources, subtitles, headers: { 'Referer': this.baseUrl } };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.apiUrl}/trending`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data || [];
            return data.map((item: { slug: string; name: string; poster: string; year: number }) => ({
                id: `kickassanime-${item.slug}`,
                title: item.name,
                image: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                cover: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                description: '',
                type: 'TV' as const,
                status: 'Ongoing' as const,
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
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(`${this.apiUrl}/recent`, {
                params: { page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const data = response.data || [];
            return data.map((item: { slug: string; name: string; poster: string; year: number }) => ({
                id: `kickassanime-${item.slug}`,
                title: item.name,
                image: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                cover: item.poster?.startsWith('http') ? item.poster : `${this.baseUrl}${item.poster}`,
                description: '',
                type: 'TV' as const,
                status: 'Ongoing' as const,
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
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        const trending = await this.getTrending(page, options);
        return trending.slice(0, limit).map((anime, index) => ({
            rank: (page - 1) * limit + index + 1,
            anime
        }));
    }
}
