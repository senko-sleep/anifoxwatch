import axios from 'axios';
import { createHash, createDecipheriv } from 'crypto';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

const API_URL = 'https://api.allanime.day/api';
const CDN_REFERER = 'https://allanime.day';

/** Decrypt AllAnime's AES-256-GCM encrypted `tobeparsed` responses. */
function decryptTobeparsed(tbp: string): any {
    const raw = Buffer.from(tbp, 'base64');
    const key = createHash('sha256').update('SimtVuagFbGR2K7P').digest();
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const ciphertext = raw.subarray(12, raw.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
}

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
            headers: { 'Content-Type': 'application/json', 'Referer': 'https://allmanga.to/' },
            signal: options?.signal,
            timeout: options?.timeout || 10000
        });
        if (response.data.errors?.length) {
            throw new Error(response.data.errors[0].message);
        }
        let data = response.data.data;
        // AllAnime now returns encrypted responses for some queries
        if (data?.tobeparsed) {
            try {
                data = decryptTobeparsed(data.tobeparsed);
            } catch (e) {
                console.error('[AllAnime] Failed to decrypt tobeparsed:', (e as Error).message);
            }
        }
        return data;
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

            // Decode all source URLs and collect playable ones.
            // Priority: fast4speed direct > M3U8 > other direct MP4.
            const sources: VideoSource[] = [];
            // Preferred source names in order (Yt-mp4 = fast4speed CDN, Default/Ak/Sak = gogoanime-style embed, Luf-mp4 = alternative)
            const preferred = ['Yt-mp4', 'Default', 'Ak', 'Sak', 'S-mp4', 'Luf-mp4'];
            const sorted = [
                ...sourceUrls.filter(s => preferred.includes(s.sourceName)),
                ...sourceUrls.filter(s => !preferred.includes(s.sourceName))
            ];

            for (const src of sorted) {
                if (!src.sourceUrl) continue;
                const raw = src.sourceUrl.startsWith('--') ? this.decodeUrl(src.sourceUrl) : src.sourceUrl;

                // Direct HTTP URLs (fast4speed CDN, etc.)
                if (raw.startsWith('http')) {
                    const isM3U8 = raw.includes('.m3u8');
                    const isFast4speed = raw.includes('fast4speed');
                    if (isM3U8 || isFast4speed) {
                        sources.push({ url: raw, quality: isM3U8 ? 'auto' : 'default', isM3U8 });
                    }
                    continue;
                }

                // /apivtwo/clock paths → fetch from AllAnime to get actual stream links
                if (raw.startsWith('/apivtwo/clock')) {
                    try {
                        const clockUrl = `https://allanime.day${raw.replace('clock', 'clock.json')}`;
                        const clockResp = await axios.get(clockUrl, {
                            headers: { 'Referer': 'https://allmanga.to/' },
                            timeout: 8000,
                            signal: options?.signal,
                        });
                        const links: any[] = clockResp.data?.links || [];
                        for (const link of links) {
                            const href: string = link?.link || '';
                            if (!href) continue;
                            const linkIsM3U8 = href.includes('.m3u8');
                            const linkIsMp4 = href.includes('.mp4');
                            if (linkIsM3U8 || linkIsMp4) {
                                sources.push({ url: href, quality: linkIsM3U8 ? 'auto' : 'default', isM3U8: linkIsM3U8 });
                            }
                        }
                    } catch { /* clock endpoint unavailable */ }
                }
            }

            return {
                sources,
                subtitles: [],
                headers: { 'Referer': CDN_REFERER },
                source: this.name
            };
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
