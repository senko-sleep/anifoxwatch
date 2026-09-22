import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import fs from 'node:fs';
import path from 'node:path';
import { BaseAnimeSource, SourceRequestOptions, isValidAnimeTitle } from './base-source.js';
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
/** Where the provider preferences live between restarts. */
const SERVER_SCORE_FILE = '.cache/aniwaves-servers.json';

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

    // ─── Server health memory ───────────────────────────────────────────────
    // Aniwaves lists the same handful of embed providers for every episode, and they fail as a
    // provider rather than per episode: when DatSaV is serving stub pages it serves them for
    // everything. Measured on One Piece ep1, all eight servers, extraction end to end:
    //
    //   DatSaV   0 streams  16320ms      Vidplay  2 streams   6975ms
    //   BYFMS    0 streams  14756ms      MyCloud  2 streams   7127ms
    //   DGHG     0 streams  15563ms
    //
    // Picking the list's first entry meant always picking DatSaV, burning 16s in Chromium and
    // returning nothing, while two working providers sat further down the same list. So the
    // outcome per provider is remembered and used to order the next attempt.
    private serverScore: Map<string, { ok: number; fail: number; at: number }> = new Map();
    private readonly SERVER_MEMORY_TTL = 30 * 60 * 1000;
    /** Providers to try before giving up. Each failure costs a Chromium page, so this is small. */
    private readonly MAX_SERVER_ATTEMPTS = 3;
    /**
     * How long one provider gets before it is written off.
     *
     * A working provider finished in 6975ms and 7127ms in the measurements above; the failing
     * ones only gave up at 14-16s, on the extractor's own navigation timeouts. Waiting for those
     * is what pushed the request past the caller's 20s ceiling, so the whole budget was spent
     * proving a provider dead and none was left to use a live one. 9s clears the working case
     * with room to spare and cuts the dead case in half.
     */
    private readonly SERVER_ATTEMPT_MS = Number(process.env.ANIWAVES_ATTEMPT_MS) || 9_000;
    /**
     * Total time the provider loop may use. Held under the caller's 20s ceiling so that running
     * out of providers still returns a clean empty result, and the source manager gets its turn
     * to try somewhere else rather than the whole request being cut off mid-flight.
     */
    private readonly SERVER_BUDGET_MS = Number(process.env.ANIWAVES_BUDGET_MS) || 17_000;
    /** Providers tried together per wave. Matches the extractor's concurrent page limit. */
    private readonly SERVER_WAVE_SIZE = Number(process.env.ANIWAVES_WAVE) || 2;

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
            timeout: 30000, // Increased from 12000ms to 30000ms
        });
        this.loadServerScores();
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,           // 15s timeout for upstream response
            httpsAgent: keepAliveAgent,
            headers: {
                'Accept': 'application/json, text/html',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
    }

    // ─── Server health helpers ──────────────────────────────────────────────

    private recordServerOutcome(name: string, ok: boolean): void {
        const entry = this.serverScore.get(name);
        const fresh = !entry || Date.now() - entry.at > this.SERVER_MEMORY_TTL;
        const next = fresh ? { ok: 0, fail: 0, at: Date.now() } : entry!;
        if (ok) next.ok++; else next.fail++;
        next.at = Date.now();
        this.serverScore.set(name, next);
        this.saveServerScores();
    }

    /**
     * What it learned about the providers, kept on disk.
     *
     * Learning it costs one request that spends ~9s proving a provider dead before reaching a
     * live one. In memory alone that lesson is lost on every restart, and this runs on a host
     * that stops the service whenever it is idle — so most visitors would arrive just after a
     * restart and each pay for the same lesson again. Written after every outcome because the
     * file is a few hundred bytes and the process gets no warning before it is stopped.
     */
    private saveServerScores(): void {
        try {
            const file = path.resolve(process.cwd(), SERVER_SCORE_FILE);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const tmp = `${file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify([...this.serverScore.entries()]));
            fs.renameSync(tmp, file);
        } catch { /* a lost preference costs one slow request, never correctness */ }
    }

    private loadServerScores(): void {
        try {
            const file = path.resolve(process.cwd(), SERVER_SCORE_FILE);
            if (!fs.existsSync(file)) return;
            const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as [string, { ok: number; fail: number; at: number }][];
            const now = Date.now();
            for (const [name, entry] of raw) {
                // Entries past the TTL would rank as untried anyway; dropping them here keeps the
                // file from growing with providers that no longer exist.
                if (now - entry.at < this.SERVER_MEMORY_TTL) this.serverScore.set(name, entry);
            }
            if (this.serverScore.size > 0) {
                const best = [...this.serverScore.entries()]
                    .filter(([, e]) => e.ok > e.fail)
                    .map(([n]) => n);
                logger.info(
                    `[Aniwaves] restored provider preferences for ${this.serverScore.size} server(s)` +
                    (best.length ? `; preferring ${best.join(', ')}` : ''),
                    undefined,
                    'CACHE'
                );
            }
        } catch { /* fall back to learning it again */ }
    }

    /**
     * Order the candidates best-first: providers that recently produced streams, then untried
     * ones, then those that recently produced none. Untried sits above known-bad so a provider
     * that was failing an hour ago still gets another chance once its memory ages out, rather
     * than being blacklisted permanently on one bad afternoon.
     */
    private orderServersByHealth(servers: EpisodeServer[]): EpisodeServer[] {
        const rank = (name: string): number => {
            const entry = this.serverScore.get(name);
            if (!entry || Date.now() - entry.at > this.SERVER_MEMORY_TTL) return 1; // untried
            if (entry.ok > entry.fail) return 0;   // known good
            if (entry.fail > entry.ok) return 2;   // known bad
            return 1;
        };
        // A stable sort keeps Aniwaves' own ordering as the tie-break within each rank.
        return [...servers].sort((a, b) => rank(a.name) - rank(b.name));
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
            if (!id || !isValidAnimeTitle(title)) return;
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
            // Try a more reliable endpoint for health check
            const response = await this.fetchWithProxyFallback('/ajax/home', {
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
                        $('.episodes li a').each((_, el) => {
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
            if (!isValidAnimeTitle(title)) {
                logger.warn(`[Aniwaves] Rejecting invalid anime title: "${title}" for ID ${id}`);
                return null;
            }
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

            $('.episodes li a').each((_, el) => {
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
            // Candidates to try, best-first. More than one, because a provider that returns no
            // streams is the normal case here rather than an exceptional one.
            let candidates: { name: string; linkId: string; type: 'sub' | 'dub' }[] = [];

            // If serverId is provided and looks like a direct link ID, use it directly to skip servers fetch
            if (serverId && !serverId.includes(' ') && serverId.length > 30) {
                candidates = [{ name: 'explicit', linkId: serverId, type: category }];
            } else {
                const servers = await this.getEpisodeServers(episodeId, options);
                const filtered = servers.filter(s => s.type === category);

                const pool = filtered.length > 0 ? filtered : servers;
                if (pool.length === 0) return { sources: [], subtitles: [] };

                let ordered = this.orderServersByHealth(pool);

                // A named server goes to the front, but does not become the only option.
                //
                // It is a preference rather than an instruction because of where the name
                // usually comes from: after a failure the player picks a server itself and then
                // asks for it by name on every retry. It picks the list's first entry, which is
                // exactly the provider most likely to be the dead one. Treating that as binding
                // means one bad guess pins the session to a provider that can never work, and
                // the response says which server actually answered anyway.
                if (serverId) {
                    const match = ordered.find(s =>
                        s.name.toLowerCase() === serverId.toLowerCase() ||
                        s.url === serverId
                    );
                    if (match) ordered = [match, ...ordered.filter(s => s !== match)];
                }

                candidates = ordered
                    .slice(0, this.MAX_SERVER_ATTEMPTS)
                    .map(srv => ({ name: srv.name, linkId: srv.url, type: srv.type === 'dub' ? 'dub' : 'sub' }));
            }

            let extractedSources: VideoSource[] = [];
            let extractedSubtitles: any[] = [];
            let origin = this.baseUrl;
            let resolvedCategory: 'sub' | 'dub' = category;

            // Each provider gets the same two steps: ask Aniwaves for its embed URL, then drive
            // that embed and capture what the player requests. The loop stops at the first one
            // that yields a stream, so a healthy provider costs one attempt.
            const loopStarted = Date.now();
            const remainingMs = () => this.SERVER_BUDGET_MS - (Date.now() - loopStarted);

            /** Resolve one provider's embed URL and extract from it. Never throws. */
            const attempt = async (candidate: { name: string; linkId: string; type: 'sub' | 'dub' }, budgetMs: number) => {
                try {
                    const response = await this.fetchWithProxyFallback('/ajax/sources', {
                        params: { id: candidate.linkId },
                        signal: options?.signal
                    });

                    const embedUrl = response.data?.status === 200 ? response.data?.result?.url : undefined;
                    if (!embedUrl) {
                        logger.warn(`[Aniwaves] ${candidate.name}: no embed URL`, undefined, this.name);
                        return null;
                    }

                    // The deadline is passed *into* the extractor rather than raced against it
                    // out here. Racing only abandons the promise: the page stays open until its
                    // own timeout, holding one of the two slots this process allows, and after
                    // two abandoned attempts every later request queues behind them. Given the
                    // deadline, the extractor closes its own page and releases the slot.
                    const extraction = await streamExtractor.extractFromEmbed(embedUrl, budgetMs);
                    if (!extraction.success || extraction.streams.length === 0) return null;

                    const sources = extraction.streams
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
                            server: candidate.name,
                        }));
                    if (sources.length === 0) return null;

                    let embedOrigin = this.baseUrl;
                    try { embedOrigin = new URL(embedUrl).origin; } catch { /* keep default */ }
                    return { candidate, sources, subtitles: extraction.subtitles || [], origin: embedOrigin };
                } catch (error: any) {
                    logger.error(`[Aniwaves] ${candidate.name}: ${error.message}`, error, undefined, this.name);
                    return null;
                }
            };

            /**
             * Run a wave of providers together and take the first that produces streams.
             *
             * Serially, a dead provider spends its whole deadline before a live one is even
             * started, and the live one then inherits whatever is left. That is what failed
             * here: DatSaV used 9s of the budget and Vidplay was cut off at 5512ms needing
             * about 7s — the working provider was reached and then not given time to work.
             * Run together they both get the full deadline, and the wave costs what the
             * slowest member costs rather than their sum. The width matches the extractor's
             * own page limit, so this uses the concurrency already budgeted for rather than
             * adding more pressure to a small container.
             */
            const runWave = async (wave: typeof candidates, budgetMs: number) => {
                let outstanding = wave.length;
                return new Promise<Awaited<ReturnType<typeof attempt>>>((resolve) => {
                    for (const c of wave) {
                        void attempt(c, budgetMs).then((result) => {
                            this.recordServerOutcome(c.name, result !== null);
                            // First success ends the wave. Waiting for the rest would hand the
                            // caller the slowest member's time when an answer is already in
                            // hand, and the losers stop on their own deadline and free their
                            // pages either way.
                            if (result) resolve(result);
                            else if (--outstanding === 0) resolve(null);
                        });
                    }
                });
            };

            let winner: Awaited<ReturnType<typeof attempt>> = null;
            for (let i = 0; i < candidates.length && !winner; ) {
                if (options?.signal?.aborted) break;

                const budgetMs = Math.min(this.SERVER_ATTEMPT_MS, remainingMs());
                // Starting a wave that cannot finish only delays the empty answer the caller is
                // going to get anyway.
                if (budgetMs < 4_000) {
                    logger.warn(`[Aniwaves] budget spent after ${i} provider(s)`, undefined, this.name);
                    break;
                }

                // Widen the wave only while it is unclear which provider works. Two pages at
                // once contend for a fraction of a CPU and each then runs slower than it would
                // alone, so once one is known good it is worth more to give it the whole
                // machine than to hedge against it.
                const top = this.serverScore.get(candidates[i].name);
                const knownGood = !!top && Date.now() - top.at < this.SERVER_MEMORY_TTL && top.ok > top.fail;
                const wave = candidates.slice(i, i + (knownGood ? 1 : this.SERVER_WAVE_SIZE));
                logger.info(`[Aniwaves] trying ${wave.map(c => c.name).join(' + ')} (${budgetMs}ms)`, undefined, this.name);
                winner = await runWave(wave, budgetMs);
                i += wave.length;
            }

            if (winner) {
                extractedSources = winner.sources;
                extractedSubtitles = winner.subtitles;
                origin = winner.origin;
                resolvedCategory = winner.candidate.type;
                logger.info(`[Aniwaves] ${winner.candidate.name}: ${extractedSources.length} streams`, undefined, this.name);
            }

            // Aniwaves' embed URL is domain-locked — it only renders on aniwaves.ru
            // and authorized domains, so loading it in our iframe yields:
            //   "Embedding blocked on this site"
            // Never return it as an isEmbed fallback. Instead, return no sources so the
            // caller fails over to another source / the sub fallback instead of a broken
            // embed that the browser cannot load.
            if (extractedSources.length === 0) {
                logger.warn(`[Aniwaves] no streams from ${candidates.length} provider(s) — returning empty`, undefined, this.name);
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
