/**
 * Cloudflare HiAnime Source - Direct scraping with native fetch
 * This source uses native fetch API which works in Cloudflare Workers
 * No Node.js dependencies (puppeteer/axios) required
 */

import { BaseAnimeSource, GenreAwareSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';

export class CloudflareHiAnimeSource extends BaseAnimeSource implements GenreAwareSource {
    name = 'CloudflareHiAnime';
    baseUrl = 'https://hianime.to';

    // Cache for performance
    private cache: Map<string, { data: unknown; expires: number }> = new Map();
    private cacheTTL = {
        home: 5 * 60 * 1000,        // 5 min
        search: 3 * 60 * 1000,      // 3 min
        anime: 15 * 60 * 1000,      // 15 min
        episodes: 10 * 60 * 1000,    // 10 min
        stream: 2 * 60 * 60 * 1000,  // 2 hours
        servers: 60 * 60 * 1000,     // 1 hour
    };

    constructor() {
        super();
    }

    // ============ CACHING ============

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && entry.expires > Date.now()) {
            return entry.data as T;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: unknown, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    // ============ NATIVE FETCH API ============

    private async fetchWithRetry(url: string, options: RequestInit = {}, retries: number = 3): Promise<Response> {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            ...options.headers,
        };

        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers,
                });
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
        throw new Error('Max retries exceeded');
    }

    // ============ DATA MAPPING ============

    private mapAnime(data: any): AnimeBase {
        return {
            id: `cfhianime-${data.id}`,
            title: data.name || data.title || 'Unknown',
            titleJapanese: data.jname,
            image: data.poster || data.image || '',
            cover: data.poster || data.image,
            description: data.description?.replace(/<[^>]*>/g, '').trim() || 'No description available.',
            type: this.mapType(data.type),
            status: this.mapStatus(data.status),
            rating: data.rating ? parseFloat(data.rating) : undefined,
            episodes: data.episodes?.sub || data.totalEpisodes || 0,
            episodesAired: data.episodes?.sub || 0,
            duration: data.duration || '24m',
            genres: data.genres || [],
            studios: [],
            subCount: data.episodes?.sub || 0,
            dubCount: data.episodes?.dub || 0,
            source: this.name
        };
    }

    private mapType(type?: string): 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special' {
        const t = (type || '').toUpperCase();
        if (t.includes('MOVIE')) return 'Movie';
        if (t.includes('OVA')) return 'OVA';
        if (t.includes('ONA')) return 'ONA';
        if (t.includes('SPECIAL')) return 'Special';
        return 'TV';
    }

    private mapStatus(status?: string): 'Ongoing' | 'Completed' | 'Upcoming' {
        const s = (status || '').toLowerCase();
        if (s.includes('ongoing') || s.includes('airing')) return 'Ongoing';
        if (s.includes('upcoming')) return 'Upcoming';
        return 'Completed';
    }

    private normalizeQuality(quality: string): VideoSource['quality'] {
        if (!quality) return 'auto';
        const q = quality.toLowerCase();
        if (q.includes('1080') || q.includes('fhd')) return '1080p';
        if (q.includes('720') || q.includes('hd')) return '720p';
        if (q.includes('480') || q.includes('sd')) return '480p';
        if (q.includes('360')) return '360p';
        return 'auto';
    }

    // ============ API METHODS ============

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.fetchWithRetry(this.baseUrl);
            return response.ok;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, _filters?: any, _options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            // Try to fetch search page
            const searchUrl = `${this.baseUrl}/search?keyword=${encodeURIComponent(query)}&page=${page}`;
            const response = await this.fetchWithRetry(searchUrl);

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const html = await response.text();

            // Parse anime items from HTML
            const animeItems = this.parseSearchResults(html);

            const result: AnimeSearchResult = {
                results: animeItems,
                totalPages: Math.ceil(animeItems.length / 24) || 1,
                currentPage: page,
                hasNextPage: animeItems.length >= 24,
                source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            logger.warn('Search failed', { query, error }, this.name);
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    private parseSearchResults(html: string): AnimeBase[] {
        const animes: AnimeBase[] = [];

        // Look for anime data in script tags or JSON
        const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
            try {
                const data = JSON.parse(scriptMatch[1]);
                const props = data?.props?.pageProps;
                if (props?.searchData?.animes) {
                    return props.searchData.animes.map((a: any) => this.mapAnime(a));
                }
            } catch (e) {
                // Continue with HTML parsing
            }
        }

        // Fallback: look for common patterns in HTML
        const animeCardRegex = /<a[^>]*href="\/anime\/([^"]+)"[^>]*class="[^"]*film-poster[^"]*"[^>]*>/g;
        let match;
        const seenIds = new Set<string>();

        while ((match = animeCardRegex.exec(html)) !== null) {
            const id = match[1];
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            animes.push({
                id: `cfhianime-${id}`,
                title: id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                image: '',
                cover: '',
                description: '',
                type: 'TV',
                status: 'Completed',
                episodes: 0,
                episodesAired: 0,
                genres: [],
                studios: [],
                source: this.name
            });
        }

        return animes;
    }

    async getAnime(id: string, _options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const animeId = id.replace('cfhianime-', '');
        const cacheKey = `anime:${animeId}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/anime/${animeId}`);

            if (!response.ok) {
                return null;
            }

            const html = await response.text();
            const anime = this.parseAnimeDetails(html, animeId);

            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error) {
            logger.warn('Failed to get anime', { id, error }, this.name);
            return null;
        }
    }

    private parseAnimeDetails(html: string, animeId: string): AnimeBase {
        // Try to extract from Next.js data
        const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
            try {
                const data = JSON.parse(scriptMatch[1]);
                const props = data?.props?.pageProps;
                if (props?.animeInfo) {
                    return this.mapAnime({
                        id: animeId,
                        ...props.animeInfo
                    });
                }
                if (props?.data?.anime) {
                    return this.mapAnime({
                        id: animeId,
                        ...props.data.anime
                    });
                }
            } catch (e) {
                // Continue with HTML parsing
            }
        }

        // Fallback: return basic info
        return {
            id: `cfhianime-${animeId}`,
            title: animeId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            image: '',
            cover: '',
            description: 'Could not fetch description',
            type: 'TV',
            status: 'Completed',
            episodes: 0,
            episodesAired: 0,
            genres: [],
            studios: [],
            source: this.name
        };
    }

    async getEpisodes(animeId: string, _options?: SourceRequestOptions): Promise<Episode[]> {
        const id = animeId.replace('cfhianime-', '');
        const cacheKey = `episodes:${id}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/anime/${id}`);

            if (!response.ok) {
                return [];
            }

            const html = await response.text();
            const episodes = this.parseEpisodes(html, id);

            this.setCache(cacheKey, episodes, this.cacheTTL.episodes);
            return episodes;
        } catch (error) {
            logger.warn('Failed to get episodes', { animeId, error }, this.name);
            return [];
        }
    }

    private parseEpisodes(html: string, animeId: string): Episode[] {
        const episodes: Episode[] = [];

        // Try to extract from Next.js data
        const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
            try {
                const data = JSON.parse(scriptMatch[1]);
                const props = data?.props?.pageProps;
                if (props?.episodes) {
                    return props.episodes.map((ep: any, index: number) => ({
                        id: ep.id || `${animeId}?ep=${ep.number || index + 1}`,
                        number: ep.number || index + 1,
                        title: ep.title || `Episode ${ep.number || index + 1}`,
                        isFiller: ep.isFiller || false,
                        hasSub: true,
                        hasDub: true,
                        thumbnail: ep.image
                    }));
                }
                if (props?.animeInfo?.episodes) {
                    return props.animeInfo.episodes.map((ep: any, index: number) => ({
                        id: ep.id || `${animeId}?ep=${index + 1}`,
                        number: ep.number || index + 1,
                        title: ep.title || `Episode ${index + 1}`,
                        isFiller: ep.isFiller || false,
                        hasSub: true,
                        hasDub: ep.hasDub || false,
                        thumbnail: ep.image
                    }));
                }
            } catch (e) {
                // Continue with HTML parsing
            }
        }

        // Fallback: try to find episode list in HTML
        const episodeItemsMatch = html.match(/<li[^>]*class="[^"]*episode-[^"]*"[^>]*>([\s\S]*?)<\/li>/g);
        if (episodeItemsMatch) {
            let index = 0;
            for (const item of episodeItemsMatch.slice(0, 500)) {
                index++;
                const numberMatch = item.match(/data-number=["']?(\d+)["']?/);
                const titleMatch = item.match(/title="([^"]+)"/);

                episodes.push({
                    id: `${animeId}?ep=${numberMatch ? numberMatch[1] : index}`,
                    number: numberMatch ? parseInt(numberMatch[1]) : index,
                    title: titleMatch ? titleMatch[1] : `Episode ${index}`,
                    isFiller: false,
                    hasSub: true,
                    hasDub: true,
                    thumbnail: undefined
                });
            }
        }

        return episodes;
    }

    async getEpisodeServers(_episodeId: string, _options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        // Direct scraping doesn't easily expose server names
        // Return default servers
        return [
            { name: 'hd-2', url: '', type: 'sub' },
            { name: 'hd-1', url: '', type: 'sub' },
            { name: 'hd-3', url: '', type: 'sub' }
        ];
    }

    async getStreamingLinks(episodeId: string, server: string = 'hd-2', category: 'sub' | 'dub' = 'sub', _options?: SourceRequestOptions): Promise<StreamingData> {
        const cacheKey = `stream:${episodeId}:${server}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            // For direct scraping, we need to fetch the episode page
            // The episode ID format is typically: anime-id?ep=number
            const response = await this.fetchWithRetry(`${this.baseUrl}/watch/${episodeId}`);

            if (!response.ok) {
                return { sources: [], subtitles: [] };
            }

            const html = await response.text();
            const streamData = this.parseStreamingLinks(html, episodeId);

            if (streamData.sources.length > 0) {
                this.setCache(cacheKey, streamData, this.cacheTTL.stream);
            }

            return streamData;
        } catch (error) {
            logger.warn('Failed to get streaming links', { episodeId, error }, this.name);
            return { sources: [], subtitles: [] };
        }
    }

    private parseStreamingLinks(html: string, episodeId: string): StreamingData {
        // Try to extract stream URLs from the page
        const sources: VideoSource[] = [];

        // Look for m3u8 URLs
        const m3u8Matches = html.match(/["']([^"']*\.m3u8[^"']*)["']/g);
        if (m3u8Matches) {
            for (const match of m3u8Matches) {
                const url = match.replace(/["']/g, '');
                if (!sources.find(s => s.url === url)) {
                    sources.push({
                        url,
                        quality: 'auto',
                        isM3U8: true
                    });
                }
            }
        }

        // Look for mp4 URLs
        const mp4Matches = html.match(/["']([^"']*\.mp4[^"']*)["']/g);
        if (mp4Matches) {
            for (const match of mp4Matches) {
                const url = match.replace(/["']/g, '');
                if (!sources.find(s => s.url === url)) {
                    sources.push({
                        url,
                        quality: 'auto',
                        isM3U8: false
                    });
                }
            }
        }

        // Look for embedded player URLs
        const embedMatches = html.match(/data-src=["']([^"']*)["']/);
        if (embedMatches && sources.length === 0) {
            // Try to fetch the embed URL
            const embedUrl = embedMatches[1];
            // This would require another fetch, but for simplicity we return what we have
            sources.push({
                url: embedUrl,
                quality: 'auto',
                isM3U8: embedUrl.includes('.m3u8')
            });
        }

        // Try to extract from Next.js data
        const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch && sources.length === 0) {
            try {
                const data = JSON.parse(scriptMatch[1]);
                const props = data?.props?.pageProps;

                // Look for episode sources in the data
                if (props?.episodeSources || props?.streamingLinks || props?.sources) {
                    const srcList = props.episodeSources || props.streamingLinks || props.sources;
                    for (const src of srcList) {
                        sources.push({
                            url: src.url || src.link || src.streamUrl,
                            quality: this.normalizeQuality(src.quality || src.label || 'auto'),
                            isM3U8: (src.url || src.link || '').includes('.m3u8')
                        });
                    }
                }
            } catch (e) {
                // Continue with other parsing methods
            }
        }

        // Sort by quality
        if (sources.length > 1) {
            sources.sort((a, b) => {
                const order: Record<string, number> = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, 'auto': 4 };
                return (order[a.quality] || 5) - (order[b.quality] || 5);
            });
        }

        return {
            sources,
            subtitles: [],
            source: this.name
        };
    }

    async getTrending(_page: number = 1, _options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/trending`);
            if (!response.ok) return [];

            const html = await response.text();
            return this.parseTrending(html);
        } catch {
            return [];
        }
    }

    private parseTrending(html: string): AnimeBase[] {
        const animes: AnimeBase[] = [];

        const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
            try {
                const data = JSON.parse(scriptMatch[1]);
                const props = data?.props?.pageProps;
                if (props?.trendingAnimes || props?.homeData?.trending) {
                    const list = props.trendingAnimes || props.homeData.trending;
                    return list.map((a: any) => this.mapAnime(a));
                }
            } catch (e) {
                // Fall through to empty array
            }
        }

        return animes;
    }

    async getLatest(_page: number = 1, _options?: SourceRequestOptions): Promise<AnimeBase[]> {
        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/recently-updated`);
            if (!response.ok) return [];

            const html = await response.text();
            return this.parseLatest(html);
        } catch {
            return [];
        }
    }

    private parseLatest(html: string): AnimeBase[] {
        const animes: AnimeBase[] = [];

        const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
            try {
                const data = JSON.parse(scriptMatch[1]);
                const props = data?.props?.pageProps;
                if (props?.latestEpisodes || props?.recentEpisodes || props?.homeData?.latest) {
                    const list = props.latestEpisodes || props.recentEpisodes || props.homeData.latest;
                    return list.map((a: any) => this.mapAnime(a));
                }
            } catch (e) {
                // Fall through to empty array
            }
        }

        return animes;
    }
}
