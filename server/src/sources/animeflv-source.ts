import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, EpisodeServer, VideoSource } from '../types/streaming.js';

// Embed domains that we CANNOT extract video URLs from via fetch (require JS execution)
const NON_EXTRACTABLE_EMBEDS = ['mega.nz', 'hqq.tv', 'netu.tv'];

/**
 * Extract direct video URL from Streamtape embed page.
 * Streamtape stores the video link in hidden divs (robotlink/ideoolink)
 * and applies JS string manipulation. We replicate that logic.
 */
async function extractStreamtapeUrl(embedUrl: string): Promise<string | null> {
    try {
        const resp = await axios.get(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            },
            timeout: 10000,
        });
        const html: string = resp.data;

        // Method 1: Parse ALL JS assignments that build the real video URL.
        // Streamtape sets robotlink/ideoolink/botlink multiple times; the LAST one wins.
        // Pattern examples:
        //   getElementById('robotlink').innerHTML = '//streamtape.com/ge'+ ('xcdt_video?...token=xxx').substring(2).substring(1);
        //   getElementById('botlink').innerHTML = '//streamtape.com/ge'+ ('xyzat_video?...').substring(4);
        const jsPattern = /getElementById\(['"](?:robotlink|ideoolink|botlink)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*(?:['"]['"]\s*\+\s*)?\(?['"]([^'"]+)['"]\)?\.substring\((\d+)\)(?:\.substring\((\d+)\))?/g;
        let lastMatch: RegExpExecArray | null = null;
        let m: RegExpExecArray | null;
        while ((m = jsPattern.exec(html)) !== null) {
            lastMatch = m;
        }

        if (lastMatch) {
            const prefix = lastMatch[1]; // e.g. '//streamtape.com/ge'
            let suffix = lastMatch[2];   // e.g. 'xcdt_video?...token=xxx'
            const sub1 = parseInt(lastMatch[3], 10);
            const sub2 = lastMatch[4] ? parseInt(lastMatch[4], 10) : undefined;
            suffix = suffix.substring(sub1);
            if (sub2 !== undefined) suffix = suffix.substring(sub2);
            const videoUrl = `https:${prefix}${suffix}`;
            if (videoUrl.includes('/get_video?') || videoUrl.includes('streamtape.com')) {
                return videoUrl;
            }
        }

        // Method 2: Fallback — grab the robotlink div content directly
        // The div token may be a decoy, but it's better than nothing
        const divMatch = html.match(/<div id="robotlink"[^>]*>([^<]+)<\/div>/);
        if (divMatch) {
            const partial = divMatch[1].trim();
            if (partial.includes('/get_video?')) {
                return partial.startsWith('http') ? partial : `https:${partial}`;
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Extract direct video URL from StreamWish embed page.
 * StreamWish may pack the m3u8 URL inside obfuscated JS.
 * Falls back to returning null if the page requires full JS execution.
 */
async function extractStreamwishUrl(embedUrl: string): Promise<string | null> {
    try {
        const resp = await axios.get(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://www3.animeflv.net',
            },
            timeout: 10000,
        });
        const html: string = resp.data;

        // Look for direct m3u8 URL in the page source
        const m3u8Match = html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
        if (m3u8Match) return m3u8Match[1];

        // Look for sources array pattern
        const sourcesMatch = html.match(/sources\s*:\s*\[\{[^}]*file\s*:\s*["'](https?:\/\/[^"']+)["']/);
        if (sourcesMatch) return sourcesMatch[1];

        // Look for any m3u8 URL in the page
        const anyM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
        if (anyM3u8) return anyM3u8[0];

        // StreamWish often uses a JS loader — if page is <1500 chars, it's the loader page (no video data)
        return null;
    } catch {
        return null;
    }
}

export class AnimeFLVSource extends BaseAnimeSource {
    name = 'AnimeFLV';
    baseUrl = 'https://www3.animeflv.net';

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
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
            'Referer': this.baseUrl
        };
    }

    async search(query: string, page: number = 1, _filters?: Record<string, unknown>, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        try {
            const response = await axios.get(`${this.baseUrl}/browse`, {
                params: { q: query, page },
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.ListAnimes .Anime').each((i, el) => {
                const title = $(el).find('.Title').text().trim();
                const href = $(el).find('a').attr('href') || '';
                const id = href.split('/anime/').pop() || '';
                const image = $(el).find('img').attr('src') || '';
                const type = $(el).find('.Type').text().trim();

                if (id && title) {
                    results.push({
                        id: `animeflv-${id}`,
                        title,
                        image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        description: '',
                        type: this.mapType(type),
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

            const hasNextPage = $('.pagination .active + li a').length > 0;

            return {
                results,
                totalPages: hasNextPage ? page + 1 : page,
                currentPage: page,
                hasNextPage,
                source: this.name
            };
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        try {
            const animeId = id.replace('animeflv-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${animeId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);

            const title = $('.Title').first().text().trim();
            const image = $('.AnimeCover img').attr('src') || '';
            const description = $('.Description').text().trim();
            const genres: string[] = [];
            $('.Nvgnrs a').each((i, el) => {
                genres.push($(el).text().trim());
            });

            const type = $('.Type').first().text().trim();
            const status = $('.AnmStts span').text().trim();

            return {
                id,
                title,
                image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                description,
                type: this.mapType(type),
                status: status.toLowerCase().includes('emision') ? 'Ongoing' : 'Completed',
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
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        try {
            const id = animeId.replace('animeflv-', '');
            const response = await axios.get(`${this.baseUrl}/anime/${id}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const episodes: Episode[] = [];

            // Extract episode info from script
            const scriptContent = $('script:contains("var episodes")').html() || '';
            const episodesMatch = scriptContent.match(/var episodes\s*=\s*(\[[\s\S]*?\]);/);
            if (episodesMatch) {
                try {
                    const epList: number[][] = JSON.parse(episodesMatch[1]);
                    epList.forEach((ep) => {
                        const epNum = ep[0];
                        episodes.push({
                            id: `animeflv-${id}-${epNum}`,
                            number: epNum,
                            title: `Episode ${epNum}`,
                            isFiller: false,
                            hasSub: true,
                            hasDub: false,
                            thumbnail: ''
                        });
                    });
                } catch {
                    // Parse failed
                }
            }

            // Fallback: scrape episode list
            if (episodes.length === 0) {
                $('.ListCaps li a, #episodeList a').each((i, el) => {
                    const href = $(el).attr('href') || '';
                    const epNum = parseInt(href.split('-').pop() || '0') || i + 1;
                    const rawEpId = href.split('/ver/').pop() || `${id}-${epNum}`;
                    episodes.push({
                        id: `animeflv-${rawEpId}`,
                        number: epNum,
                        title: `Episode ${epNum}`,
                        isFiller: false,
                        hasSub: true,
                        hasDub: false,
                        thumbnail: ''
                    });
                });
            }

            return episodes.sort((a, b) => a.number - b.number);
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        try {
            const epId = episodeId.replace('animeflv-', '');
            const response = await axios.get(`${this.baseUrl}/ver/${epId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const servers: EpisodeServer[] = [];

            $('.RTbl .Optns li').each((i, el) => {
                const serverName = $(el).find('.Stmvideo').text().trim();
                if (serverName) {
                    servers.push({ name: serverName, url: '', type: 'sub' });
                }
            });

            return servers.length > 0 ? servers : [{ name: 'Default', url: '', type: 'sub' }];
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [{ name: 'Default', url: '', type: 'sub' }];
        }
    }

    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        try {
            const epId = episodeId.replace('animeflv-', '');
            const response = await axios.get(`${this.baseUrl}/ver/${epId}`, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const sources: VideoSource[] = [];

            // Extract videos from script — format: var videos = {"SUB":[{"server":"sw","title":"SW","code":"https://..."},...]}
            const scriptContent = $('script:contains("var videos")').html() || '';
            const videosMatch = scriptContent.match(/var videos\s*=\s*(\{[\s\S]*?\});/);

            // Collect raw embed URLs from the page first
            interface RawEmbed { serverName: string; url: string }
            const rawEmbeds: RawEmbed[] = [];

            if (videosMatch) {
                try {
                    const videos = JSON.parse(videosMatch[1]);
                    const category_key = category === 'dub' ? 'LAT' : 'SUB';
                    const serverList = videos[category_key] || videos.SUB || [];
                    serverList.forEach((v: { server: string; code: string; title: string; url?: string }) => {
                        let url = '';
                        if (v.code.startsWith('http')) {
                            url = v.code;
                        } else {
                            const srcMatch = v.code.match(/src="([^"]+)"/);
                            if (srcMatch) url = srcMatch[1];
                        }
                        if (url) {
                            rawEmbeds.push({
                                serverName: (v.server || v.title || '').toLowerCase(),
                                url: url.startsWith('http') ? url : `https:${url}`,
                            });
                        }
                    });
                } catch {
                    // Parse failed
                }
            }

            // Fallback: extract iframe
            if (rawEmbeds.length === 0) {
                const iframeSrc = $('iframe').attr('src');
                if (iframeSrc) {
                    rawEmbeds.push({
                        serverName: 'iframe',
                        url: iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`,
                    });
                }
            }

            // Now resolve embed URLs to actual playable video URLs
            const extractionPromises = rawEmbeds.map(async (embed) => {
                const { serverName, url } = embed;
                try {
                    const hostname = new URL(url).hostname;

                    // Skip non-extractable embeds entirely
                    if (NON_EXTRACTABLE_EMBEDS.some(d => hostname.includes(d))) {
                        return null;
                    }

                    // Streamtape: extract direct video URL
                    if (hostname.includes('streamtape')) {
                        const directUrl = await extractStreamtapeUrl(url);
                        if (directUrl) {
                            return {
                                url: directUrl,
                                quality: 'auto',
                                isM3U8: false,
                                server: 'streamtape',
                            } as VideoSource;
                        }
                        return null;
                    }

                    // StreamWish: try to extract m3u8 (may fail if page is JS-only loader)
                    if (hostname.includes('streamwish') || hostname.includes('sfastwish') || hostname.includes('filelions') || hostname.includes('swdyu')) {
                        const directUrl = await extractStreamwishUrl(url);
                        if (directUrl) {
                            return {
                                url: directUrl,
                                quality: 'auto',
                                isM3U8: directUrl.includes('.m3u8'),
                                server: 'streamwish',
                            } as VideoSource;
                        }
                        return null; // JS-only loader, can't extract
                    }

                    // For unknown embeds: if URL points to a direct video file, keep it
                    if (url.includes('.m3u8') || url.includes('.mp4')) {
                        return {
                            url,
                            quality: 'auto',
                            isM3U8: url.includes('.m3u8'),
                        } as VideoSource;
                    }

                    // Unknown embed — skip (don't return HTML pages as video sources)
                    return null;
                } catch {
                    return null;
                }
            });

            const extractedResults = await Promise.allSettled(extractionPromises);
            for (const result of extractedResults) {
                if (result.status === 'fulfilled' && result.value) {
                    sources.push(result.value);
                }
            }

            return { sources, subtitles: [], headers: { 'Referer': this.baseUrl } };
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.ListAnimes .Anime').slice(0, 20).each((i, el) => {
                const title = $(el).find('.Title').text().trim();
                const href = $(el).find('a').attr('href') || '';
                const id = href.split('/anime/').pop() || '';
                const image = $(el).find('img').attr('src') || '';

                if (id && title) {
                    results.push({
                        id: `animeflv-${id}`,
                        title,
                        image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
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
        } catch (error) {
            this.handleError(error, 'getTrending');
            return [];
        }
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await axios.get(this.baseUrl, {
                signal: options?.signal,
                timeout: options?.timeout || 10000,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results: AnimeBase[] = [];

            $('.ListEpisodios li').each((i, el) => {
                const title = $(el).find('.Title').text().trim();
                const href = $(el).find('a').attr('href') || '';
                const epId = href.split('/ver/').pop() || '';
                const animeId = epId.replace(/-\d+$/, '');
                const image = $(el).find('img').attr('src') || '';

                if (animeId && title) {
                    results.push({
                        id: `animeflv-${animeId}`,
                        title: title.replace(/\s*-\s*\d+$/, ''),
                        image: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
                        cover: image.startsWith('http') ? image : `${this.baseUrl}${image}`,
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

    private mapType(type: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = type.toLowerCase();
        if (t.includes('película') || t.includes('movie')) return 'Movie';
        if (t.includes('ova')) return 'OVA';
        if (t.includes('ona')) return 'ONA';
        if (t.includes('especial') || t.includes('special')) return 'Special';
        return 'TV';
    }
}
