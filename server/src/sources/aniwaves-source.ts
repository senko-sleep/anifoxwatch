import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import { BaseAnimeSource, SourceRequestOptions } from './base-source.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime } from '../types/anime.js';
import { StreamingData, VideoSource, EpisodeServer } from '../types/streaming.js';
import { logger } from '../utils/logger.js';
import { streamExtractor } from '../services/stream-extractor.js';

/**
 * Aniwaves Source - Web scraper for aniwaves.ru
 * Features:
 * - Direct metadata scraping via AJAX
 * - Episode list and server extraction
 * - Stream resolution via EchoVideo embed extraction
 * - Parallel transport racing: fires direct + all proxies simultaneously,
 *   resolves on the first success — eliminates sequential fallback latency.
 * - Connection winner cache: remembers which transport won per URL prefix
 *   so subsequent requests skip the race and go straight to the winner.
 */
export class AniwavesSource extends BaseAnimeSource {
    name = 'Aniwaves';
    baseUrl = 'https://aniwaves.ru';
    private client: AxiosInstance;

    // Smart caching with TTL
    private cache: Map<string, { data: any; expires: number }> = new Map();
    private cacheTTL = {
        search: 5 * 60 * 1000,
        anime: 30 * 60 * 1000,
        episodes: 30 * 60 * 1000,
        stream: 6 * 60 * 60 * 1000,    // 6h — streams don't rotate that fast
        servers: 4 * 60 * 60 * 1000,   // 4h — server lists are stable
    };

    // ─── Connection winner cache ────────────────────────────────────────────
    // Stores which transport (index: 0 = direct, 1-3 = proxy) succeeded last.
    // Key = URL path prefix (first 2 segments), Value = transport index.
    // This lets repeat requests skip the race entirely and hit the winner first.
    private transportWinner: Map<string, number> = new Map();
    private readonly TRANSPORT_WINNER_TTL = 10 * 60 * 1000; // 10 minutes
    private transportWinnerExpiry: Map<string, number> = new Map();
    private transportFailureCount: Map<string, number> = new Map(); // Track consecutive failures per winner

    // Proxy list (stable — update here if proxies change)
    private readonly PROXIES = [
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    ];

    constructor() {
        super();
        // Reusable HTTPS agent — keeps TCP connections alive between requests
        // to avoid the ~200ms handshake overhead on every API call.
        const keepAliveAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 15,
            timeout: 60000, // Increased from 30s to 60s for Vercel
        });
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 45000,           // Increased from 15s to 45s for Vercel cold starts
            httpsAgent: keepAliveAgent,
            headers: {
                'Accept': 'application/json, text/html',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
    }

    // ─── Transport winner helpers ───────────────────────────────────────────

    private getWinnerKey(urlPath: string): string {
        // Key on the first 2 path segments e.g. "/ajax/episode" from "/ajax/episode/list/1234"
        const parts = urlPath.split('/').filter(Boolean).slice(0, 2);
        return parts.join('/');
    }

    private getCachedWinner(urlPath: string): number | null {
        const key = this.getWinnerKey(urlPath);
        const expiry = this.transportWinnerExpiry.get(key);
        if (!expiry || Date.now() > expiry) {
            this.transportWinner.delete(key);
            this.transportWinnerExpiry.delete(key);
            return null;
        }
        const winner = this.transportWinner.get(key);
        return winner !== undefined ? winner : null;
    }

    private setCachedWinner(urlPath: string, transportIndex: number): void {
        const key = this.getWinnerKey(urlPath);
        this.transportWinner.set(key, transportIndex);
        this.transportWinnerExpiry.set(key, Date.now() + this.TRANSPORT_WINNER_TTL);
        this.transportFailureCount.delete(key); // Reset failure count on success
    }

    private recordTransportFailure(urlPath: string): void {
        const key = this.getWinnerKey(urlPath);
        const currentFailures = this.transportFailureCount.get(key) || 0;
        this.transportFailureCount.set(key, currentFailures + 1);
        
        // If a cached winner fails 3+ times, evict it immediately
        if (currentFailures >= 2) {
            this.transportWinner.delete(key);
            this.transportWinnerExpiry.delete(key);
            this.transportFailureCount.delete(key);
            logger.warn(`[Aniwaves] Evicted corrupted transport winner for ${urlPath} after ${currentFailures + 1} failures`, undefined, this.name);
        }
    }

    // ─── Parallel fetch with winner cache ──────────────────────────────────

    private async fetchWithProxyFallback(urlPath: string, config: any = {}): Promise<any> {
        const fullUrl = (() => {
            let u = `${this.baseUrl}${urlPath}`;
            if (config.params) {
                const searchParams = new URLSearchParams(config.params);
                u += `?${searchParams.toString()}`;
            }
            return u;
        })();

        // Build all transports: [0] = direct, [1..N] = proxies
        const buildTransport = (index: number, signal?: AbortSignal): Promise<any> => {
            if (index === 0) {
                // Direct request
                return this.client.get(urlPath, {
                    ...config,
                    signal: signal ?? config.signal,
                    timeout: config.timeout ?? 7000,
                });
            }
            // Proxy request
            const proxyUrl = this.PROXIES[index - 1](fullUrl);
            return axios.get(proxyUrl, {
                signal: signal ?? config.signal,
                timeout: 4000, // tight per-proxy budget — we race anyway
            });
        };

        // Check if we have a winner cached for this path prefix
        const cachedWinner = this.getCachedWinner(urlPath);

        if (cachedWinner !== null) {
            // Try the known winner first — if it fails, fall through to full race
            try {
                const response = await buildTransport(cachedWinner);
                return response;
            } catch {
                // Record failure and potentially evict
                this.recordTransportFailure(urlPath);
                // Evict and run a full race below
                const key = this.getWinnerKey(urlPath);
                this.transportWinner.delete(key);
                this.transportWinnerExpiry.delete(key);
                logger.warn(`[Aniwaves] Cached transport #${cachedWinner} failed for ${urlPath} — running full race`, undefined, this.name);
            }
        }

        // ── Full parallel race: fire all transports simultaneously ──────────
        // AbortController lets us cancel the losers once a winner resolves.
        const raceController = new AbortController();
        const parentSignal = config.signal as AbortSignal | undefined;

        // Forward parent abort to race controller
        parentSignal?.addEventListener('abort', () => raceController.abort(), { once: true });

        const transportCount = 1 + this.PROXIES.length; // direct + proxies

        const racePromises = Array.from({ length: transportCount }, (_, i) =>
            buildTransport(i, raceController.signal)
                .then(response => ({ response, index: i }))
                .catch(() => null) // individual failures return null; Promise.any filters them
        );

        try {
            // Promise.any resolves on the first non-null success
            const winner = await Promise.any(
                racePromises.map(p =>
                    p.then(result => {
                        if (!result) throw new Error('transport failed');
                        return result;
                    })
                )
            );

            // Cancel remaining in-flight requests
            raceController.abort();

            // Cache this transport as the winner for this path prefix
            this.setCachedWinner(urlPath, winner.index);

            const label = winner.index === 0 ? 'direct' : `proxy[${winner.index}]`;
            logger.info(`[Aniwaves] Race winner: ${label} for ${urlPath}`, undefined, this.name);

            return winner.response;
        } catch {
            // All transports failed
            throw new Error(`[Aniwaves] All transports failed for ${urlPath}`);
        }
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

    private setCache(key: string, data: any, ttl: number): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    // ============ DATA MAPPING ============

    private mapAnimeFromSearch(html: string): AnimeBase[] {
        const $ = cheerio.load(html);
        const results: AnimeBase[] = [];

        $('.item').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href') || '';
            const id = href.split('/watch/')[1]?.split('?')[0] || '';
            const title = $el.find('.name').text().trim();
            const image = $el.find('img').attr('src') || '';
            const meta = $el.find('.meta').text().trim();
            
            const typeMatch = meta.match(/(TV|Movie|OVA|ONA|Special)/i);
            const type = typeMatch ? typeMatch[1] as any : 'TV';

            results.push({
                id: `aniwaves-${id}`,
                title,
                image,
                cover: image,
                description: '',
                type: type,
                status: 'Ongoing',
                episodes: 0,
                episodesAired: 0,
                genres: [],
                studios: [],
                year: 0,
                subCount: 0,
                dubCount: 0,
                source: this.name,
                isMature: false
            });
        });

        return results;
    }

    // ============ API METHODS ============

    async healthCheck(options?: SourceRequestOptions): Promise<boolean> {
        try {
            const response = await this.fetchWithProxyFallback('/', {
                timeout: 25000,
                signal: options?.signal
            });
            this.isAvailable = response.status === 200;
            return this.isAvailable;
        } catch {
            return false;
        }
    }

    async search(query: string, page: number = 1, filters?: any, options?: SourceRequestOptions): Promise<AnimeSearchResult> {
        const cacheKey = `search:${query}:${page}`;
        const cached = this.getCached<AnimeSearchResult>(cacheKey);
        if (cached) return cached;

        try {
            const response = await this.fetchWithProxyFallback('/ajax/anime/search', {
                params: { keyword: query },
                signal: options?.signal
            });

            if (response.data?.status !== 200 || !response.data?.result?.html) {
                return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
            }

            const results = this.mapAnimeFromSearch(response.data.result.html);
            const result: AnimeSearchResult = {
                results,
                totalPages: 1,
                currentPage: page,
                hasNextPage: false,
                source: this.name
            };

            this.setCache(cacheKey, result, this.cacheTTL.search);
            return result;
        } catch (error) {
            this.handleError(error, 'search');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: this.name };
        }
    }

    async getAnime(id: string, options?: SourceRequestOptions): Promise<AnimeBase | null> {
        const cacheKey = `anime:${id}`;
        const cached = this.getCached<AnimeBase>(cacheKey);
        if (cached) return cached;

        const slug = id.replace('aniwaves-', '');

        // Fire episode list prefetch concurrently with the anime page fetch
        // so by the time getEpisodes() is called the data is already in cache.
        const numericId = slug.split('-').pop() || '';
        const episodeCacheKey = `episodes:${id}`;
        const episodesCached = this.getCached<Episode[]>(episodeCacheKey);
        if (!episodesCached && numericId) {
            // Fire-and-forget — don't await; errors are silently ignored
            this.fetchWithProxyFallback(`/ajax/episode/list/${numericId}`, { signal: options?.signal })
                .then(resp => {
                    if (resp.data?.status === 200 && resp.data?.result) {
                        const $ = cheerio.load(resp.data.result);
                        const episodes: Episode[] = [];
                        $('.episodes.number li a').each((_, el) => {
                            const $el = $(el);
                            const epId = $el.attr('data-ids') || '';
                            const num = parseInt($el.attr('data-num') || '0');
                            const title = $el.attr('title') || `Episode ${num}`;
                            if (epId && num > 0) {
                                episodes.push({
                                    id: `aniwaves-${epId}`,
                                    number: num,
                                    title,
                                    isFiller: false,
                                    hasSub: $el.attr('data-sub') === '1',
                                    hasDub: $el.attr('data-dub') === '1'
                                });
                            }
                        });
                        if (episodes.length > 0) {
                            this.setCache(episodeCacheKey, episodes, this.cacheTTL.episodes);
                            logger.info(`[Aniwaves] Prefetched ${episodes.length} episodes for ${id}`, undefined, this.name);
                        }
                    }
                })
                .catch(() => { /* ignore prefetch errors */ });
        }

        try {
            const response = await this.fetchWithProxyFallback(`/watch/${slug}`, {
                signal: options?.signal,
                headers: { 'Accept': 'text/html', 'X-Requested-With': undefined }
            });

            const $ = cheerio.load(response.data);
            const title = $('h1, .name').first().text().trim() || slug;
            const image = $('meta[property="og:image"]').attr('content') || '';
            const description = $('meta[property="og:description"]').attr('content') || '';
            const genres: string[] = [];
            $('a[href*="/tags/"]').each((_, el) => {
                genres.push($(el).text().trim());
            });

            const anime: AnimeBase = {
                id,
                title,
                image,
                cover: image,
                description,
                type: 'TV',
                status: 'Ongoing',
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

            this.setCache(cacheKey, anime, this.cacheTTL.anime);
            return anime;
        } catch (error) {
            this.handleError(error, 'getAnime');
            return null;
        }
    }

    async getEpisodes(animeId: string, options?: SourceRequestOptions): Promise<Episode[]> {
        const cacheKey = `episodes:${animeId}`;
        const cached = this.getCached<Episode[]>(cacheKey);
        if (cached) return cached;

        const id = animeId.replace('aniwaves-', '').split('-').pop() || '';
        try {
            const response = await this.fetchWithProxyFallback(`/ajax/episode/list/${id}`, {
                signal: options?.signal
            });

            if (response.data?.status !== 200 || !response.data?.result) {
                return [];
            }

            const $ = cheerio.load(response.data.result);
            const episodes: Episode[] = [];

            $('.episodes.number li a').each((_, el) => {
                const $el = $(el);
                const epId = $el.attr('data-ids') || '';
                const num = parseInt($el.attr('data-num') || '0');
                const title = $el.attr('title') || `Episode ${num}`;

                if (epId && num > 0) {
                    episodes.push({
                        id: `aniwaves-${epId}`,
                        number: num,
                        title,
                        isFiller: false,
                        hasSub: $el.attr('data-sub') === '1',
                        hasDub: $el.attr('data-dub') === '1'
                    });
                }
            });

            this.setCache(cacheKey, episodes, this.cacheTTL.episodes);
            return episodes;
        } catch (error) {
            this.handleError(error, 'getEpisodes');
            return [];
        }
    }

    async getEpisodeServers(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]> {
        const cacheKey = `servers:${episodeId}`;
        const cached = this.getCached<EpisodeServer[]>(cacheKey);
        if (cached) return cached;

        const epParams = episodeId.replace('aniwaves-', '');
        let id = '';
        let eps = '';

        if (epParams.includes('&eps=')) {
            const parts = epParams.split('&eps=');
            id = parts[0];
            eps = parts[1];
        } else if (epParams.includes('?ep=')) {
            const parts = epParams.split('?ep=');
            id = parts[0];
            eps = parts[1];
        } else if (epParams.includes('/ep-')) {
            const parts = epParams.split('/ep-');
            id = parts[0];
            eps = parts[1];
        } else {
            id = epParams;
            eps = '1';
        }

        const numericId = id.split('-').pop() || '';

        try {
            const response = await this.fetchWithProxyFallback('/ajax/server/list', {
                params: { servers: numericId, eps: eps },
                signal: options?.signal
            });

            if (response.data?.status !== 200 || !response.data?.result) {
                return [];
            }

            const $ = cheerio.load(response.data.result);
            const servers: EpisodeServer[] = [];

            $('.type').each((_, typeEl) => {
                const $typeEl = $(typeEl);
                const type = $typeEl.attr('data-type') as 'sub' | 'dub';
                
                $typeEl.find('li').each((_, liEl) => {
                    const $liEl = $(liEl);
                    const name = $liEl.text().trim();
                    const linkId = $liEl.attr('data-link-id') || '';
                    
                    if (linkId) {
                        servers.push({
                            name,
                            url: linkId,
                            type: type || 'sub'
                        });
                    }
                });
            });

            this.setCache(cacheKey, servers, this.cacheTTL.servers);
            return servers;
        } catch (error) {
            this.handleError(error, 'getEpisodeServers');
            return [];
        }
    }

    async getStreamingLinks(episodeId: string, serverId?: string, category: 'sub' | 'dub' = 'sub', options?: SourceRequestOptions): Promise<StreamingData> {
        // Bare AniList IDs (anilist-189046) are not Aniwaves internal IDs.
        // The old code would do id.split('-').pop() → '189046' and call
        // /ajax/server/list?servers=189046 which always returns 0 results.
        // Cross-source fallback will handle these via title search instead.
        if (episodeId.startsWith('anilist-') && !episodeId.startsWith('aniwaves-')) {
            return { sources: [], subtitles: [] };
        }

        const cacheKey = `stream:${episodeId}:${serverId || 'default'}:${category}`;
        const cached = this.getCached<StreamingData>(cacheKey);
        if (cached) return cached;

        try {
            let targetServerId = '';
            let resolvedCategory: 'sub' | 'dub' = category;

            // If serverId is provided and looks like a direct link ID, use it directly to skip servers fetch
            if (serverId && !serverId.includes(' ') && serverId.length > 30) {
                targetServerId = serverId;
                resolvedCategory = category;
            } else {
                const servers = await this.getEpisodeServers(episodeId, options);
                const filtered = servers.filter(s => s.type === category);
                
                if (serverId) {
                    const match = filtered.find(s => 
                        s.name.toLowerCase() === serverId.toLowerCase() || 
                        s.url === serverId
                    );
                    if (match) {
                        targetServerId = match.url;
                        resolvedCategory = match.type === 'dub' ? 'dub' : 'sub';
                    }
                }
                
                if (!targetServerId) {
                    const best = filtered.length > 0 ? filtered[0] : (servers.length > 0 ? servers[0] : null);
                    if (!best) return { sources: [], subtitles: [] };
                    targetServerId = best.url;
                    resolvedCategory = best.type === 'dub' ? 'dub' : 'sub';
                }
            }

            // Step 1: Get the embed URL
            const response = await this.fetchWithProxyFallback('/ajax/sources', {
                params: { id: targetServerId },
                signal: options?.signal
            });

            if (response.data?.status !== 200 || !response.data?.result?.url) {
                return { sources: [], subtitles: [] };
            }

            const embedUrl = response.data.result.url;
            logger.info(`[Aniwaves] Found embed URL: ${embedUrl}. Extracting direct stream links...`, undefined, this.name);

            let extractedSources: VideoSource[] = [];
            let extractedSubtitles: any[] = [];
            let origin = this.baseUrl;
            try {
                const extraction = await streamExtractor.extractFromEmbed(embedUrl);
                if (extraction.success && extraction.streams.length > 0) {
                    extractedSources = extraction.streams
                        .filter(s => {
                            const u = s.url.toLowerCase();
                            return !u.includes('ping.gif') && !u.includes('analytics') && !u.includes('jwplayer') && !u.includes('/ping');
                        })
                        .map(s => ({
                            url: s.url,
                            quality: (s.quality || 'auto') as '360p' | '480p' | '720p' | '1080p' | 'auto' | 'default',
                            isM3U8: s.url.includes('.m3u8') || s.type === 'hls',
                            isEmbed: false,
                            isDirect: false,
                            server: serverId || 'Aniwaves',
                        }));
                    extractedSubtitles = extraction.subtitles || [];
                    try {
                        origin = new URL(embedUrl).origin;
                    } catch {
                        origin = this.baseUrl;
                    }
                    logger.info(`[Aniwaves] Successfully extracted ${extractedSources.length} streams`, undefined, this.name);
                } else {
                    logger.warn(`[Aniwaves] Stream extraction failed: ${extraction.error || 'No streams found'}. Falling back to embed URL`, undefined, this.name);
                }
            } catch (extError: any) {
                logger.error(`[Aniwaves] Error extracting streams: ${extError.message}`, extError, undefined, this.name);
            }

            // Aniwaves' embed URL is domain-locked — it only renders on aniwaves.ru
            // and authorized domains, so loading it in our iframe yields:
            //   "Embedding blocked on this site"
            // Never return it as an isEmbed fallback. Instead, return no sources so the
            // caller fails over to another source / the sub fallback instead of a broken
            // embed that the browser cannot load.
            if (extractedSources.length === 0) {
                logger.warn(`[Aniwaves] No direct streams extracted for ${embedUrl} — returning empty (no domain-locked embed fallback)`, undefined, this.name);
                return { sources: [], subtitles: [] };
            }

            const streamData: StreamingData = {
                sources: extractedSources,
                subtitles: extractedSubtitles,
                headers: {
                    'Referer': origin,
                    'Origin': origin,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                },
                source: this.name,
                category: resolvedCategory,
                dubFallback: category === 'dub' && resolvedCategory === 'sub'
            };

            this.setCache(cacheKey, streamData, this.cacheTTL.stream);
            this.handleSuccess();
            return streamData;
        } catch (error) {
            this.handleError(error, 'getStreamingLinks');
            return { sources: [], subtitles: [] };
        }
    }

    async getTrending(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        // Fallback to recent search for now as there's no direct trending AJAX
        return [];
    }

    async getLatest(page: number = 1, options?: SourceRequestOptions): Promise<AnimeBase[]> {
        return [];
    }

    async getTopRated(page: number = 1, limit: number = 10, options?: SourceRequestOptions): Promise<TopAnime[]> {
        return [];
    }
}
