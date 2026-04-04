import axios from 'axios';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

const API_URL = 'https://api.allanime.day/api';
const CDN_REFERER = 'https://allanime.day';

export class AllAnimeSource extends BaseAnimeSource {
    name = 'AllAnime';
    baseUrl = API_URL;

    private decodeUrl(encoded: string): string {
        const hex = encoded.startsWith('--') ? encoded.slice(2) : encoded;
        let result = '';
        for (let i = 0; i < hex.length - 1; i += 2) {
            result += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
        }
        return result;
    }

    private async gqlQuery(query: string, options?: SourceRequestOptions): Promise<any> {
        const response = await axios.post(API_URL, { query }, {
            headers: { 'Content-Type': 'application/json' },
            signal: options?.signal,
            timeout: options?.timeout || 10000
        });
        if (response.data.errors?.length) {
            throw new Error(response.data.errors[0].message);
        }
        return response.data.data;
    }

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const data = await this.gqlQuery(
                '{shows(search:{query:"Naruto"},limit:1,page:1,countryOrigin:ALL){edges{_id}}}',
                options
            );
            return (data?.shows?.edges?.length ?? 0) > 0;
        } catch {
            return false;
        }
    }

    private mapShow(show: any): AnimeBase {
        const subCount = show.availableEpisodesDetail?.sub?.length ?? 0;
        const dubCount = show.availableEpisodesDetail?.dub?.length ?? 0;
        const epCount = Math.max(subCount, dubCount);
        return {
            id: `allanime-${show._id}`,
            title: show.name || 'Unknown',
            image: show.thumbnail || '',
            cover: show.thumbnail || '',
            description: show.description?.replace(/<[^>]*>/g, '') || '',
            type: 'TV',
            status: show.status === 'Finished' ? 'Completed' : 'Ongoing',
            rating: 0,
            episodes: epCount,
            episodesAired: epCount,
            genres: show.genres || [],
            studios: [],
            year: 0,
            subCount,
            dubCount,
            source: this.name,
            isMature: false
        };
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const escapedQuery = query.replace(/"/g, '\\"');
            const data = await this.gqlQuery(
                `{shows(search:{query:"${escapedQuery}"},limit:20,page:${page},countryOrigin:ALL){edges{_id,name,thumbnail,description,genres,status,availableEpisodesDetail}}}`,
                options
            );

            const results: AnimeBase[] = (data?.shows?.edges || []).map((s: any) => this.mapShow(s));
            return {
                results,
                totalPages: results.length === 20 ? page + 1 : page,
                currentPage: page,
                hasNextPage: results.length === 20,
                source: this.name
            };
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const showId = id.replace('allanime-', '');
            const escapedId = showId.replace(/"/g, '\\"');
            const data = await this.gqlQuery(
                `{show(_id:"${escapedId}"){_id,name,thumbnail,description,genres,status,availableEpisodesDetail}}`,
                options
            );
            if (!data?.show) return null;
            return this.mapShow(data.show);
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const showId = animeId.replace('allanime-', '');
            const escapedId = showId.replace(/"/g, '\\"');
            const data = await this.gqlQuery(
                `{show(_id:"${escapedId}"){availableEpisodesDetail}}`,
                options
            );

            const detail = data?.show?.availableEpisodesDetail;
            if (!detail) return [];

            const subEps: string[] = detail.sub || [];
            const dubEps: string[] = detail.dub || [];

            // Use sub episodes as primary, add dub info
            const allEpNums = [...new Set([...subEps, ...dubEps])]
                .map(Number)
                .filter(n => !isNaN(n) && n > 0)
                .sort((a, b) => a - b);

            const dubSet = new Set(dubEps.map(Number));

            return allEpNums.map(epNum => ({
                id: `allanime-${showId}-${epNum}`,
                number: epNum,
                title: `Episode ${epNum}`,
                isFiller: false,
                hasSub: subEps.map(Number).includes(epNum),
                hasDub: dubSet.has(epNum),
                thumbnail: ''
            }));
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        return [
            { name: 'AllAnime', url: '', type: 'sub' },
            { name: 'AllAnime (dub)', url: '', type: 'dub' }
        ];
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            // Parse allanime-{showId}-{epNum}
            const withoutPrefix = episodeId.replace(/^allanime-/, '');
            const lastDash = withoutPrefix.lastIndexOf('-');
            if (lastDash === -1) return { sources: [], subtitles: [] };

            const showId = withoutPrefix.slice(0, lastDash);
            const epNum = withoutPrefix.slice(lastDash + 1);
            const translationType = category === 'dub' ? 'dub' : 'sub';

            const escapedId = showId.replace(/"/g, '\\"');
            const data = await this.gqlQuery(
                `{episode(showId:"${escapedId}",translationType:${translationType},episodeString:"${epNum}"){sourceUrls}}`,
                options
            );

            const sourceUrls: any[] = data?.episode?.sourceUrls || [];

            // Try Yt-mp4 first (direct video, highest usable priority)
            const ytMp4 = sourceUrls.find(s => s.sourceName === 'Yt-mp4' && s.sourceUrl?.startsWith('--'));
            if (ytMp4) {
                const rawUrl = this.decodeUrl(ytMp4.sourceUrl);
                if (rawUrl.startsWith('http') && rawUrl.includes('fast4speed')) {
                    return {
                        sources: [{
                            url: rawUrl,
                            quality: 'default',
                            isM3U8: false
                        }],
                        subtitles: [],
                        headers: { 'Referer': CDN_REFERER },
                        source: this.name
                    };
                }
            }

            return { sources: [], subtitles: [] };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const data = await this.gqlQuery(
                `{shows(search:{sortBy:"Top",allowAdult:false},limit:20,page:${page},countryOrigin:JP){edges{_id,name,thumbnail,description,genres,status,availableEpisodesDetail}}}`,
                options
            );
            return (data?.shows?.edges || []).map((s: any) => this.mapShow(s));
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const data = await this.gqlQuery(
                `{shows(search:{sortBy:"Update",allowAdult:false},limit:20,page:${page},countryOrigin:JP){edges{_id,name,thumbnail,description,genres,status,availableEpisodesDetail}}}`,
                options
            );
            return (data?.shows?.edges || []).map((s: any) => this.mapShow(s));
        } catch (error) {
            this.handleError(error, 'getLatest');
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }
}
