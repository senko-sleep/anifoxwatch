import {
    AnimeSource,
    HiAnimeDirectSource,
    HiAnimeSource,
    AniwatchSource,
    GogoanimeSource,
    ConsumetSource,
    NineAnimeSource,
    AniwaveSource,
    WatchHentaiSource,
    HanimeSource,
    // New backup sources
    ZoroSource,
    AnimePaheSource,
    AnimeSugeSource,
    KaidoSource,
    AnixSource,
    KickassAnimeSource,
    YugenAnimeSource,
    AniMixPlaySource,
    AnimeFoxSource,
    AnimeDAOSource,
    AnimeFLVSource,
    AnimeSaturnSource,
    CrunchyrollSource,
    AnimeOnsenSource,
    MarinSource,
    AnimeHeavenSource,
    AnimeKisaSource,
    AnimeOwlSource,
    AnimeLandSource,
    AnimeFreakSource
} from '../sources/index.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime, SourceHealth, BrowseFilters } from '../types/anime.js';
import { GenreAwareSource, SourceRequestOptions } from '../sources/base-source.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';
import { logger, PerformanceTimer, createRequestContext } from '../utils/logger.js';
import { anilistService } from './anilist-service.js';
import { reliableRequest, retry, withTimeout } from '../middleware/reliability.js';

interface StreamingSource extends AnimeSource {
    getStreamingLinks?(episodeId: string, server?: string, category?: 'sub' | 'dub', options?: SourceRequestOptions): Promise<StreamingData>;
    getEpisodeServers?(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]>;
    getAnimeInfo?(id: string, options?: SourceRequestOptions): Promise<AnimeBase>;
}

/**
 * SourceManager handles multiple anime streaming sources
 * Features:
 * - Automatic fallback if a source fails
 * - Priority-based source selection
 * - Health monitoring with auto-recovery
 * - Aggregation of results from multiple sources
 * - Smart caching for performance
 * - Concurrency control with request queueing
 */
export class SourceManager {
    private sources: Map<string, StreamingSource> = new Map();
    private primarySource: string = 'HiAnimeDirect'; // Back to HiAnimeDirect - proven to work
    private healthStatus: Map<string, SourceHealth> = new Map();
    // Reordered - working sources first, then new backups
    private sourceOrder: string[] = [
        'HiAnimeDirect', 'HiAnime', 'Gogoanime', '9Anime', 'Aniwave', 'Aniwatch',
        'Zoro', 'AnimePahe', 'AnimeSuge', 'Kaido', 'Anix', 'KickassAnime', 
        'YugenAnime', 'AniMixPlay', 'AnimeFox', 'AnimeDAO', 'AnimeFLV', 'AnimeSaturn', 
        'Crunchyroll', 'AnimeOnsen', 'Marin', 'AnimeHeaven', 'AnimeKisa', 'AnimeOwl', 
        'AnimeLand', 'AnimeFreak', 'Consumet', 'WatchHentai', 'Hanime'
    ];

    // Concurrency control for API requests with better reliability
    private globalActiveRequests = 0;
    private maxGlobalConcurrent = 8;
    private requestQueue: Array<{
        fn: (signal: AbortSignal) => Promise<unknown>;
        resolve: (v: unknown) => void;
        reject: (e: unknown) => void;
        context: string;
        options: SourceRequestOptions;
    }> = [];

    // Rate limiting by source
    private sourceRequestCounts = new Map<string, number>();
    private sourceRateLimits = new Map<string, { limit: number; resetTime: number }>();

    constructor() {
        // Register streaming sources in priority order
        this.registerSource(new HiAnimeDirectSource());
        this.registerSource(new HiAnimeSource());
        this.registerSource(new GogoanimeSource());
        this.registerSource(new NineAnimeSource());
        this.registerSource(new AniwaveSource());
        this.registerSource(new AniwatchSource());
        this.registerSource(new ConsumetSource());
        this.registerSource(new WatchHentaiSource());
        this.registerSource(new HanimeSource());

        // Register NEW backup sources (20+ alternatives)
        this.registerSource(new ZoroSource());
        this.registerSource(new AnimePaheSource());
        this.registerSource(new AnimeSugeSource());
        this.registerSource(new KaidoSource());
        this.registerSource(new AnixSource());
        this.registerSource(new KickassAnimeSource());
        this.registerSource(new YugenAnimeSource());
        this.registerSource(new AniMixPlaySource());
        this.registerSource(new AnimeFoxSource());
        this.registerSource(new AnimeDAOSource());
        this.registerSource(new AnimeFLVSource());
        this.registerSource(new AnimeSaturnSource());
        this.registerSource(new CrunchyrollSource());
        this.registerSource(new AnimeOnsenSource());
        this.registerSource(new MarinSource());
        this.registerSource(new AnimeHeavenSource());
        this.registerSource(new AnimeKisaSource());
        this.registerSource(new AnimeOwlSource());
        this.registerSource(new AnimeLandSource());
        this.registerSource(new AnimeFreakSource());

        logger.info(`Registered ${this.sources.size} sources`, undefined, 'SourceManager');
        console.log(`\n📡 [SourceManager] Registered ${this.sources.size} streaming sources`);

        // Configure rate limits for each source (requests per minute) - Higher limits for faster sources
        this.sourceRateLimits.set('Gogoanime', { limit: 150, resetTime: 60000 }); // Increased - primary source
        this.sourceRateLimits.set('Zoro', { limit: 150, resetTime: 60000 }); // Increased - high priority
        this.sourceRateLimits.set('AnimePahe', { limit: 120, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('9Anime', { limit: 100, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('Aniwave', { limit: 100, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('AnimeSuge', { limit: 120, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('Kaido', { limit: 120, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('Anix', { limit: 100, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('KickassAnime', { limit: 100, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('YugenAnime', { limit: 100, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('AniMixPlay', { limit: 100, resetTime: 60000 }); // Increased
        this.sourceRateLimits.set('Aniwatch', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('HiAnimeDirect', { limit: 60, resetTime: 60000 }); // Reduced - slower
        this.sourceRateLimits.set('HiAnime', { limit: 60, resetTime: 60000 }); // Reduced - slower
        this.sourceRateLimits.set('AnimeFox', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeDAO', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeFLV', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeSaturn', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('Crunchyroll', { limit: 40, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeOnsen', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('Marin', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeHeaven', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeKisa', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeOwl', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeLand', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeFreak', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('Consumet', { limit: 30, resetTime: 60000 });
        this.sourceRateLimits.set('WatchHentai', { limit: 30, resetTime: 60000 });

        // Start health monitoring and perform initial health check
        this.startHealthMonitor();

        logger.info(`Initialized with ${this.sources.size} sources`, undefined, 'SourceManager');
    }

    private registerSource(source: StreamingSource): void {
        this.sources.set(source.name, source);
        this.healthStatus.set(source.name, {
            name: source.name,
            status: 'online',
            lastCheck: new Date()
        });
    }

    private startHealthMonitor(): void {
        logger.info('Health monitoring initialized - performing initial health check', undefined, 'SourceManager');
        console.log('🔍 [SourceManager] Starting initial health check for all sources...');
        
        // Perform initial health check asynchronously (don't block constructor)
        this.performInitialHealthCheck().catch(err => {
            logger.error('Initial health check failed', err, undefined, 'SourceManager');
        });
    }

    /**
     * Perform initial health check on startup
     * IMPORTANT: Sources default to AVAILABLE - we only mark offline after actual streaming failures
     * This ensures maximum availability for users
     */
    private async performInitialHealthCheck(): Promise<void> {
        const startTime = Date.now();
        console.log('⏳ [SourceManager] Initializing sources (optimistic availability)...');
        
        // Priority sources that we actively verify
        const prioritySources = ['HiAnimeDirect', 'HiAnime', '9Anime', 'Aniwave', 'Zoro'];
        
        // Mark ALL sources as available by default - they'll be marked offline only if they fail during actual use
        for (const [name, source] of this.sources.entries()) {
            source.isAvailable = true;
            this.healthStatus.set(name, {
                name,
                status: 'online',
                lastCheck: new Date()
            });
        }
        
        // Only verify priority sources - others stay available until proven otherwise
        for (const name of prioritySources) {
            const source = this.sources.get(name);
            if (!source) continue;
            
            try {
                console.log(`   🔍 Verifying ${name}...`);
                const isHealthy = await Promise.race([
                    source.healthCheck({ timeout: 8000 }),
                    new Promise<boolean>((resolve) => 
                        setTimeout(() => resolve(true), 8000) // Default to true on timeout
                    )
                ]);
                
                // Only mark offline if explicitly returned false (not on error/timeout)
                if (isHealthy === false) {
                    source.isAvailable = false;
                    this.healthStatus.set(name, {
                        name,
                        status: 'offline',
                        lastCheck: new Date()
                    });
                    console.log(`   ⚠️ ${name} returned unhealthy`);
                } else {
                    console.log(`   ✅ ${name} verified`);
                }
            } catch (error) {
                // On error, keep source available - it might work for actual requests
                console.log(`   ⚡ ${name} check inconclusive, keeping available`);
            }
        }
        
        const duration = Date.now() - startTime;
        const onlineSources = Array.from(this.healthStatus.values()).filter(s => s.status === 'online');
        const offlineSources = Array.from(this.healthStatus.values()).filter(s => s.status === 'offline');
        
        // Use enhanced logging for professional health summary
        logger.healthSummary(
            onlineSources.length,
            this.sources.size,
            onlineSources.map(s => s.name),
            offlineSources.map(s => s.name),
            duration
        );
    }

    /**
     * Internal helper to execute a source method reliably with timeout, retries, and circuit breaker
     */
    private async executeReliably<T>(
        sourceName: string,
        operation: string,
        fn: (signal: AbortSignal) => Promise<T>,
        options: SourceRequestOptions = {}
    ): Promise<T> {
        return this.enqueueRequest(
            (signal) => reliableRequest(
                sourceName,
                operation,
                (innerSignal) => fn(innerSignal),
                { ...options, signal }
            ),
            operation,
            options
        ) as Promise<T>;
    }

    /**
     * Enqueue a request for concurrency control
     */
    private async enqueueRequest<T>(
        fn: (signal: AbortSignal) => Promise<T>,
        context: string,
        options: SourceRequestOptions = {}
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.requestQueue.push({
                fn: fn as any,
                resolve: resolve as any,
                reject: reject as any,
                context,
                options
            });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.globalActiveRequests >= this.maxGlobalConcurrent || this.requestQueue.length === 0) {
            return;
        }

        const request = this.requestQueue.shift();
        if (!request) return;

        this.globalActiveRequests++;

        // Handle priority if needed in future

        try {
            const result = await withTimeout(
                (signal) => request.fn(signal),
                request.options.timeout || 30000,
                { operation: request.context },
                request.options.signal
            );
            request.resolve(result);
        } catch (error) {
            request.reject(error);
        } finally {
            this.globalActiveRequests--;
            this.processQueue();
        }
    }

    async checkAllHealth(): Promise<Map<string, SourceHealth>> {
        const timer = new PerformanceTimer('All Health Check', undefined, 'SourceManager');

        const checks = Array.from(this.sources.entries()).map(async ([name, source]) => {
            const start = Date.now();
            try {
                const isHealthy = await reliableRequest(
                    name,
                    'healthCheck',
                    (signal) => source.healthCheck({ signal }),
                    { timeout: 8000, maxAttempts: 1 }
                );

                const latency = Date.now() - start;
                
                // Only mark offline if explicitly returned false
                if (isHealthy === false) {
                    this.healthStatus.set(name, {
                        name,
                        status: 'offline',
                        latency,
                        lastCheck: new Date()
                    });
                    source.isAvailable = false;
                } else {
                    this.healthStatus.set(name, {
                        name,
                        status: 'online',
                        latency,
                        lastCheck: new Date()
                    });
                    source.isAvailable = true;
                }
            } catch (error) {
                // On error, keep current status - don't mark offline
                const latency = Date.now() - start;
                const currentStatus = this.healthStatus.get(name);
                this.healthStatus.set(name, {
                    name,
                    status: currentStatus?.status || 'online', // Keep current or default to online
                    latency,
                    lastCheck: new Date()
                });
                // Don't change isAvailable on health check errors
            }
        });

        await Promise.all(checks);

        const online = Array.from(this.healthStatus.values()).filter(s => s.status === 'online');
        logger.info(`Health check complete: ${online.length}/${this.sources.size} sources online`, { online: online.length, total: this.sources.size }, 'SourceManager');

        timer.end();
        return this.healthStatus;
    }

    getHealthStatus(): SourceHealth[] {
        return Array.from(this.healthStatus.values());
    }

    getAvailableSources(): string[] {
        return Array.from(this.sources.keys());
    }

    private getAvailableSource(preferred?: string): StreamingSource | null {
        // Try preferred source first
        if (preferred && this.sources.has(preferred)) {
            const source = this.sources.get(preferred)!;
            // Allow explicit request for Hanime/HentaiHaven even if we might consider it "unavailable" via normal health checks if specific logic applies, but strictly for now rely on isAvailable
            if (source.isAvailable) return source;
        }

        // Try sources in priority order
        for (const name of this.sourceOrder) {
            // Skip adult sources in general availability unless specifically requested (which is handled above)
            if (name === 'WatchHentai') continue;

            if (this.sources.has(name)) {
                const source = this.sources.get(name)!;
                if (source.isAvailable) return source;
            }
        }

        // Fallback to any available source (excluding Adult)
        for (const [name, source] of this.sources.entries()) {
            if (name === 'WatchHentai') continue;
            if (source.isAvailable) return source;
        }

        return null;
    }

    /**
     * Known source prefixes for ID detection
     */
    private readonly knownPrefixes = [
        'hianime-', 'hianime-direct-', '9anime-', 'aniwave-', 'aniwatch-', 
        'gogoanime-', 'consumet-', 'zoro-', 'animepahe-', 'animesuge-',
        'kaido-', 'anix-', 'kickassanime-', 'yugenanime-', 'animixplay-',
        'animefox-', 'animedao-', 'animeflv-', 'animesaturn-', 'crunchyroll-',
        'animeonsen-', 'marin-', 'animeheaven-', 'animekisa-', 'animeowl-',
        'animeland-', 'animefreak-', 'anilist-', 'watchhentai-', 'hanime-'
    ];

    /**
     * Check if an ID has a known source prefix
     */
    private hasKnownSourcePrefix(id: string): boolean {
        const lowerId = id.toLowerCase();
        return this.knownPrefixes.some(prefix => lowerId.startsWith(prefix));
    }

    /**
     * Extract the raw anime ID without source prefix
     * e.g., "hianime-one-piece-100" -> "one-piece-100"
     */
    private extractRawId(id: string): string {
        const lowerId = id.toLowerCase();
        for (const prefix of this.knownPrefixes) {
            if (lowerId.startsWith(prefix)) {
                return id.substring(prefix.length);
            }
        }
        return id;
    }

    /**
     * Build ID with source prefix
     */
    private buildSourceId(rawId: string, sourceName: string): string {
        const prefixMap: Record<string, string> = {
            'HiAnimeDirect': 'hianime-',
            'HiAnime': 'hianime-',
            '9Anime': '9anime-',
            'Aniwave': 'aniwave-',
            'Aniwatch': 'aniwatch-',
            'Gogoanime': 'gogoanime-',
            'Consumet': 'consumet-',
            'Zoro': 'zoro-',
            'AnimePahe': 'animepahe-',
            'AnimeSuge': 'animesuge-',
            'Kaido': 'kaido-',
            'Anix': 'anix-',
            'KickassAnime': 'kickassanime-',
            'YugenAnime': 'yugenanime-',
            'AniMixPlay': 'animixplay-',
            'AnimeFox': 'animefox-',
            'AnimeDAO': 'animedao-',
            'AnimeFLV': 'animeflv-',
            'AnimeSaturn': 'animesaturn-',
            'Crunchyroll': 'crunchyroll-',
            'AnimeOnsen': 'animeonsen-',
            'Marin': 'marin-',
            'AnimeHeaven': 'animeheaven-',
            'AnimeKisa': 'animekisa-',
            'AnimeOwl': 'animeowl-',
            'AnimeLand': 'animeland-',
            'AnimeFreak': 'animefreak-',
            'WatchHentai': 'watchhentai-',
            'Hanime': 'hanime-'
        };
        
        const prefix = prefixMap[sourceName] || '';
        return prefix + rawId;
    }

    private getStreamingSource(id: string): StreamingSource | null {
        const lowerId = id.toLowerCase();

        // Check for AniList IDs first - these need special handling
        if (lowerId.startsWith('anilist-')) {
            // AniList IDs don't have direct streaming links
            // They'll need to be looked up by title or use fallback
            // Return the primary source for title-based search fallback
            const primarySource = this.getAvailableSource();
            if (primarySource) {
                logger.debug(`[SourceManager] AniList ID detected, using fallback source: ${primarySource.name}`);
                return primarySource;
            }
            return null;
        }

        // HiAnimeDirect is preferred for hianime- prefixed IDs (deep scraping)
        const prefixes = [
            { prefix: 'hianime-', source: 'HiAnimeDirect' },
            { prefix: '9anime-', source: '9Anime' },
            { prefix: 'aniwave-', source: 'Aniwave' },
            { prefix: 'aniwatch-', source: 'Aniwatch' },
            { prefix: 'gogoanime-', source: 'Gogoanime' },
            { prefix: 'consumet-', source: 'Consumet' },
            { prefix: 'hanime-', source: 'WatchHentai' },
            { prefix: 'hh-', source: 'WatchHentai' },
            { prefix: 'watchhentai-', source: 'WatchHentai' },
            { prefix: 'watchhentai-series/', source: 'WatchHentai' },
            { prefix: 'watchhentai-videos/', source: 'WatchHentai' },
        ];

        for (const { prefix, source } of prefixes) {
            if (lowerId.startsWith(prefix)) {
                const preferredSource = this.sources.get(source);
                if (preferredSource?.isAvailable) {
                    return preferredSource;
                }
                // Fallback to HiAnime API if HiAnimeDirect is not available
                if (source === 'HiAnimeDirect') {
                    const fallback = this.sources.get('HiAnime');
                    if (fallback?.isAvailable) return fallback;
                }
            }
        }

        return this.getAvailableSource();
    }

    // ============ ANIME DATA METHODS ============

    async search(query: string, page: number = 1, sourceName?: string, options?: { mode?: 'safe' | 'mixed' | 'adult' }): Promise<AnimeSearchResult> {
        const timer = new PerformanceTimer(`Search: ${query}`, { query, page });
        const mode = options?.mode || 'safe';
        
        console.log(`🔍 [SourceManager] Search request: "${query}" (page: ${page}, mode: ${mode}, source: ${sourceName || 'auto'})`);

        if (mode === 'adult') {
            const adultSources = ['WatchHentai']
                .map(name => this.getAvailableSource(name))
                .filter(source => source && source.isAvailable) as StreamingSource[];

            if (adultSources.length === 0) {
                // Try to force get them if getAvailableSource failed due to strict checks but we want to try?
                // getAvailableSource uses isAvailable check.
                throw new Error('Adult source (WatchHentai/Gogoanime) are not available');
            }

            try {
                const searchPromises = adultSources.map(source =>
                    source.search(query, page)
                        .then(res => ({ ...res, sourceName: source.name }))
                        .catch(e => ({ results: [], totalPages: 0, currentPage: page, hasNextPage: false, sourceName: source.name }))
                );

                const results = await Promise.all(searchPromises);

                // Merge results
                const combinedResults: AnimeBase[] = [];
                let maxTotalPages = 0;
                let hasNextPage = false;

                results.forEach(r => {
                    if (r.results) combinedResults.push(...r.results);
                    if (r.totalPages > maxTotalPages) maxTotalPages = r.totalPages;
                    if (r.hasNextPage) hasNextPage = true;
                });

                const uniqueResults = this.deduplicateResults(combinedResults);

                timer.end();
                return {
                    results: uniqueResults,
                    totalPages: maxTotalPages,
                    currentPage: page,
                    hasNextPage: hasNextPage,
                    totalResults: uniqueResults.length,
                    source: adultSources.map(s => s.name).join('+')
                };
            } catch (error) {
                throw new Error('Adult search failed');
            }
        }

        // Mixed Mode: Search both Preferred/Selected source AND Adult sources, then merge
        if (mode === 'mixed') {
            const standardSources = this.sourceOrder
                .filter(name => name !== 'WatchHentai')
                .map(name => this.sources.get(name))
                .filter(source => source && source.isAvailable)
                .slice(0, 2) as StreamingSource[];

            const adultSources = ['WatchHentai']
                .map(name => this.getAvailableSource(name))
                .filter(source => source && source.isAvailable) as StreamingSource[];

            const searchPromises: Promise<AnimeSearchResult>[] = [];

            // Add adult sources first to prioritize them
            adultSources.forEach(source => {
                searchPromises.push(source.search(query, page).catch(e => ({
                    results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: source.name
                })));
            });

            // Add standard sources
            standardSources.forEach(source => {
                searchPromises.push(source.search(query, page).catch(e => ({
                    results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: source.name
                })));
            });

            const results = await Promise.all(searchPromises);

            // Merge results - adult content first
            const combinedResults: AnimeBase[] = [];
            let maxTotalPages = 0;
            let hasNextPage = false;

            results.forEach(r => {
                if (r.results) combinedResults.push(...r.results);
                if (r.totalPages > maxTotalPages) maxTotalPages = r.totalPages;
                if (r.hasNextPage) hasNextPage = true;
            });

            // Deduplicate
            const uniqueResults = this.deduplicateResults(combinedResults);

            timer.end();
            return {
                results: uniqueResults,
                totalPages: maxTotalPages,
                currentPage: page,
                hasNextPage: hasNextPage,
                totalResults: uniqueResults.length,
                source: 'Mixed'
            };
        }

        // Safe Mode (Default)
        // If a specific source is requested, use it
        if (sourceName) {
            const source = this.getAvailableSource(sourceName);
            if (!source) {
                console.log(`❌ [SourceManager] Requested source "${sourceName}" is not available`);
                logger.warn(`Requested source ${sourceName} not available`, { query }, 'SourceManager');
                return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
            }
            try {
                const result = await this.executeReliably(source.name, 'search', (signal) => source.search(query, page, undefined, { signal }));
                if (!result.results || result.results.length === 0) {
                    logger.warn(`Source "${sourceName}" returned no results for query "${query}"`, { source: sourceName, query });
                    console.log(`⚠️ [SourceManager] Source "${sourceName}" returned no results for: "${query}"`);
                } else {
                    logger.info(`Source "${sourceName}" returned ${result.results.length} results for query "${query}"`, { source: sourceName, query, count: result.results.length });
                    console.log(`✅ [SourceManager] Source "${sourceName}" returned ${result.results.length} results`);
                }
                timer.end();
                return result;
            } catch (error) {
                console.log(`❌ [SourceManager] Search failed with source "${sourceName}": ${(error as Error).message}`);
                logger.error(`Search failed with source ${sourceName}`, error as Error, { query });
                throw error;
            }
        }

        const sourcesToTry = this.sourceOrder
            .filter(name => name !== 'WatchHentai')
            .map(name => this.sources.get(name))
            .filter(source => source && source.isAvailable)
            .slice(0, 6) as StreamingSource[]; // Increased from 3 to 6 sources for better coverage
        
        console.log(`📡 [SourceManager] Available sources for search: ${sourcesToTry.map(s => s.name).join(', ')}`);

        if (sourcesToTry.length === 0) {
            console.log(`❌ [SourceManager] No available sources for search!`);
            console.log(`   All sources status:`, Array.from(this.sources.entries()).map(([name, s]) => `${name}: ${s.isAvailable ? 'available' : 'unavailable'}`));
            logger.warn(`No available sources for search`, { query }, 'SourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
        }

        try {
            console.log(`🔍 [SourceManager] Multi-source search starting with ${sourcesToTry.length} sources: ${sourcesToTry.map(s => s.name).join(', ')}`);
            logger.info(`Starting multi-source search with: ${sourcesToTry.map(s => s.name).join(', ')}`, { query });

            const searchPromises = sourcesToTry.map(source =>
                this.executeReliably(source.name, 'search', (signal) => source.search(query, page, undefined, { signal }))
                    .then(res => {
                        if (!res.results || res.results.length === 0) {
                            logger.warn(`Source "${source.name}" returned no results for query "${query}"`, { source: source.name, query });
                            console.log(`⚠️ [SourceManager] Source "${source.name}" returned no results for: "${query}"`);
                        } else {
                            logger.info(`Source "${source.name}" returned ${res.results.length} results for query "${query}"`, { source: source.name, query, count: res.results.length });
                            console.log(`✅ [SourceManager] Source "${source.name}" returned ${res.results.length} results`);
                        }
                        return { ...res, sourceName: source.name };
                    })
                    .catch(error => {
                        logger.warn(`Search failed on ${source.name}: ${error.message}`, { source: source.name, query });
                        console.log(`❌ [SourceManager] Search failed with source "${source.name}": ${(error as Error).message}`);
                        return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, sourceName: source.name };
                    })
            );

            const results = await Promise.all(searchPromises);

            // Merge results
            const combinedResults: AnimeBase[] = [];
            let maxTotalPages = 0;
            let hasNextPage = false;
            let successfulSources: string[] = [];

            results.forEach(r => {
                if (r.results && r.results.length > 0) {
                    combinedResults.push(...r.results);
                    successfulSources.push(r.sourceName);
                } else {
                    console.log(`⚠️ [SourceManager] No results from ${r.sourceName} for query: "${query}"`);
                    logger.warn(`No results from ${r.sourceName}`, { query, page }, 'SourceManager');
                }
                if (r.totalPages > maxTotalPages) maxTotalPages = r.totalPages;
                if (r.hasNextPage) hasNextPage = true;
            });

            // Deduplicate
            const uniqueResults = this.deduplicateResults(combinedResults);

            if (uniqueResults.length === 0) {
                console.log(`❌ [SourceManager] No results from ANY source for query: "${query}"`);
                console.log(`   Tried sources: ${sourcesToTry.map(s => s.name).join(', ')}`);
                logger.warn(`No results from any source`, { query, page, triedSources: sourcesToTry.map(s => s.name) }, 'SourceManager');
            } else {
                console.log(`✅ [SourceManager] Found ${uniqueResults.length} results from: ${successfulSources.join(', ')}`);
            }

            timer.end();
            return {
                results: uniqueResults,
                totalPages: maxTotalPages,
                currentPage: page,
                hasNextPage: hasNextPage,
                totalResults: uniqueResults.length,
                source: successfulSources.join('+') || 'None'
            };

        } catch (error) {
            logger.error(`Multi-source search failed`, error as Error, { query });
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
        }
    }

    /**
     * Deduplicate anime results based on ID and title similarity
     * UPDATED: Prioritizes data completeness over source order for better diversity
     */
    private deduplicateResults(results: AnimeBase[]): AnimeBase[] {
        const unique = new Map<string, AnimeBase>();
        const titleMap = new Map<string, AnimeBase>();

        // Helper to calculate data completeness score - THIS IS NOW PRIMARY
        const getCompletenessScore = (anime: AnimeBase): number => {
            let score = 0;
            if (anime.description && anime.description.length > 50) score += 3;
            if (anime.genres && anime.genres.length > 0) score += 2;
            if (anime.rating && anime.rating > 0) score += 2;
            if (anime.episodes && anime.episodes > 0) score += 1;
            if (anime.year && anime.year > 0) score += 1;
            if (anime.studios && anime.studios.length > 0) score += 1;
            if (anime.cover || anime.image) score += 1;
            // Bonus for having a streaming-ready ID (not anilist-)
            if (anime.id && !anime.id.startsWith('anilist-')) score += 2;
            return score;
        };

        for (const anime of results) {
            // Check ID first
            if (unique.has(anime.id)) {
                continue;
            }

            const normalizedTitle = this.normalizeTitle(anime.title);

            // Check if we already have this title
            if (titleMap.has(normalizedTitle)) {
                const existing = titleMap.get(normalizedTitle)!;
                
                // CHANGED: Only consider data completeness, NOT source priority
                // This ensures we get diverse sources in results
                const existingScore = getCompletenessScore(existing);
                const currentScore = getCompletenessScore(anime);
                
                // Only replace if current has significantly better data (score diff > 2)
                // This keeps the first occurrence unless the new one is much better
                const shouldReplace = currentScore > existingScore + 2;
                
                if (shouldReplace) {
                    // Replace with better data
                    unique.delete(existing.id);
                    unique.set(anime.id, anime);
                    titleMap.set(normalizedTitle, anime);
                }
            } else {
                // Add new entry
                unique.set(anime.id, anime);
                titleMap.set(normalizedTitle, anime);
            }
        }

        logger.info(`Deduplicated ${results.length} results to ${unique.size} unique entries`, { 
            originalCount: results.length, 
            uniqueCount: unique.size 
        }, 'SourceManager');

        return Array.from(unique.values());
    }

    /**
     * Get anime details by ID
     * Handles both streaming IDs and AniList IDs
     * For AniList IDs, does a title-based search to find the streaming source
     */
    async getAnime(id: string): Promise<AnimeBase | null> {
        const lowerId = id.toLowerCase();

        // Handle AniList IDs specially - do title-based search
        if (lowerId.startsWith('anilist-')) {
            const anilistId = lowerId.replace('anilist-', '');
            const numericId = parseInt(anilistId, 10);

            if (isNaN(numericId)) {
                logger.warn(`[SourceManager] Invalid AniList ID: ${anilistId}`);
                return null;
            }

            logger.info(`[SourceManager] AniList ID detected: ${anilistId}, fetching by ID`);

            try {
                // Get anime info from AniList by ID directly
                const anilistData = await anilistService.getAnimeById(numericId);
                if (!anilistData) {
                    logger.warn(`[SourceManager] Could not fetch AniList data for ID: ${anilistId}`);
                    return null;
                }

                // Now search for streaming source using the title
                const title = anilistData.title;
                logger.info(`[SourceManager] Looking for streaming match for: ${title}`);
                const streamingMatch = await this.findStreamingAnimeByTitle(title);

                if (streamingMatch) {
                    logger.info(`[SourceManager] Found streaming match: ${streamingMatch.id}`);
                    // Return streaming data enriched with AniList info
                    return {
                        ...streamingMatch,
                        genres: anilistData.genres,
                        description: anilistData.description,
                        rating: anilistData.rating || streamingMatch.rating,
                        studios: anilistData.studios,
                        season: anilistData.season,
                        year: anilistData.year,
                    };
                }

                // No streaming match found - return AniList data with proper ID
                logger.warn(`[SourceManager] No streaming match found for AniList ID: ${anilistId}`);
                return {
                    ...anilistData,
                    id: `anilist-${numericId}`,
                    streamingId: undefined,
                    source: 'AniList'
                };
            } catch (error) {
                logger.error(`[SourceManager] getAnime failed for AniList ID ${anilistId}:`, error as Error);
                return null;
            }
        }

        // Regular streaming ID handling
        const source = this.getStreamingSource(id);
        if (!source) return null;

        try {
            return await this.executeReliably(source.name, 'getAnime', (signal) => source.getAnime(id, { signal }));
        } catch (error) {
            console.error(`[SourceManager] getAnime failed:`, error);
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const timer = new PerformanceTimer(`getEpisodes: ${animeId}`, { animeId });
        const startTime = Date.now();

        console.log(`📺 [SourceManager] getEpisodes called: ${animeId}`);

        // SPECIAL HANDLING: AniList IDs need title-based search to find streaming source
        if (animeId.toLowerCase().startsWith('anilist-')) {
            console.log(`   🔍 AniList ID detected - searching by title for streaming source`);
            
            try {
                // Get anime details from AniList
                const anilistId = animeId.replace(/^anilist-/i, '');
                const numericId = parseInt(anilistId, 10);
                
                if (!isNaN(numericId)) {
                    const anilistData = await anilistService.getAnimeById(numericId);
                    
                    if (anilistData?.title) {
                        const searchTitle = anilistData.title;
                        console.log(`   🔍 Searching for: "${searchTitle}"`);
                        
                        // Search across streaming sources to find a match
                        const searchResult = await this.search(searchTitle, 1);
                        
                        if (searchResult.results && searchResult.results.length > 0) {
                            // Find best match - prefer exact or close title match
                            const normalizedSearch = this.normalizeTitle(searchTitle);
                            let bestMatch = searchResult.results[0];
                            
                            for (const result of searchResult.results) {
                                const normalizedResult = this.normalizeTitle(result.title);
                                if (normalizedResult === normalizedSearch) {
                                    bestMatch = result;
                                    break;
                                }
                            }
                            
                            // Use the streaming ID from the match
                            const streamingId = bestMatch.id;
                            console.log(`   ✅ Found streaming match: "${bestMatch.title}" (${streamingId})`);
                            
                            // Recursively get episodes with the streaming ID
                            if (streamingId && !streamingId.startsWith('anilist-')) {
                                const episodes = await this.getEpisodes(streamingId);
                                if (episodes && episodes.length > 0) {
                                    const duration = Date.now() - startTime;
                                    console.log(`   ✅ Got ${episodes.length} episodes via title search in ${duration}ms`);
                                    timer.end();
                                    return episodes;
                                }
                            }
                        }
                        
                        console.log(`   ⚠️ No streaming match found for AniList title: "${searchTitle}"`);
                    }
                }
            } catch (err) {
                console.log(`   ❌ AniList title search failed: ${(err as Error).message}`);
            }
            
            timer.end();
            return [];
        }

        // Determine primary source from anime ID
        const primarySource = this.getStreamingSource(animeId);
        
        // Check if ID has a known source prefix
        const hasSourcePrefix = this.hasKnownSourcePrefix(animeId);
        console.log(`   📡 Primary source: ${primarySource?.name || 'none'}, Has prefix: ${hasSourcePrefix}`);
        
        // Build list of sources to try
        const isAdultContent = animeId.toLowerCase().startsWith('hh-') || 
                              animeId.toLowerCase().startsWith('hanime-') ||
                              animeId.toLowerCase().startsWith('watchhentai-');

        // If no known prefix, ONLY use primary source - don't fabricate IDs for other sources
        if (!hasSourcePrefix) {
            if (!primarySource?.isAvailable) {
                console.log(`   ❌ No primary source available and no known prefix`);
                timer.end();
                return [];
            }
            
            // Just try the primary source with the original ID
            console.log(`   ⏳ Trying primary source ${primarySource.name} with original ID`);
            try {
                const episodes = await this.executeReliably(primarySource.name, 'getEpisodes',
                    (signal) => primarySource.getEpisodes(animeId, { signal }),
                    { timeout: 15000 }
                );
                if (episodes && episodes.length > 0) {
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ Got ${episodes.length} episodes from ${primarySource.name} in ${duration}ms`);
                    logger.episodeFetch(animeId, episodes.length, primarySource.name, duration);
                    timer.end();
                    return episodes;
                }
            } catch (err) {
                console.log(`   ❌ Primary source failed: ${(err as Error).message}`);
            }
            
            timer.end();
            return [];
        }

        // Has known prefix - can try multiple sources with converted IDs
        const rawId = this.extractRawId(animeId);
        const sourcesToTry: StreamingSource[] = [];
        
        // Add primary source first
        if (primarySource?.isAvailable) {
            sourcesToTry.push(primarySource);
        }

        // Add a few backup sources (limit to 2-3 to avoid slowdown)
        const backupSourceNames = ['HiAnimeDirect', 'HiAnime', 'Gogoanime'].filter(
            name => name !== primarySource?.name
        );
        for (const name of backupSourceNames) {
            if (isAdultContent && name !== 'WatchHentai') continue;
            if (!isAdultContent && name === 'WatchHentai') continue;
            
            const source = this.sources.get(name) as StreamingSource;
            if (source?.isAvailable) {
                sourcesToTry.push(source);
            }
        }

        if (sourcesToTry.length === 0) {
            console.log(`   ❌ No available sources`);
            timer.end();
            return [];
        }

        console.log(`   📋 Sources to try: ${sourcesToTry.map(s => s.name).join(', ')}`);

        // Try sources - primary first, then backups
        for (const source of sourcesToTry) {
            const idToUse = source === primarySource ? animeId : this.buildSourceId(rawId, source.name);
            console.log(`   ⏳ Trying ${source.name} with ID: ${idToUse}`);
            
            try {
                const episodes = await this.executeReliably(source.name, 'getEpisodes',
                    (signal) => source.getEpisodes(idToUse, { signal }),
                    { timeout: 12000 }
                );
                if (episodes && episodes.length > 0) {
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ Got ${episodes.length} episodes from ${source.name} in ${duration}ms`);
                    logger.episodeFetch(idToUse, episodes.length, source.name, duration);
                    timer.end();
                    return episodes;
                }
            } catch (err) {
                console.log(`   ❌ ${source.name} failed: ${(err as Error).message}`);
            }
        }

        timer.end();
        console.log(`   ❌ No episodes found from any source`);
        logger.warn(`No episodes found for ${animeId} from any source`, { animeId }, 'SourceManager');
        return [];
    }

    async getTrending(page: number = 1, sourceName?: string): Promise<AnimeBase[]> {
        const timer = new PerformanceTimer(`getTrending page ${page}`, { page, sourceName });
        
        // If specific source requested, use single-source mode
        if (sourceName) {
            const source = this.getAvailableSource(sourceName);
            if (!source) {
                logger.warn(`Requested source ${sourceName} not available for getTrending`, { page }, 'SourceManager');
                return [];
            }
            try {
                const results = await this.executeReliably(source.name, 'getTrending', (signal) => source.getTrending(page, { signal }));
                logger.sourceResult(source.name, 'getTrending', results?.length || 0, timer.end());
                return results || [];
            } catch (error) {
                logger.error(`getTrending failed on ${source.name}`, error as Error, { page }, 'SourceManager');
                return [];
            }
        }

        // Multi-source aggregation mode - query MORE sources for better diversity
        const availableSources = this.sourceOrder
            .filter(name => name !== 'WatchHentai' && name !== 'Consumet')
            .map(name => this.sources.get(name))
            .filter(source => source && source.isAvailable)
            .slice(0, 6) as StreamingSource[]; // Increased from 3 to 6

        if (availableSources.length === 0) {
            logger.warn(`No available sources for getTrending`, { page }, 'SourceManager');
            return [];
        }

        logger.sourceAggregation('getTrending', availableSources.map(s => s.name), { page });

        const startTime = Date.now();
        const results = await Promise.allSettled(
            availableSources.map(source =>
                this.executeReliably(source.name, 'getTrending', (signal) => source.getTrending(page, { signal }), { timeout: 8000 })
                    .then(res => {
                        const duration = Date.now() - startTime;
                        logger.sourceResult(source.name, 'getTrending', res?.length || 0, duration);
                        return { source: source.name, results: res || [] };
                    })
                    .catch(err => {
                        logger.warn(`getTrending failed on ${source.name}: ${err.message}`, { page }, source.name);
                        return { source: source.name, results: [] };
                    })
            )
        );

        // Collect results by source for interleaving
        const sourceResults: Map<string, AnimeBase[]> = new Map();
        const successfulSources: string[] = [];

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.results.length > 0) {
                sourceResults.set(result.value.source, result.value.results);
                successfulSources.push(result.value.source);
            }
        }

        // INTERLEAVE results from different sources for better diversity
        // Instead of just concatenating, take items round-robin from each source
        const allResults: AnimeBase[] = [];
        const maxItems = Math.max(...Array.from(sourceResults.values()).map(r => r.length), 0);
        
        for (let i = 0; i < maxItems; i++) {
            for (const [sourceName, items] of sourceResults) {
                if (i < items.length) {
                    allResults.push(items[i]);
                }
            }
        }

        // Deduplicate (but now results are interleaved so we get better diversity)
        const uniqueResults = this.deduplicateResults(allResults);
        const duration = Date.now() - startTime;

        logger.aggregationComplete('getTrending', availableSources.map(s => s.name), successfulSources, uniqueResults.length, duration, { page });
        timer.end();

        return uniqueResults;
    }

    async getLatest(page: number = 1, sourceName?: string): Promise<AnimeBase[]> {
        const timer = new PerformanceTimer(`getLatest page ${page}`, { page, sourceName });
        
        // If specific source requested, use single-source mode
        if (sourceName) {
            const source = this.getAvailableSource(sourceName);
            if (!source) {
                logger.warn(`Requested source ${sourceName} not available for getLatest`, { page }, 'SourceManager');
                return [];
            }
            try {
                const results = await this.executeReliably(source.name, 'getLatest', (signal) => source.getLatest(page, { signal }));
                logger.sourceResult(source.name, 'getLatest', results?.length || 0, timer.end());
                return results || [];
            } catch (error) {
                logger.error(`getLatest failed on ${source.name}`, error as Error, { page }, 'SourceManager');
                return [];
            }
        }

        // Multi-source aggregation mode - query MORE sources for better diversity
        const availableSources = this.sourceOrder
            .filter(name => name !== 'WatchHentai' && name !== 'Consumet')
            .map(name => this.sources.get(name))
            .filter(source => source && source.isAvailable)
            .slice(0, 6) as StreamingSource[]; // Increased from 3 to 6

        if (availableSources.length === 0) {
            logger.warn(`No available sources for getLatest`, { page }, 'SourceManager');
            return [];
        }

        logger.sourceAggregation('getLatest', availableSources.map(s => s.name), { page });

        const startTime = Date.now();
        const results = await Promise.allSettled(
            availableSources.map(source =>
                this.executeReliably(source.name, 'getLatest', (signal) => source.getLatest(page, { signal }), { timeout: 8000 })
                    .then(res => {
                        const duration = Date.now() - startTime;
                        logger.sourceResult(source.name, 'getLatest', res?.length || 0, duration);
                        return { source: source.name, results: res || [] };
                    })
                    .catch(err => {
                        logger.warn(`getLatest failed on ${source.name}: ${err.message}`, { page }, source.name);
                        return { source: source.name, results: [] };
                    })
            )
        );

        // Collect results by source for interleaving
        const sourceResults: Map<string, AnimeBase[]> = new Map();
        const successfulSources: string[] = [];

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.results.length > 0) {
                sourceResults.set(result.value.source, result.value.results);
                successfulSources.push(result.value.source);
            }
        }

        // INTERLEAVE results from different sources for better diversity
        const allResults: AnimeBase[] = [];
        const maxItems = Math.max(...Array.from(sourceResults.values()).map(r => r.length), 0);
        
        for (let i = 0; i < maxItems; i++) {
            for (const [sourceName, items] of sourceResults) {
                if (i < items.length) {
                    allResults.push(items[i]);
                }
            }
        }

        // Deduplicate (but now results are interleaved so we get better diversity)
        const uniqueResults = this.deduplicateResults(allResults);
        const duration = Date.now() - startTime;

        logger.aggregationComplete('getLatest', availableSources.map(s => s.name), successfulSources, uniqueResults.length, duration, { page });
        timer.end();

        return uniqueResults;
    }

    async getTopRated(page: number = 1, limit: number = 10, sourceName?: string): Promise<TopAnime[]> {
        const source = this.getAvailableSource(sourceName);
        if (!source) {
            console.log(`❌ [SourceManager] No available source for getTopRated (requested: ${sourceName || 'default'})`);
            return [];
        }

        try {
            const results = await this.executeReliably(source.name, 'getTopRated', (signal) => source.getTopRated(page, limit, { signal }));
            if (!results || results.length === 0) {
                console.log(`⚠️ [SourceManager] getTopRated returned no results from ${source.name}`);
            } else {
                console.log(`✅ [SourceManager] getTopRated returned ${results.length} results from ${source.name}`);
            }
            return results;
        } catch (error) {
            console.log(`❌ [SourceManager] getTopRated failed on ${source.name}: ${(error as Error).message}`);
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                console.log(`   Trying fallback source: ${fallback.name}`);
                return this.executeReliably(fallback.name, 'getTopRated', (signal) => fallback.getTopRated(page, limit, { signal }));
            }
            return [];
        }
    }

    /**
     * Get filtered anime based on various criteria
     * Filters are applied client-side after fetching from source
     */
    async getFilteredAnime(filters: {
        type?: string;
        genres?: string[];
        status?: string;
        year?: number;
        season?: string;
        sort?: string;
        order?: string;
        limit?: number;
        page?: number;
        source?: string;
    }): Promise<{
        anime: AnimeBase[];
        totalPages: number;
        hasNextPage: boolean;
        totalResults: number;
    }> {
        const timer = new PerformanceTimer('Filtered anime', filters);
        const source = this.getAvailableSource(filters.source);

        if (!source) {
            logger.warn(`No available source for filtered anime`, filters, 'SourceManager');
            return { anime: [], totalPages: 0, hasNextPage: false, totalResults: 0 };
        }

        try {
            logger.sourceRequest(source.name, 'getFilteredAnime', filters);

            // Fetch trending anime as base data
            const page = filters.page || 1;
            const allAnime: AnimeBase[] = [];

            // Try to get more data for filtering by fetching multiple pages
            const pagesToFetch = 3;
            for (let i = 0; i < pagesToFetch; i++) {
                try {
                    const trending = await this.executeReliably(source.name, 'getTrending', (signal) => source.getTrending(page + i, { signal }));
                    allAnime.push(...trending);
                } catch {
                    break;
                }
            }

            // Apply filters
            let filtered = allAnime;

            // Filter by type
            if (filters.type) {
                filtered = filtered.filter(a =>
                    a.type?.toLowerCase() === filters.type?.toLowerCase()
                );
            }

            // Filter by genres
            if (filters.genres && filters.genres.length > 0) {
                filtered = filtered.filter(a => {
                    if (!a.genres || a.genres.length === 0) return false;
                    return filters.genres!.some(g =>
                        a.genres!.some(ag => ag.toLowerCase().includes(g.toLowerCase()))
                    );
                });
            }

            // Filter by status
            if (filters.status) {
                filtered = filtered.filter(a =>
                    a.status?.toLowerCase() === filters.status?.toLowerCase()
                );
            }

            // Filter by year
            if (filters.year) {
                filtered = filtered.filter(a => {
                    if (!a.year) return false;
                    return a.year === filters.year;
                });
            }

            // Sort results
            const sort = filters.sort || 'rating';
            const order = filters.order || 'desc';

            filtered.sort((a, b) => {
                let comparison = 0;
                switch (sort) {
                    case 'rating':
                        comparison = (b.rating || 0) - (a.rating || 0);
                        break;
                    case 'year':
                        comparison = (b.year || 0) - (a.year || 0);
                        break;
                    case 'title':
                        comparison = (a.title || '').localeCompare(b.title || '');
                        break;
                    case 'episodes':
                        comparison = (b.episodes || 0) - (a.episodes || 0);
                        break;
                    default:
                        comparison = (b.rating || 0) - (a.rating || 0);
                }
                return order === 'asc' ? -comparison : comparison;
            });

            // Paginate results
            const limit = filters.limit || 20;
            const startIndex = ((filters.page || 1) - 1) * limit;
            const paginated = filtered.slice(startIndex, startIndex + limit);
            const totalResults = filtered.length;
            const totalPages = Math.ceil(totalResults / limit);
            const hasNextPage = startIndex + limit < totalResults;

            logger.sourceResponse(source.name, 'getFilteredAnime', true, {
                totalFetched: allAnime.length,
                totalFiltered: totalResults,
                returned: paginated.length
            });
            timer.end();

            return {
                anime: paginated,
                totalPages,
                hasNextPage,
                totalResults
            };
        } catch (error) {
            logger.error(`Filtered anime failed for ${source.name}`, error as Error, filters, 'SourceManager');
            // Try fallback
            source.isAvailable = false;
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                logger.failover(source.name, fallback.name, 'filtered anime failed', filters);
                return this.getFilteredAnime({ ...filters, source: fallback.name });
            }
            return { anime: [], totalPages: 0, hasNextPage: false, totalResults: 0 };
        }
    }

    /**
     * Browse anime with advanced filtering, sorting, and pagination
     * Supports: popularity, trending, recently_released, shuffle, rating, year, title sorting
     * Supports: type, genres, status, year, startYear, endYear filters
     * Default: 25 items per page
     */
    async browseAnime(filters: {
        type?: string;
        genres?: string[];
        status?: string;
        year?: number;
        startYear?: number;
        endYear?: number;
        sort?: string;
        order?: string;
        limit?: number;
        page?: number;
        source?: string;
        mode?: 'safe' | 'mixed' | 'adult';
    }): Promise<{
        anime: AnimeBase[];
        totalPages: number;
        hasNextPage: boolean;
        totalResults: number;
    }> {
        const timer = new PerformanceTimer('Browse anime', filters);
        const mode = filters.mode || 'safe';

        // Determine source based on mode
        let effectiveSource = filters.source;

        if (mode === 'adult') {
            if (filters.source && ['WatchHentai'].includes(filters.source)) {
                effectiveSource = filters.source;
            } else {
                effectiveSource = 'WatchHentai';
            }
        } else if (mode === 'mixed') {
            // For mixed mode, we'll fetch from both standard sources and adult sources and combine results
            const standardSource = this.getAvailableSource(filters.source);
            const adultSource = this.getAvailableSource('WatchHentai');

            // If both sources are available, fetch from both and combine
            if (standardSource && adultSource) {
                try {
                    const [standardResult, adultResult] = await Promise.all([
                        this._executeBrowse(standardSource, filters),
                        this._executeBrowse(adultSource, filters)
                    ]);

                    // Combine and deduplicate results - adult content first
                    const combinedAnime = [...adultResult.anime, ...standardResult.anime];
                    const uniqueAnime = Array.from(new Map(combinedAnime.map(a => [a.id, a])).values());

                    logger.sourceResponse('Mixed', 'browseAnime', true, {
                        returned: uniqueAnime.length,
                        page: filters.page,
                        standard: standardResult.anime.length,
                        adult: adultResult.anime.length
                    });
                    timer.end();

                    return {
                        anime: uniqueAnime,
                        totalPages: Math.max(standardResult.totalPages, adultResult.totalPages),
                        hasNextPage: standardResult.hasNextPage || adultResult.hasNextPage,
                        totalResults: uniqueAnime.length
                    };
                } catch (error) {
                    logger.error(`Mixed browse failed: ${error}`, error as Error, filters);
                    // Fallback to standard source if mixed mode fails
                    const fallbackSource = this.getAvailableSource(filters.source);
                    if (fallbackSource) {
                        const result = await this._executeBrowse(fallbackSource, filters);
                        logger.sourceResponse(fallbackSource.name, 'browseAnime', true, {
                            returned: result.anime.length,
                            page: filters.page,
                            totalPages: result.totalPages
                        });
                        timer.end();
                        return result;
                    }
                    return { anime: [], totalPages: 0, hasNextPage: false, totalResults: 0 };
                }
            }
        }

        const source = this.getAvailableSource(effectiveSource);

        if (!source) {
            logger.warn(`No available source for browse`, filters, 'SourceManager');
            return { anime: [], totalPages: 0, hasNextPage: false, totalResults: 0 };
        }

        try {
            logger.sourceRequest(source.name, 'browseAnime', filters);

            // Wrap entire execution in a timeout
            const result = await Promise.race([
                this._executeBrowse(source, filters),
                new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error(`Browse timeout after 15s`)), 15000)
                )
            ]);

            logger.sourceResponse(source.name, 'browseAnime', true, {
                returned: result.anime.length,
                page: filters.page,
                totalPages: result.totalPages
            });
            timer.end();

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Browse failed with source ${source.name}: ${errorMessage}`, error as Error, filters);

            // Failover
            const fallback = this.getAvailableSource();
            if (fallback && fallback.name !== source.name) {
                logger.failover(source.name, fallback.name, 'filtered anime failed', filters);
                return this.browseAnime({ ...filters, source: fallback.name });
            }
            return { anime: [], totalPages: 0, hasNextPage: false, totalResults: 0 };
        }
    }

    // Helper to keep browseAnime clean and timeout-wrappable
    private async _executeBrowse(source: any, filters: any) {
        const page = filters.page || 1;
        const limit = filters.limit || 25;
        let isPaginatedResult = false;
        let totalResults = 0;
        let totalPages = 0;
        let hasNextPage = false;
        let finalResults: AnimeBase[] = [];

        // STRATEGY: Use source-native browse/filter capabilities first.
        // We avoid AniList for browsing because it often returns results without streaming matches.
        const canUseAniList = filters.source === 'AniList';

        if (canUseAniList) {
            logger.info(`[SourceManager] Using AniList-only strategy for browse`, filters);
            try {
                // Build lookup table lazily
                this.buildStreamingLookupTable();

                let anilistResult;

                // Case 1: Genre search
                if (filters.genres && filters.genres.length > 0) {
                    const genreQuery = filters.genres.join(',');
                    anilistResult = await anilistService.searchByGenre(genreQuery, page, limit, filters);
                }
                // Case 2: General Search / Browse (with Year, Type, Sort)
                else {
                    // Map our sorts to AniList sorts
                    let sort = 'TRENDING_DESC'; // default
                    switch (filters.sort) {
                        case 'popularity': sort = 'POPULARITY_DESC'; break;
                        case 'trending': sort = 'TRENDING_DESC'; break;
                        case 'recently_released': sort = 'START_DATE_DESC'; break; // Approximate
                        case 'rating': sort = 'SCORE_DESC'; break;
                        case 'year': sort = 'START_DATE_DESC'; break;
                        case 'title': sort = 'TITLE_ENGLISH_DESC'; break;
                        case 'episodes': sort = 'EPISODES_DESC'; break;
                    }

                    anilistResult = await anilistService.advancedSearch({
                        page,
                        perPage: limit,
                        sort: [sort],
                        type: filters.type?.toUpperCase(),
                        status: filters.status?.toUpperCase(),
                        season: filters.season?.toUpperCase(),
                        year: filters.year,
                        yearGreater: filters.startYear,
                        yearLesser: filters.endYear,
                        format: filters.type ? filters.type.toUpperCase() : undefined
                    });
                }

                if (anilistResult?.results && anilistResult.results.length > 0) {
                    // Enrich with streaming IDs - ONLY include results that have valid streaming sources
                    const enrichedResults: AnimeBase[] = [];

                    for (const anime of anilistResult.results) {
                        const match = this.findStreamingMatchInstant(anime.title);
                        if (match) {
                            // Has streaming source - include it
                            enrichedResults.push({
                                ...match,
                                genres: anime.genres,
                                rating: anime.rating || match.rating,
                                year: anime.year || match.year,
                                streamingId: match.id,
                                source: 'HiAnimeDirect'
                            });
                        }
                        // REMOVED: No longer include AniList-only results without streaming IDs
                        // Users need to be able to actually watch the anime from browse results
                    }

                    // Apply content mode filtering to AniList results
                    const mode = filters.mode || 'mixed';
                    const adultGenres = ['hentai', 'ecchi', 'yaoi', 'yuri'];
                    let filteredResults = enrichedResults;

                    if (mode === 'safe') {
                        filteredResults = enrichedResults.filter(a => {
                            if (!a.genres || a.genres.length === 0) return true;
                            return !a.genres.some(g => adultGenres.includes(g.toLowerCase()));
                        });
                    } else if (mode === 'adult') {
                        filteredResults = enrichedResults.filter(a => {
                            if (!a.genres || a.genres.length === 0) return false;
                            return a.genres.some(g => adultGenres.includes(g.toLowerCase()));
                        });
                    }

                    finalResults = filteredResults;
                    totalResults = anilistResult.totalResults || 5000;
                    totalPages = anilistResult.totalPages || 100;
                    hasNextPage = anilistResult.hasNextPage;
                    isPaginatedResult = true;

                    logger.info(`[SourceManager] AniList browse success: ${finalResults.length} items (Page ${page})`);
                }
            } catch (e) {
                logger.warn(`[SourceManager] AniList browse strategy failed`, { error: String(e) });
            }
        }


        // Fallback: Use local scraping or source-native filter
        if (!isPaginatedResult) {
            logger.info(`[SourceManager] Using source-native strategy for browse with ${source.name}`);
            const allAnime: AnimeBase[] = [];
            const sortType = filters.sort || 'popularity';

            // Special Case 1: Genre-only browsing with source support
            if (filters.genres && filters.genres.length > 0 && typeof (source as any).getByGenre === 'function') {
                try {
                    const genre = filters.genres[0];
                    const genreResult = await (source as any).getByGenre(genre, page);
                    if (genreResult.results && genreResult.results.length > 0) {
                        finalResults = genreResult.results;
                        totalResults = genreResult.totalResults || 1000;
                        totalPages = genreResult.totalPages || 100; // Boosted as requested
                        hasNextPage = genreResult.hasNextPage;
                        isPaginatedResult = true;
                        logger.info(`[SourceManager] Genre browse success via ${source.name} for genre: ${genre}`);
                    }
                } catch (e) {
                    logger.warn(`[SourceManager] Genre browse failed on ${source.name}, falling back to type or trending`);
                }
            }

            // Special Case 2: Type-only browsing with source support
            if (!isPaginatedResult && filters.type && typeof (source as any).getByType === 'function') {
                try {
                    const typeResult = await (source as any).getByType(filters.type, page);
                    if (typeResult.results && typeResult.results.length > 0) {
                        finalResults = typeResult.results;
                        totalResults = typeResult.totalResults || 1000;
                        totalPages = typeResult.totalPages || 100; // Boosted as requested
                        hasNextPage = typeResult.hasNextPage;
                        isPaginatedResult = true;
                        logger.info(`[SourceManager] Type browse success via ${source.name} for type: ${filters.type}`);
                    }
                } catch (e) {
                    logger.warn(`[SourceManager] Type browse failed on ${source.name}, falling back to trending`);
                }
            }

            // Normal Case: Trending / Popular / Latest + Local Filtering
            // Use MULTI-SOURCE aggregation for better results and streaming coverage
            if (!isPaginatedResult) {
                // Get backup sources to aggregate from - prioritize reliable streaming sources
                const backupSourceNames = [
                    'HiAnimeDirect', 'HiAnime', 'Gogoanime', 'Zoro', 'AnimePahe', '9Anime'
                ].filter(n => n !== source.name);
                const backupSources = backupSourceNames
                    .map(n => this.sources.get(n))
                    .filter(s => s?.isAvailable) as StreamingSource[];
                
                logger.info(`[SourceManager] Multi-source browse: primary=${source.name}, backups=${backupSources.map(s => s.name).join(',')}`);

                // Fetch from primary source and backups in parallel
                const fetchPromises: Promise<AnimeBase[]>[] = [];
                
                // Primary source - fetch multiple pages
                const pagesToFetch = sortType === 'shuffle' ? 3 : 2;
                for (let i = 0; i < pagesToFetch; i++) {
                    fetchPromises.push(
                        (async () => {
                            try {
                                switch (sortType) {
                                    case 'trending':
                                        return await source.getTrending(page + i);
                                    case 'recently_released':
                                        return await source.getLatest(page + i);
                                    case 'popularity':
                                    case 'shuffle':
                                    default:
                                        return await source.getTrending(page + i);
                                }
                            } catch { return []; }
                        })()
                    );
                }

                // Backup sources - fetch 1 page each for variety
                for (const backup of backupSources.slice(0, 2)) {
                    fetchPromises.push(
                        (async () => {
                            try {
                                switch (sortType) {
                                    case 'recently_released':
                                        return await backup.getLatest(page);
                                    default:
                                        return await backup.getTrending(page);
                                }
                            } catch { return []; }
                        })()
                    );
                }

                // Wait for all fetches with timeout
                const results = await Promise.race([
                    Promise.all(fetchPromises),
                    new Promise<AnimeBase[][]>((_, reject) => 
                        setTimeout(() => reject(new Error('Multi-source fetch timeout')), 12000)
                    )
                ]).catch(() => [[]]);

                // Combine all results
                for (const pageData of results) {
                    if (pageData && pageData.length > 0) allAnime.push(...pageData);
                }

                // Remove duplicates using normalized titles (better cross-source deduplication)
                const normalizeTitle = (title: string): string => {
                    return title
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '')
                        .replace(/season\d+/g, '')
                        .replace(/part\d+/g, '')
                        .trim();
                };
                
                const seen = new Map<string, AnimeBase>();
                for (const anime of allAnime) {
                    const key = normalizeTitle(anime.title || '');
                    const existing = seen.get(key);
                    
                    if (!existing) {
                        seen.set(key, anime);
                    } else {
                        // Keep the one with better data (more info, higher rating)
                        const existingScore = (existing.rating || 0) + (existing.episodes || 0) + (existing.image ? 10 : 0);
                        const newScore = (anime.rating || 0) + (anime.episodes || 0) + (anime.image ? 10 : 0);
                        if (newScore > existingScore) {
                            seen.set(key, anime);
                        }
                    }
                }
                const uniqueAnime = Array.from(seen.values());
                let filtered = [...uniqueAnime];

                // Apply local filters (Type, Status, Year, etc.)
                if (filters.type) {
                    filtered = filtered.filter(a => a.type?.toLowerCase() === filters.type?.toLowerCase());
                }
                if (filters.status) {
                    filtered = filtered.filter(a => a.status?.toLowerCase() === filters.status?.toLowerCase());
                }
                if (filters.year) {
                    filtered = filtered.filter(a => a.year === filters.year);
                }
                // Genres (local filter)
                if (filters.genres && filters.genres.length > 0) {
                    filtered = filtered.filter(a => {
                        if (!a.genres || a.genres.length === 0) return false;
                        return filters.genres!.some((g: string) =>
                            a.genres!.some(ag => ag.toLowerCase().includes(g.toLowerCase()))
                        );
                    });
                }

                // Content mode filtering
                const mode = filters.mode || 'mixed';
                const adultGenres = ['hentai', 'ecchi', 'yaoi', 'yuri'];

                if (mode === 'safe') {
                    // Exclude adult content
                    filtered = filtered.filter(a => {
                        if (!a.genres || a.genres.length === 0) return true;
                        return !a.genres.some(g => adultGenres.includes(g.toLowerCase()));
                    });
                } else if (mode === 'adult') {
                    // Only show adult content
                    filtered = filtered.filter(a => {
                        if (!a.genres || a.genres.length === 0) return false;
                        return a.genres.some(g => adultGenres.includes(g.toLowerCase()));
                    });
                }
                // mixed mode: show everything (no filtering)

                // Shuffle or Sort
                if (sortType === 'shuffle') {
                    const seed = Date.now();
                    const random = (i: number) => {
                        const x = Math.sin(seed + i) * 10000;
                        return x - Math.floor(x);
                    };
                    for (let i = filtered.length - 1; i > 0; i--) {
                        const j = Math.floor(random(i) * (i + 1));
                        [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
                    }
                } else if (sortType === 'recently_released') {
                    filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
                }

                // Paginate
                const startIndex = (page - 1) * limit;
                finalResults = filtered.slice(startIndex, startIndex + limit);
                totalResults = filtered.length;
                totalPages = Math.ceil(totalResults / limit) || 1;
                hasNextPage = startIndex + limit < totalResults;
            }
        }

        // CRITICAL: Filter out any results that don't have valid streaming IDs
        // Users must be able to actually watch anime from browse results
        const streamableResults = finalResults.filter(anime => {
            // Must have an ID
            if (!anime.id) return false;
            
            // Reject pure AniList IDs without streaming capability
            if (anime.id.startsWith('anilist-') && !anime.streamingId) {
                return false;
            }
            
            // Must have a known streaming source prefix OR be from a streaming source
            const hasStreamingPrefix = this.hasKnownSourcePrefix(anime.id);
            const isFromStreamingSource = anime.source && !['AniList', 'MAL'].includes(anime.source);
            
            return hasStreamingPrefix || isFromStreamingSource || anime.streamingId;
        });

        logger.info(`[SourceManager] Browse filtered: ${finalResults.length} -> ${streamableResults.length} streamable results`);

        return {
            anime: streamableResults,
            totalPages,
            hasNextPage,
            totalResults: streamableResults.length
        };
    }

    // ============ STREAMING METHODS ============

    /**
     * Get available servers for a specific episode
     * Uses PARALLEL multi-source querying for maximum reliability
     */
    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const timer = new PerformanceTimer(`Get servers: ${episodeId}`, { episodeId });
        const startTime = Date.now();

        console.log(`🖥️ [SourceManager] getEpisodeServers called: ${episodeId}`);

        // Determine primary source from episode ID
        const primarySource = this.getStreamingSource(episodeId);
        const hasSourcePrefix = this.hasKnownSourcePrefix(episodeId);
        
        console.log(`   📡 Primary source: ${primarySource?.name || 'none'}, Has prefix: ${hasSourcePrefix}`);

        // Default servers if nothing works
        const defaultServers: EpisodeServer[] = [
            { name: 'hd-1', url: '', type: 'sub' },
            { name: 'hd-2', url: '', type: 'sub' }
        ];

        // If no known prefix, ONLY use primary source
        if (!hasSourcePrefix) {
            if (!primarySource?.isAvailable || !primarySource.getEpisodeServers) {
                console.log(`   ⚠️ No primary source with getEpisodeServers, returning defaults`);
                timer.end();
                return defaultServers;
            }
            
            try {
                console.log(`   ⏳ Trying primary source ${primarySource.name}`);
                const servers = await this.executeReliably(primarySource.name, 'getEpisodeServers',
                    (signal) => primarySource.getEpisodeServers!(episodeId, { signal }),
                    { timeout: 10000 }
                );
                if (servers && servers.length > 0) {
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ Got ${servers.length} servers from ${primarySource.name} in ${duration}ms`);
                    timer.end();
                    return servers;
                }
            } catch (err) {
                console.log(`   ❌ Primary source failed: ${(err as Error).message}`);
            }
            
            timer.end();
            return defaultServers;
        }

        // Has known prefix - can try a couple backup sources
        const rawId = this.extractRawId(episodeId);
        const sourcesToTry: StreamingSource[] = [];
        
        if (primarySource?.isAvailable && primarySource.getEpisodeServers) {
            sourcesToTry.push(primarySource);
        }

        // Add limited backup sources
        const backupNames = ['HiAnimeDirect', 'HiAnime'].filter(n => n !== primarySource?.name);
        for (const name of backupNames) {
            const source = this.sources.get(name) as StreamingSource;
            if (source?.isAvailable && source.getEpisodeServers) {
                sourcesToTry.push(source);
            }
        }

        // Try sources sequentially (servers are fast, no need for parallel)
        for (const source of sourcesToTry) {
            const idToUse = source === primarySource ? episodeId : this.buildSourceId(rawId, source.name);
            try {
                const servers = await this.executeReliably(source.name, 'getEpisodeServers',
                    (signal) => source.getEpisodeServers!(idToUse, { signal }),
                    { timeout: 8000 }
                );
                if (servers && servers.length > 0) {
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ Got ${servers.length} servers from ${source.name} in ${duration}ms`);
                    timer.end();
                    return servers;
                }
            } catch (err) {
                console.log(`   ❌ ${source.name} failed: ${(err as Error).message}`);
            }
        }

        timer.end();
        return defaultServers;
    }

    /**
     * Get streaming links for an episode
     * Uses PARALLEL multi-source querying for maximum reliability
     * Queries multiple sources simultaneously and returns the first successful result
     */
    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub'): Promise<StreamingData> {
        const timer = new PerformanceTimer(`Get streaming links: ${episodeId}`, { episodeId, server, category });
        const startTime = Date.now();
        
        console.log(`🎬 [SourceManager] getStreamingLinks called: ${episodeId} (server: ${server}, category: ${category})`);
        logger.streamingStart('unknown', episodeId, 'multi-source', { server, category });

        // Determine primary source from episode ID
        const primarySource = this.getStreamingSource(episodeId);
        console.log(`   📡 Primary source: ${primarySource?.name || 'none'}`);
        
        // Check if the ID has a known source prefix - if not, only use primary source
        const hasSourcePrefix = this.hasKnownSourcePrefix(episodeId);
        const rawId = this.extractRawId(episodeId);
        console.log(`   🔑 Has source prefix: ${hasSourcePrefix}, Raw ID: ${rawId}`);
        
        // Build list of sources to try - primary first, then all available sources
        const isAdultContent = episodeId.toLowerCase().startsWith('hh-') || 
                              episodeId.toLowerCase().startsWith('hanime-') ||
                              episodeId.toLowerCase().startsWith('watchhentai-');

        const sourcesToTry: StreamingSource[] = [];
        
        // Add primary source first if available
        if (primarySource?.isAvailable && primarySource.getStreamingLinks) {
            sourcesToTry.push(primarySource);
        }

        // Only add backup sources if the ID has a known prefix (can be converted)
        // Limit to reliable sources only to avoid slowdowns
        if (hasSourcePrefix) {
            const backupNames = ['HiAnimeDirect', 'HiAnime', 'Gogoanime'].filter(n => n !== primarySource?.name);
            for (const name of backupNames) {
                if (isAdultContent && name !== 'WatchHentai') continue;
                if (!isAdultContent && name === 'WatchHentai') continue;
                
                const source = this.sources.get(name) as StreamingSource;
                if (source?.isAvailable && source.getStreamingLinks) {
                    sourcesToTry.push(source);
                }
            }
        }

        console.log(`   📋 Sources to try: ${sourcesToTry.map(s => s.name).join(', ')}`);

        if (sourcesToTry.length === 0) {
            console.log(`   ❌ No available sources for streaming`);
            logger.warn(`No available sources for streaming: ${episodeId}`, { episodeId }, 'SourceManager');
            timer.end();
            return { sources: [], subtitles: [] };
        }

        // Try PRIMARY source FIRST with original ID (fast path)
        if (primarySource?.isAvailable && primarySource.getStreamingLinks) {
            try {
                console.log(`   ⏳ Trying primary source ${primarySource.name} with ID: ${episodeId}`);
                const data = await this.executeReliably(primarySource.name, 'getStreamingLinks', 
                    (signal) => primarySource.getStreamingLinks!(episodeId, server, category, { signal }),
                    { timeout: 12000 }
                );
                if (data.sources.length > 0) {
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ Got ${data.sources.length} sources from ${primarySource.name} in ${duration}ms`);
                    logger.streamingSuccess('unknown', episodeId, primarySource.name, 
                        data.sources[0]?.quality || 'unknown', duration);
                    timer.end();
                    return data;
                }
                console.log(`   ⚠️ Primary source returned no sources`);
            } catch (err) {
                console.log(`   ❌ Primary source failed: ${(err as Error).message}`);
            }
        }

        // If primary failed and we have other sources to try, try them in parallel
        const otherSources = sourcesToTry.filter(s => s !== primarySource).slice(0, 3);
        if (otherSources.length > 0 && hasSourcePrefix) {
            console.log(`   🔄 Trying ${otherSources.length} fallback sources in parallel`);
            logger.sourceAggregation('getStreamingLinks', otherSources.map(s => s.name), { episodeId, rawId, server, category });

            const results = await Promise.allSettled(
                otherSources.map(source => {
                    const idToUse = this.buildSourceId(rawId, source.name);
                    console.log(`   📡 ${source.name} trying with ID: ${idToUse}`);
                    
                    return this.executeReliably(source.name, 'getStreamingLinks', 
                        (signal) => source.getStreamingLinks!(idToUse, server, category, { signal }),
                        { timeout: 10000 }
                    )
                    .then(data => {
                        const duration = Date.now() - startTime;
                        if (data.sources.length > 0) {
                            console.log(`   ✅ ${source.name} returned ${data.sources.length} sources`);
                            logger.sourceResult(source.name, 'getStreamingLinks', data.sources.length, duration);
                            return { source: source.name, data, success: true };
                        }
                        return { source: source.name, data: null, success: false };
                    })
                    .catch(err => {
                        console.log(`   ❌ ${source.name} failed: ${err.message}`);
                        return { source: source.name, data: null, success: false };
                    });
                })
            );

            // Find the first successful result
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value.success && result.value.data) {
                    const duration = Date.now() - startTime;
                    logger.streamingSuccess('unknown', episodeId, result.value.source, 
                        result.value.data.sources[0]?.quality || 'unknown', duration);
                    timer.end();
                    return result.value.data;
                }
            }
        }

        timer.end();
        console.log(`   ❌ No sources found after trying all available sources`);
        logger.streamingFailed('unknown', episodeId, 'all-sources', 'No sources returned streaming URLs');

        return { sources: [], subtitles: [] };
    }

    async searchAll(query: string, page: number = 1): Promise<AnimeSearchResult> {
        try {
            logger.info(`Starting search for "${query}"(page ${page})`, undefined, 'SourceManager');

            const results: AnimeBase[] = [];
            let totalPages = 0;
            let hasNextPage = false;
            const workingSources: string[] = [];
            const failedSources: string[] = [];
            const sourceErrors: Array<{ source: string, error: string }> = [];

            // Try each source in order until we get results
            for (const sourceName of this.sourceOrder) {
                const source = this.sources.get(sourceName);
                if (!source) continue;

                try {
                    const sourceResults = await this.search(query, page, sourceName);
                    if (sourceResults.results.length > 0) {
                        results.push(...sourceResults.results);
                        workingSources.push(sourceName);
                        totalPages = Math.max(totalPages, sourceResults.totalPages);
                        hasNextPage = hasNextPage || sourceResults.hasNextPage;

                        logger.info(`Got ${sourceResults.results.length} results from ${sourceName} `, undefined, 'SourceManager');

                        // If we have enough results, stop searching
                        if (results.length >= 20) break;
                    } else {
                        failedSources.push(sourceName);
                        logger.warn(`No results from ${sourceName} `, undefined, 'SourceManager');
                    }
                } catch (error) {
                    failedSources.push(sourceName);
                    sourceErrors.push({ source: sourceName, error: (error as Error).message });
                    logger.error(`Search failed on ${sourceName}: ${(error as Error).message} `, error as Error, undefined, 'SourceManager');
                }
            }

            if (results.length === 0) {
                // Enhanced logging for failed searches
                logger.error(`❌ SEARCH FAILED: No results found for "${query}" from any source`, new Error('Search failed'), undefined, 'SourceManager');
                logger.error(`📊 Search Statistics: `, new Error('No results'), undefined, 'SourceManager');
                logger.error(`   - Query: "${query}"`, new Error('Query info'), undefined, 'SourceManager');
                logger.error(`   - Page: ${page} `, new Error('Page info'), undefined, 'SourceManager');
                logger.error(`   - Available sources: ${this.sourceOrder.join(', ')} `, new Error('Sources info'), undefined, 'SourceManager');
                logger.error(`   - Failed sources: ${failedSources.join(', ')} `, new Error('Failed sources'), undefined, 'SourceManager');

                // Log specific errors for each failed source
                sourceErrors.forEach(({ source, error }) => {
                    logger.error(`   - ${source}: ${error} `, new Error(error), undefined, 'SourceManager');
                });

                // Log suggestions
                logger.info(`💡 Suggestions for failed search: `, undefined, 'SourceManager');
                logger.info(`   - Check if query is spelled correctly`, undefined, 'SourceManager');
                logger.info(`   - Try alternative search terms`, undefined, 'SourceManager');
                logger.info(`   - Some sources may be temporarily unavailable`, undefined, 'SourceManager');

            } else {
                logger.info(`✅ Search successful: ${results.length} results from sources: ${workingSources.join(', ')} `, undefined, 'SourceManager');
            }

            return {
                results,
                totalPages,
                currentPage: page,
                hasNextPage,
                source: workingSources.join('+')
            };
        } catch (error) {
            logger.error(`❌ SEARCH CRITICAL ERROR: ${(error as Error).message} `, error as Error, undefined, 'SourceManager');
            logger.error(`   Query: "${query}"`, new Error('Query info'), undefined, 'SourceManager');
            logger.error(`   Page: ${page} `, new Error('Page info'), undefined, 'SourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
        }
    }

    /**
     * Search anime by genre using AniList API (most accurate genre data)
     * Uses instant lookup table for fast matching with fallback to API search
     */
    async getAnimeByGenreAniList(genre: string, page: number = 1): Promise<AnimeSearchResult> {
        try {
            // Build lookup table on first genre search (lazy initialization)
            await this.buildStreamingLookupTable();

            const result = await anilistService.searchByGenre(genre, page, 50);
            logger.info(`[SourceManager] AniList genre search for "${genre}" returned ${result.results.length} results`);

            // Collect titles that need fallback search
            const titlesNeedingSearch: string[] = [];
            const titleToAnimeMap = new Map<string, AnimeBase>();

            // Process results with instant lookup (fast)
            const enrichedResults: AnimeBase[] = [];

            for (const anime of result.results) {
                // Find streaming match using pre-built table (O(1) lookup)
                const match = this.findStreamingMatchInstant(anime.title);

                if (match) {
                    // Found match in lookup table - use it
                    enrichedResults.push({
                        ...match,
                        genres: anime.genres,
                        rating: anime.rating || match.rating,
                        streamingId: match.id,
                        source: 'HiAnimeDirect'
                    });
                } else {
                    // No instant match - need to search via API
                    titlesNeedingSearch.push(anime.title);
                    titleToAnimeMap.set(anime.title, anime);
                    // Keep the AniList data temporarily
                    enrichedResults.push({
                        ...anime,
                        streamingId: undefined,
                        source: 'AniList'
                    });
                }
            }

            // If we have titles without matches, do batch search (limit to 10 to avoid timeout)
            if (titlesNeedingSearch.length > 0 && titlesNeedingSearch.length <= 10) {
                logger.info(`[SourceManager] Doing fallback search for ${titlesNeedingSearch.length} titles without instant match`);

                for (const title of titlesNeedingSearch) {
                    try {
                        const searchMatch = await this.findStreamingAnimeByTitle(title);
                        if (searchMatch) {
                            // Find and update the corresponding anime entry
                            const animeIndex = enrichedResults.findIndex(a => a.title === title);
                            if (animeIndex >= 0) {
                                const originalAnime = titleToAnimeMap.get(title)!;
                                enrichedResults[animeIndex] = {
                                    ...searchMatch,
                                    genres: originalAnime.genres,
                                    rating: originalAnime.rating || searchMatch.rating,
                                    streamingId: searchMatch.id,
                                    source: 'HiAnimeDirect'
                                };
                                logger.debug(`[SourceManager] Fallback search found match for: ${title} `);
                            }
                        }
                    } catch (e) {
                        logger.warn(`[SourceManager] Fallback search failed for: ${title} `);
                    }
                }
            } else if (titlesNeedingSearch.length > 10) {
                logger.warn(`[SourceManager] Skipping fallback search - too many titles(${titlesNeedingSearch.length})`);
            }

            const withStreamingIds = enrichedResults.filter(a => a.streamingId).length;
            const fromAniList = enrichedResults.filter(a => a.source === 'AniList').length;
            logger.info(`[SourceManager] Genre search complete: ${withStreamingIds}/${enrichedResults.length} have streaming IDs, ${fromAniList} are AniList-only`);

            return {
                ...result,
                results: enrichedResults
            };
        } catch (error) {
            logger.error(`AniList genre search failed for "${genre}"`, error as Error, undefined, 'SourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'AniList' };
        }
    }

    /**
     * Pre-built streaming lookup table for instant genre matching
     */
    private streamingLookupTable: Map<string, AnimeBase> = new Map();
    private streamingLookupBuilt = false;

    /**
     * Build streaming lookup table on first use (lazy initialization)
     */
    private async buildStreamingLookupTable(): Promise<void> {
        if (this.streamingLookupBuilt) return;

        logger.info(`[SourceManager] Building streaming lookup table...`);
        const start = Date.now();

        try {
            const source = this.getAvailableSource();
            if (!source) {
                logger.warn(`[SourceManager] No available source for lookup table`);
                return;
            }

            // Fetch multiple pages to build comprehensive table
            const allAnime: AnimeBase[] = [];
            // Fetch 10 pages of trending for good coverage (faster build)
            for (let page = 1; page <= 10; page++) {
                try {
                    const pageData = await source.getTrending(page);
                    if (pageData && pageData.length > 0) {
                        allAnime.push(...pageData);
                    }
                } catch (e) {
                    // Continue with what we have
                }
            }

            // Build lookup table with normalized titles
            for (const anime of allAnime) {
                // Add multiple normalized versions
                const normalized = this.normalizeTitle(anime.title);
                this.streamingLookupTable.set(normalized, anime);

                // Add common variations
                const altTitle = this.normalizeTitle(anime.titleJapanese || '');
                if (altTitle && altTitle !== normalized) {
                    this.streamingLookupTable.set(altTitle, anime);
                }

                // Add version without year suffix
                const noYear = normalized.replace(/\s*\(\d{4}\)$/, '').trim();
                if (noYear && noYear !== normalized) {
                    this.streamingLookupTable.set(noYear, anime);
                }

                // Add version without season info
                const noSeason = normalized.replace(/\s*season\s*\d*/i, '').trim();
                if (noSeason && noSeason !== normalized && noSeason.length > 5) {
                    this.streamingLookupTable.set(noSeason, anime);
                }
            }

            this.streamingLookupBuilt = true;
            const duration = Date.now() - start;
            logger.info(`[SourceManager] Built streaming lookup table with ${this.streamingLookupTable.size} entries in ${duration}ms`);
        } catch (error) {
            logger.warn(`[SourceManager] Failed to build streaming lookup table`, { error: String(error) });
        }
    }

    /**
     * Normalize title for consistent lookup with enhanced matching
     */
    private normalizeTitle(title: string): string {
        if (!title) return '';
        
        const normalized = title.toLowerCase()
            // Remove special characters but keep spaces and alphanumeric
            .replace(/[^\w\s]/g, ' ')
            // Replace multiple spaces with single space
            .replace(/\s+/g, ' ')
            // Remove common suffixes and type indicators
            .replace(/\s+(movie|ova|ona|special|tv|series)$/i, '')
            // Remove season information (various formats)
            .replace(/\s+(season|s)\s*\d+$/i, '')
            .replace(/\s+\d+(st|nd|rd|th)\s+season$/i, '')
            // Remove year information
            .replace(/\s*\(?\d{4}\)?\s*$/, '')
            // Remove part information
            .replace(/\s*-?\s*(part|cour)\s*\d+/i, '')
            // Remove episode/arc information
            .replace(/\s*-?\s*\d+(st|nd|rd|th)\s*(season|arc|cour)/i, '')
            // Remove "the" prefix
            .replace(/^the\s+/i, '')
            // Remove common prefixes
            .replace(/^(a\s+)/i, '')
            // Normalize roman numerals to numbers for better matching
            .replace(/\s+ii$/i, ' 2')
            .replace(/\s+iii$/i, ' 3')
            .replace(/\s+iv$/i, ' 4')
            .replace(/\s+v$/i, ' 5')
            // Normalize ordinal numbers
            .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
            // Trim and normalize whitespace
            .trim();
        
        return normalized;
    }

    /**
     * Find streaming match instantly using pre-built table
     */
    private findStreamingMatchInstant(title: string): AnimeBase | null {
        if (!title || !this.streamingLookupBuilt) return null;

        const normalized = this.normalizeTitle(title);

        // Direct lookup
        let match = this.streamingLookupTable.get(normalized);
        if (match) return match;

        // Try with common suffixes removed
        const variations = [
            normalized.replace(/\s+(movie|ova|ona|special)$/i, '').trim(),
            normalized.replace(/^(the\s+)/i, '').trim(),
            normalized.replace(/\s+(season\s*\d+)$/i, '').trim(),
            normalized.replace(/\s*\(\d{4}\)$/, '').trim(),
            normalized.replace(/\s*-?\s*part\s*\d*/i, '').trim(),
            normalized.replace(/\s*-?\s*\d+(st|nd|rd|th)\s*season/i, '').trim(),
        ];

        for (const variant of variations) {
            if (variant && variant !== normalized) {
                match = this.streamingLookupTable.get(variant);
                if (match) return match;
            }
        }

        return null;
    }

    /**
     * Find streaming match using search API (fallback for better matching)
     */
    private async findStreamingMatchSearch(title: string): Promise<AnimeBase | null> {
        try {
            const source = this.getAvailableSource();
            if (!source) return null;

            // Search for the title (get more results for better matching)
            const searchResult = await source.search(title, 3);

            // Find best match
            const bestMatch = this.findBestMatch(title, searchResult.results || []);
            return bestMatch;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get all trending anime from available sources for fast matching
     * This is used to build a lookup table for genre searches
     */
    private async getAllTrendingAnime(): Promise<AnimeBase[]> {
        const cacheKey = 'all-trending-anime';
        const cached = this.getCached<AnimeBase[]>(cacheKey);
        if (cached) return cached;

        try {
            const source = this.getAvailableSource();
            if (!source) return [];

            // Fetch multiple pages of trending anime to build a comprehensive lookup table
            const allAnime: AnimeBase[] = [];
            const pagesToFetch = 5; // Get 5 pages for better coverage

            for (let page = 1; page <= pagesToFetch; page++) {
                try {
                    const trending = await source.getTrending(page);
                    if (trending && trending.length > 0) {
                        allAnime.push(...trending);
                    }
                } catch (error) {
                    logger.warn(`Failed to fetch trending page ${page}`, undefined, 'SourceManager');
                    // Continue with other pages
                }
            }

            // Remove duplicates
            const uniqueAnime = Array.from(new Map(allAnime.map(a => [a.id, a])).values());

            // Cache for 10 minutes
            this.setCache(cacheKey, uniqueAnime, 10 * 60 * 1000);

            logger.info(`[SourceManager] Built streaming lookup table with ${uniqueAnime.length} anime`);
            return uniqueAnime;
        } catch (error) {
            logger.error('Failed to build streaming lookup table', error as Error, undefined, 'SourceManager');
            return [];
        }
    }

    /**
     * Generic cache methods for the optimized approach
     */
    private cache: Map<string, { data: unknown; timestamp: number; ttl: number }> = new Map();

    private getCached<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < cached.ttl) {
            return cached.data as T;
        }
        return null;
    }

    private setCache<T>(key: string, data: T, ttl: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    private searchCache: Map<string, { results: AnimeBase[]; timestamp: number }> = new Map();
    private readonly SEARCH_CACHE_TTL = 60 * 1000; // 1 minute cache

    /**
     * Calculate similarity between two strings (simple Levenshtein-based ratio)
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const s1 = str1.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
        const s2 = str2.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

        // Exact match after normalization
        if (s1 === s2) return 1.0;

        // Check if one contains the other
        if (s1.includes(s2) || s2.includes(s1)) {
            const shorter = s1.length < s2.length ? s1 : s2;
            const longer = s1.length < s2.length ? s2 : s1;
            return shorter.length / longer.length; // Ratio of containment
        }

        // Word-based matching
        const words1 = s1.split(/\s+/).filter(w => w.length > 2);
        const words2 = s2.split(/\s+/).filter(w => w.length > 2);

        if (words1.length === 0 || words2.length === 0) return 0;

        const matches = words1.filter(w =>
            words2.some(w2 => w.includes(w2) || w2.includes(w))
        );

        return matches.length / Math.max(words1.length, words2.length);
    }

    /**
     * Find the best matching anime from search results
     */
    private findBestMatch(title: string, results: AnimeBase[]): AnimeBase | null {
        if (!results || results.length === 0) return null;

        // If only one result and it's a close match, use it
        if (results.length === 1) {
            const similarity = this.calculateSimilarity(title, results[0].title);
            if (similarity > 0.5) {
                return results[0];
            }
            return null;
        }

        // Find best match
        let bestMatch: AnimeBase | null = null;
        let bestScore = 0;

        for (const anime of results) {
            const score = this.calculateSimilarity(title, anime.title);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = anime;
            }
        }

        // Only return if score is above threshold
        if (bestMatch && bestScore > 0.4) {
            return bestMatch;
        }

        return null;
    }

    /**
     * Batch search for multiple anime titles at once
     * More efficient than searching individually
     */
    async findStreamingAnimeByTitle(title: string): Promise<AnimeBase | null> {
        try {
            console.log(`🔎 [SourceManager] Finding streaming match for AniList title: "${title}"`);
            
            // Check cache first
            const cacheKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
            const cached = this.searchCache.get(cacheKey);
            if (cached && cached.timestamp > Date.now() - this.SEARCH_CACHE_TTL) {
                console.log(`   ✅ Using cached results for "${title}"`);
                return this.findBestMatch(title, cached.results);
            }

            // Prioritize HiAnime for title search (used for AniList resolution)
            let source = this.sources.get('HiAnimeDirect');
            if (!source || !source.isAvailable) {
                console.log(`   ⚠️ HiAnimeDirect not available, trying HiAnime...`);
                source = this.sources.get('HiAnime');
            }

            // Fallback to any available source if HiAnime is down
            if (!source || !source.isAvailable) {
                console.log(`   ⚠️ HiAnime sources not available, using fallback source...`);
                source = this.getAvailableSource() as any;
            }

            if (!source) {
                console.log(`   ❌ No sources available for title search`);
                return null;
            }
            
            console.log(`   📡 Using ${source.name} to search for "${title}"`);

            // Search with the title
            const searchResult = await this.executeReliably(source.name, 'search', (signal) => source!.search(title, 1, {}, { signal }), { timeout: 10000 });
            const results = searchResult.results || [];

            // Cache the results
            this.searchCache.set(cacheKey, {
                results,
                timestamp: Date.now()
            });

            const bestMatch = this.findBestMatch(title, results);

            if (bestMatch) {
                console.log(`   ✅ Found streaming match: ${bestMatch.title} (${bestMatch.id})`);
                logger.info(`[SourceManager] Found streaming match for "${title}": ${bestMatch.id}`);
                return bestMatch;
            }

            console.log(`   ❌ No streaming match found for "${title}"`);
            logger.debug(`[SourceManager] No streaming match found for: ${title}`);
            return null;
        } catch (error) {
            logger.warn(`[SourceManager] Failed to find streaming anime for "${title}":`, { error: String(error) });
            return null;
        }
    }

    /**
     * Clear the search cache
     */
    clearSearchCache(): void {
        this.searchCache.clear();
    }

    setPreferredSource(sourceName: string): boolean {
        if (this.sources.has(sourceName)) {
            this.primarySource = sourceName;
            // Move to front of order
            this.sourceOrder = [sourceName, ...this.sourceOrder.filter((s: string) => s !== sourceName)];
            return true;
        }
        return false;
    }

    // ============ GENRE & RANDOM METHODS ============

    /**
     * Get anime by genre
     * Uses search with genre query as fallback if source doesn't support genre filtering
     */
    async getAnimeByGenre(genre: string, page: number = 1, sourceName?: string): Promise<AnimeSearchResult> {
        const timer = new PerformanceTimer(`Genre: ${genre}`, { genre, page });
        const source = this.getAvailableSource(sourceName);

        if (!source) {
            logger.warn(`No available source for genre search`, { genre, page }, 'SourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
        }

        try {
            logger.sourceRequest(source.name, 'getAnimeByGenre', { genre, page });

            // Try to use genre-specific method if available
            const sourceSupportsGenre = (s: AnimeSource): s is GenreAwareSource => {
                return 'getByGenre' in s;
            };

            if (sourceSupportsGenre(source)) {
                const result = await this.executeReliably(source.name, 'getByGenre', (signal) => (source as GenreAwareSource).getByGenre(genre, page, { signal }));
                logger.sourceResponse(source.name, 'getByGenre', true, { resultCount: result.results?.length || 0 });
                timer.end();
                return result;
            }

            // Fallback: search by genre name
            logger.info(`Using search fallback for genre: ${genre}`, undefined, 'SourceManager');
            const result = await this.executeReliably(source.name, 'search', (signal) => source.search(genre, page, {}, { signal }));
            logger.sourceResponse(source.name, 'search (genre fallback)', true, { resultCount: result.results.length });
            timer.end();
            return result;
        } catch (error) {
            logger.error(`Genre search failed for ${source.name}`, error as Error, { genre, page }, 'SourceManager');
            // Try fallback
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                logger.failover(source.name, fallback.name, 'genre search failed', { genre, page });
                return this.getAnimeByGenre(genre, page, fallback.name);
            }
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
        }
    }

    /**
     * Get a random anime
     * Fetches trending anime and picks one at random
     */
    async getRandomAnime(sourceName?: string): Promise<AnimeBase | null> {
        const timer = new PerformanceTimer('Random anime', undefined);
        const source = this.getAvailableSource(sourceName);

        if (!source) {
            logger.warn(`No available source for random anime`, undefined, 'SourceManager');
            return null;
        }

        try {
            logger.sourceRequest(source.name, 'getRandomAnime', undefined);

            // Get trending anime (page 1-3 to have variety)
            const allAnime: AnimeBase[] = [];
            const pagesToTry = 3;

            for (let page = 1; page <= pagesToTry; page++) {
                try {
                    const trending = await this.executeReliably(source.name, 'getTrending', (signal) => source.getTrending(page, { signal }));
                    allAnime.push(...trending);
                    if (allAnime.length >= 30) break;
                } catch {
                    continue;
                }
            }

            if (allAnime.length === 0) {
                logger.warn(`No anime found for random selection`, undefined, 'SourceManager');
                timer.end();
                return null;
            }

            const randomIndex = Math.floor(Math.random() * allAnime.length);
            const randomAnime = allAnime[randomIndex];

            logger.sourceResponse(source.name, 'getRandomAnime', true, {
                totalOptions: allAnime.length,
                selectedIndex: randomIndex,
                selectedId: randomAnime.id
            });
            timer.end();
            return randomAnime;
        } catch (error) {
            logger.error(`Random anime failed for ${source.name}`, error as Error, undefined, 'SourceManager');
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                logger.failover(source.name, fallback.name, 'random anime failed', undefined);
                return this.getRandomAnime(fallback.name);
            }
            return null;
        }
    }
}

// Singleton instance
export const sourceManager = new SourceManager();


