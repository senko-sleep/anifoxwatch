import axios from 'axios';
import { createHash, createDecipheriv } from 'crypto';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

const API_URL = 'https://api.allanime.day/api';
const API_URL_ALT = 'https://allanime.day/api'; // alternate endpoint, less CAPTCHA-blocked
const CDN_REFERER = 'https://allanime.day';
// Mobile User-Agent bypasses the CAPTCHA gate on AllAnime's streaming GQL from cloud IPs
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';

/** Decrypt AllAnime's AES-256-GCM encrypted `tobeparsed` responses. */
function decryptTobeparsed(tbp: string, method?: string): any {
    try {
        // First, try parsing as plain JSON (AllAnime may have removed encryption)
        try {
            const plain = JSON.parse(tbp);
            console.log('[AllAnime] Successfully parsed as plain JSON (no encryption)');
            return plain;
        } catch {
            // Not plain JSON, try decryption
        }
        
        const raw = Buffer.from(tbp, 'base64');
        
        // Correct key from anipy-cli: "Xot36i3lK3:v1"
        const key = createHash('sha256').update('Xot36i3lK3:v1').digest();
        
        // Correct IV/tag positions from anipy-cli
        const iv = raw.subarray(1, 13); // IV starts at position 1, length 12
        const ciphertext = raw.subarray(13, raw.length - 16); // Ciphertext from position 13 to 16 bytes before end
        const tag = raw.subarray(raw.length - 16); // Tag is last 16 bytes
        
        try {
            const decipher = createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            const result = JSON.parse(decrypted.toString('utf-8'));
            console.log(`[AllAnime] Successfully decrypted with key: Xot36i3lK3:v1 (method: ${method || 'unknown'})`);
            return result;
        } catch (e) {
            console.error('[AllAnime] Failed to decrypt with correct key:', (e as Error).message);
            
            // Fallback: try old key if new one fails
            const oldKeys = ['SimtVuagFbGR2K7P', 'P7K2RGbFgauVtmiS'];
            for (const oldKey of oldKeys) {
                try {
                    const oldKeyHash = createHash('sha256').update(oldKey).digest();
                    const oldDecipher = createDecipheriv('aes-256-gcm', oldKeyHash, iv);
                    oldDecipher.setAuthTag(tag);
                    const oldDecrypted = Buffer.concat([oldDecipher.update(ciphertext), oldDecipher.final()]);
                    const oldResult = JSON.parse(oldDecrypted.toString('utf-8'));
                    console.log(`[AllAnime] Successfully decrypted with fallback key: ${oldKey}`);
                    return oldResult;
                } catch {
                    continue;
                }
            }
        }
        
        // If all keys fail, try parsing base64-decoded as JSON
        try {
            const plain = JSON.parse(Buffer.from(tbp, 'base64').toString('utf-8'));
            console.log('[AllAnime] Successfully parsed base64-decoded as JSON');
            return plain;
        } catch {
            // Try returning the original data structure without decryption
            console.log('[AllAnime] Returning unmodified data (encryption may have been removed)');
            return { tobeparsed: tbp };
        }
    } catch (e) {
        console.error('[AllAnime] Failed to decrypt tobeparsed:', (e as Error).message);
        throw e;
    }
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
        const headers = {
            'Content-Type': 'application/json',
            'Referer': 'https://allmanga.to/',
            'Origin': 'https://allmanga.to',
            // Mobile UA bypasses CAPTCHA on streaming GQL from cloud/datacenter IPs
            'User-Agent': MOBILE_UA,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
        };
        let response = await axios.post(API_URL, { query }, {
            headers,
            signal: options?.signal,
            timeout: options?.timeout || 10000
        }).catch(() => null);

        // Fallback to alternate endpoint if primary fails or returns CAPTCHA
        if (!response || response.data?.errors?.[0]?.message === 'NEED_CAPTCHA') {
            response = await axios.post(API_URL_ALT, { query }, {
                headers,
                signal: options?.signal,
                timeout: options?.timeout || 10000
            });
        }
        if (response?.data?.errors?.length) {
            throw new Error(response.data.errors[0].message);
        }
        let data = response?.data?.data;
        // AllAnime now returns encrypted responses for some queries
        if (data?.tobeparsed) {
            try {
                const method = data._m || 'unknown';
                data = decryptTobeparsed(data.tobeparsed, method);
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
