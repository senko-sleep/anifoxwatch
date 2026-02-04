import {
    AnimeSource,
    HiAnimeDirectSource,
    HiAnimeSource,
    AniwatchSource,
    GogoanimeSource,
    ConsumetSource,
    NineAnimeSource,
    AniwaveSource,
    WatchHentaiSource
} from '../sources/index.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime, SourceHealth, BrowseFilters } from '../types/anime.js';
import { GenreAwareSource } from '../sources/base-source.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';
import { logger, PerformanceTimer, createRequestContext } from '../utils/logger.js';
import { anilistService } from './anilist-service.js';

interface StreamingSource extends AnimeSource {
    getStreamingLinks?(episodeId: string, server?: string, category?: 'sub' | 'dub'): Promise<StreamingData>;
    getEpisodeServers?(episodeId: string): Promise<EpisodeServer[]>;
    getAnimeInfo?(id: string): Promise<AnimeBase>;
}

/**
 * SourceManager handles multiple anime streaming sources
 * Features:
 * - Automatic fallback if a source fails
 * - Priority-based source selection
 * - Health monitoring with auto-recovery
 * - Aggregation of results from multiple sources
 * - Smart caching for performance
 */
export class SourceManager {
    private sources: Map<string, StreamingSource> = new Map();
    private primarySource: string = 'HiAnimeDirect';
    private healthStatus: Map<string, SourceHealth> = new Map();
    private sourceOrder: string[] = ['HiAnimeDirect', 'HiAnime', 'Gogoanime', '9Anime', 'Aniwave', 'Aniwatch', 'Consumet', 'WatchHentai'];

    // Concurrency control for API requests with better reliability
    private globalActiveRequests = 0;
    private maxGlobalConcurrent = 8; // Increased from 6 to 8 for better throughput
    private requestQueue: Array<{
        fn: () => Promise<unknown>;
        resolve: (v: unknown) => void;
        reject: (e: unknown) => void;
        timeout: NodeJS.Timeout;
    }> = [];

    // Rate limiting by source
    private sourceRequestCounts = new Map<string, number>();
    private sourceRateLimits = new Map<string, { limit: number; resetTime: number }>();

    constructor() {
        // Register streaming sources in priority order
        // HiAnimeDirect is primary (uses aniwatch package directly for deep scraping)
        this.registerSource(new HiAnimeDirectSource());
        // HiAnime as secondary (uses external APIs)
        this.registerSource(new HiAnimeSource());
        // Gogoanime as fallback (direct scraping)
        this.registerSource(new GogoanimeSource());
        // Other fallbacks (may not work without self-hosted API)
        this.registerSource(new NineAnimeSource());
        this.registerSource(new AniwaveSource());
        this.registerSource(new AniwatchSource());
        this.registerSource(new ConsumetSource());
        // Adult Sources - WatchHentai (Deep Scraping)
        this.registerSource(new WatchHentaiSource());

        // Configure rate limits for each source (requests per minute)
        this.sourceRateLimits.set('HiAnimeDirect', { limit: 100, resetTime: 60000 });
        this.sourceRateLimits.set('HiAnime', { limit: 100, resetTime: 60000 });
        this.sourceRateLimits.set('Gogoanime', { limit: 100, resetTime: 60000 });
        this.sourceRateLimits.set('9Anime', { limit: 50, resetTime: 60000 });
        this.sourceRateLimits.set('Aniwave', { limit: 50, resetTime: 60000 });
        this.sourceRateLimits.set('Aniwatch', { limit: 50, resetTime: 60000 });
        this.sourceRateLimits.set('Consumet', { limit: 30, resetTime: 60000 });
        this.sourceRateLimits.set('WatchHentai', { limit: 20, resetTime: 60000 });

        // Start health monitoring
        this.startHealthMonitor();

        logger.info(`Initialized with ${this.sources.size} sources`, undefined, 'SourceManager');
        logger.info(`Priority order: ${this.sourceOrder.join(' → ')}`, undefined, 'SourceManager');
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
        // Note: setInterval is not allowed in Cloudflare Workers global scope
        // Health checks will only run when explicitly called
        logger.info('Health monitoring initialized (manual checks only)', undefined, 'SourceManager');
    }

    private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                const error = new Error(`${context} timed out after ${timeoutMs}ms`);
                logger.requestTimeout(context, timeoutMs);
                setTimeout(() => reject(error), timeoutMs);
            })
        ]);
    }

    async checkAllHealth(): Promise<Map<string, SourceHealth>> {
        const timer = new PerformanceTimer('Health check', undefined, 'SourceManager');

        const checks = Array.from(this.sources.entries()).map(async ([name, source]) => {
            const start = Date.now();
            try {
                const isHealthy = await Promise.race([
                    source.healthCheck(),
                    new Promise<boolean>((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 5000)
                    )
                ]);

                const latency = Date.now() - start;
                this.healthStatus.set(name, {
                    name,
                    status: isHealthy ? 'online' : 'offline',
                    latency,
                    lastCheck: new Date()
                });

                source.isAvailable = isHealthy;
                logger.healthCheck(name, isHealthy, latency, undefined);
            } catch (error) {
                const latency = Date.now() - start;
                this.healthStatus.set(name, {
                    name,
                    status: 'offline',
                    latency,
                    lastCheck: new Date()
                });
                source.isAvailable = false;
                logger.healthCheck(name, false, latency, undefined);
            }
        });

        await Promise.all(checks);

        // Log health status
        const online = Array.from(this.healthStatus.values()).filter(s => s.status === 'online');
        const context = { online: online.length, total: this.sources.size };
        logger.info(`Health check complete: ${online.length}/${this.sources.size} sources online`, context, 'SourceManager');

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
                logger.warn(`Requested source ${sourceName} not available`, { query }, 'SourceManager');
                return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
            }
            try {
                const result = await this.executeWithTimeout(source.search(query, page), 15000, `Search ${sourceName}`);
                timer.end();
                return result;
            } catch (error) {
                logger.error(`Search failed with source ${sourceName}`, error as Error, { query });
                throw error;
            }
        }

        // Multi-source search for robustness (Top 3 sources)
        const sourcesToTry = this.sourceOrder
            .filter(name => name !== 'WatchHentai') // Exclude adult sources
            .map(name => this.sources.get(name))
            .filter(source => source && source.isAvailable)
            .slice(0, 3) as StreamingSource[]; // Use top 3 available sources

        if (sourcesToTry.length === 0) {
            logger.warn(`No available sources for search`, { query }, 'SourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
        }

        try {
            logger.info(`Starting multi-source search with: ${sourcesToTry.map(s => s.name).join(', ')}`, { query });

            const searchPromises = sourcesToTry.map(source =>
                this.executeWithTimeout(source.search(query, page), 15000, `Search ${source.name}`)
                    .then(res => ({ ...res, sourceName: source.name }))
                    .catch(error => {
                        logger.warn(`Search failed on ${source.name}: ${error.message}`);
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
                }
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
                source: successfulSources.join('+') || 'None'
            };

        } catch (error) {
            logger.error(`Multi-source search failed`, error as Error, { query });
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
        }
    }

    /**
     * Deduplicate anime results based on ID and title similarity
     */
    private deduplicateResults(results: AnimeBase[]): AnimeBase[] {
        const unique = new Map<string, AnimeBase>();
        const titles = new Set<string>();

        for (const anime of results) {
            // Check ID
            if (unique.has(anime.id)) continue;

            // Check title similarity (simple normalization)
            const normalizedTitle = this.normalizeTitle(anime.title);
            if (titles.has(normalizedTitle)) continue;

            unique.set(anime.id, anime);
            titles.add(normalizedTitle);
        }

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
            return await source.getAnime(id);
        } catch (error) {
            console.error(`[SourceManager] getAnime failed:`, error);
            return null;
        }
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const source = this.getStreamingSource(animeId);
        if (!source) return [];

        try {
            return await source.getEpisodes(animeId);
        } catch (error) {
            console.error(`[SourceManager] getEpisodes failed:`, error);
            return [];
        }
    }

    async getTrending(page: number = 1, sourceName?: string): Promise<AnimeBase[]> {
        const source = this.getAvailableSource(sourceName);
        if (!source) return [];

        try {
            return await source.getTrending(page);
        } catch (error) {
            source.isAvailable = false;
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                return fallback.getTrending(page);
            }
            return [];
        }
    }

    async getLatest(page: number = 1, sourceName?: string): Promise<AnimeBase[]> {
        const source = this.getAvailableSource(sourceName);
        if (!source) return [];

        try {
            return await source.getLatest(page);
        } catch (error) {
            source.isAvailable = false;
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                return fallback.getLatest(page);
            }
            return [];
        }
    }

    async getTopRated(page: number = 1, limit: number = 10, sourceName?: string): Promise<TopAnime[]> {
        const source = this.getAvailableSource(sourceName);
        if (!source) return [];

        try {
            return await source.getTopRated(page, limit);
        } catch (error) {
            source.isAvailable = false;
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                return fallback.getTopRated(page, limit);
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
                    const trending = await this.executeWithTimeout(source.getTrending(page + i), 10000, `Trending ${source.name} page ${page + i}`);
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
                    // Enrich with streaming IDs
                    const enrichedResults: AnimeBase[] = [];

                    for (const anime of anilistResult.results) {
                        const match = this.findStreamingMatchInstant(anime.title);
                        if (match) {
                            enrichedResults.push({
                                ...match,
                                genres: anime.genres,
                                rating: anime.rating || match.rating,
                                year: anime.year || match.year,
                                streamingId: match.id,
                                source: 'HiAnimeDirect'
                            });
                        } else {
                            // If we use AniList strategy explicitly, we still return them even without instant match
                            // they will be resolved via search on the details page.
                            enrichedResults.push({
                                ...anime,
                                streamingId: undefined,
                                source: 'AniList',
                                id: `anilist-${anime.id}`
                            });
                        }
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
            if (!isPaginatedResult) {
                // Determine how many pages to fetch to have enough data for filtering
                const pagesToFetch = sortType === 'shuffle' ? 5 : 4;

                // Fetch anime based on primary sort type
                for (let i = 0; i < pagesToFetch; i++) {
                    try {
                        let pageData: AnimeBase[] = [];
                        // Use the specific source logic
                        switch (sortType) {
                            case 'trending':
                                pageData = await source.getTrending(page + i);
                                break;
                            case 'recently_released':
                                pageData = await source.getLatest(page + i);
                                break;
                            case 'popularity':
                            case 'shuffle':
                            default:
                                pageData = await source.getTrending(page + i);
                                break;
                        }
                        if (pageData && pageData.length > 0) allAnime.push(...pageData);
                        if (allAnime.length >= 100) break;
                    } catch { break; }
                }

                // Remove duplicates
                const uniqueAnime = Array.from(new Map(allAnime.map(a => [a.id, a])).values());
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

        return {
            anime: finalResults,
            totalPages,
            hasNextPage,
            totalResults
        };
    }

    // ============ STREAMING METHODS ============

    /**
     * Get available servers for a specific episode
     * Tries sources in priority order with automatic failover
     */
    async getEpisodeServers(episodeId: string): Promise<EpisodeServer[]> {
        const timer = new PerformanceTimer(`Get servers: ${episodeId}`, { episodeId });

        // Determine source from episode ID
        const source = this.getStreamingSource(episodeId);

        if (source && source.getEpisodeServers) {
            try {
                logger.sourceRequest(source.name, 'getEpisodeServers', { episodeId });
                const servers = await source.getEpisodeServers(episodeId);
                logger.sourceResponse(source.name, 'getEpisodeServers', true, { serverCount: servers.length });
                timer.end();
                if (servers.length > 0) return servers;
            } catch (error) {
                logger.error(`getEpisodeServers failed for ${source.name}`, error as Error, { episodeId }, 'SourceManager');
            }
        }

        // Try other sources in priority order
        const isHentaiHavenId = episodeId.toLowerCase().startsWith('hh-');
        const isHanimeId = episodeId.toLowerCase().startsWith('hanime-');

        for (const name of this.sourceOrder) {
            // Skip incompatible fallback sources for specialized IDs
            if (isHentaiHavenId && name !== 'HentaiHaven') continue;
            if (isHanimeId && name !== 'Hanime') continue;

            const fallbackSource = this.sources.get(name) as StreamingSource;
            if (fallbackSource?.isAvailable && fallbackSource !== source && fallbackSource.getEpisodeServers) {
                try {
                    logger.failover(source?.name || 'unknown', fallbackSource.name, 'getEpisodeServers', { episodeId });
                    const servers = await fallbackSource.getEpisodeServers(episodeId);
                    if (servers.length > 0) {
                        timer.end();
                        return servers;
                    }
                } catch {
                    continue;
                }
            }
        }

        timer.end();
        // Return default servers
        return [
            { name: 'vidcloud', url: '', type: 'sub' },
            { name: 'streamtape', url: '', type: 'sub' }
        ];
    }

    /**
     * Get streaming links for an episode
     * Supports automatic failover to alternative sources
     */
    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub'): Promise<StreamingData> {
        const timer = new PerformanceTimer(`Get streaming links: ${episodeId}`, { episodeId, server });

        // Determine source from episode ID
        const source = this.getStreamingSource(episodeId);

        if (source && source.getStreamingLinks) {
            try {
                logger.sourceRequest(source.name, 'getStreamingLinks', { episodeId, server });
                const streamData = await source.getStreamingLinks(episodeId, server, category);
                logger.sourceResponse(source.name, 'getStreamingLinks', true, {
                    sourceCount: streamData.sources.length,
                    subtitleCount: streamData.subtitles?.length || 0
                });
                timer.end();

                if (streamData.sources.length > 0) {
                    return streamData;
                }
            } catch (error) {
                logger.error(`getStreamingLinks failed for ${source.name}`, error as Error, { episodeId, server }, 'SourceManager');
                // Mark source as potentially unavailable
                source.isAvailable = false;
            }
        }

        // Try fallback sources in priority order
        const isHentaiHavenId = episodeId.toLowerCase().startsWith('hh-');
        const isHanimeId = episodeId.toLowerCase().startsWith('hanime-');

        for (const name of this.sourceOrder) {
            // Skip incompatible fallback sources for specialized IDs
            if (isHentaiHavenId && name !== 'HentaiHaven') continue;
            if (isHanimeId && name !== 'Hanime') continue;

            const fallbackSource = this.sources.get(name) as StreamingSource;
            if (fallbackSource?.isAvailable && fallbackSource !== source && fallbackSource.getStreamingLinks) {
                try {
                    logger.failover(source?.name || 'unknown', fallbackSource.name, 'getStreamingLinks', { episodeId, server, category });
                    const streamData = await fallbackSource.getStreamingLinks(episodeId, server, category);

                    if (streamData.sources.length > 0) {
                        logger.info(`Successfully got streaming links from fallback source ${fallbackSource.name}`,
                            { sourceCount: streamData.sources.length },
                            'SourceManager'
                        );
                        timer.end();
                        return streamData;
                    }
                } catch (error) {
                    logger.error(`Fallback getStreamingLinks failed for ${fallbackSource.name}`,
                        error as Error,
                        { episodeId, server },
                        'SourceManager'
                    );
                    continue;
                }
            }
        }

        timer.end();
        logger.warn(`No streaming sources found for episode ${episodeId}`, { episodeId, server }, 'SourceManager');

        // Return empty result
        return {
            sources: [],
            subtitles: []
        };
    }

    async searchAll(query: string, page: number = 1): Promise<AnimeSearchResult> {
        try {
            logger.info(`Starting search for "${query}" (page ${page})`, undefined, 'SourceManager');

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

                        logger.info(`Got ${sourceResults.results.length} results from ${sourceName}`, undefined, 'SourceManager');

                        // If we have enough results, stop searching
                        if (results.length >= 20) break;
                    } else {
                        failedSources.push(sourceName);
                        logger.warn(`No results from ${sourceName}`, undefined, 'SourceManager');
                    }
                } catch (error) {
                    failedSources.push(sourceName);
                    sourceErrors.push({ source: sourceName, error: (error as Error).message });
                    logger.error(`Search failed on ${sourceName}: ${(error as Error).message}`, error as Error, undefined, 'SourceManager');
                }
            }

            if (results.length === 0) {
                // Enhanced logging for failed searches
                logger.error(`❌ SEARCH FAILED: No results found for "${query}" from any source`, new Error('Search failed'), undefined, 'SourceManager');
                logger.error(`📊 Search Statistics:`, new Error('No results'), undefined, 'SourceManager');
                logger.error(`   - Query: "${query}"`, new Error('Query info'), undefined, 'SourceManager');
                logger.error(`   - Page: ${page}`, new Error('Page info'), undefined, 'SourceManager');
                logger.error(`   - Available sources: ${this.sourceOrder.join(', ')}`, new Error('Sources info'), undefined, 'SourceManager');
                logger.error(`   - Failed sources: ${failedSources.join(', ')}`, new Error('Failed sources'), undefined, 'SourceManager');

                // Log specific errors for each failed source
                sourceErrors.forEach(({ source, error }) => {
                    logger.error(`   - ${source}: ${error}`, new Error(error), undefined, 'SourceManager');
                });

                // Log suggestions
                logger.info(`💡 Suggestions for failed search:`, undefined, 'SourceManager');
                logger.info(`   - Check if query is spelled correctly`, undefined, 'SourceManager');
                logger.info(`   - Try alternative search terms`, undefined, 'SourceManager');
                logger.info(`   - Some sources may be temporarily unavailable`, undefined, 'SourceManager');

            } else {
                logger.info(`✅ Search successful: ${results.length} results from sources: ${workingSources.join(', ')}`, undefined, 'SourceManager');
            }

            return {
                results,
                totalPages,
                currentPage: page,
                hasNextPage,
                source: workingSources.join('+')
            };
        } catch (error) {
            logger.error(`❌ SEARCH CRITICAL ERROR: ${(error as Error).message}`, error as Error, undefined, 'SourceManager');
            logger.error(`   Query: "${query}"`, new Error('Query info'), undefined, 'SourceManager');
            logger.error(`   Page: ${page}`, new Error('Page info'), undefined, 'SourceManager');
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
                                logger.debug(`[SourceManager] Fallback search found match for: ${title}`);
                            }
                        }
                    } catch (e) {
                        logger.warn(`[SourceManager] Fallback search failed for: ${title}`);
                    }
                }
            } else if (titlesNeedingSearch.length > 10) {
                logger.warn(`[SourceManager] Skipping fallback search - too many titles (${titlesNeedingSearch.length})`);
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
     * Normalize title for consistent lookup
     */
    private normalizeTitle(title: string): string {
        return title.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
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
            // Check cache first
            const cacheKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
            const cached = this.searchCache.get(cacheKey);
            if (cached && cached.timestamp > Date.now() - this.SEARCH_CACHE_TTL) {
                return this.findBestMatch(title, cached.results);
            }

            // Prioritize HiAnime for title search (used for AniList resolution)
            let source = this.sources.get('HiAnimeDirect');
            if (!source || !source.isAvailable) {
                source = this.sources.get('HiAnime');
            }

            // Fallback to any available source if HiAnime is down
            if (!source || !source.isAvailable) {
                source = this.getAvailableSource() as any;
            }

            if (!source) {
                return null;
            }

            // Search with the title (get more results for better matching)
            const searchResult = await source.search(title, 5);

            // Cache the results
            this.searchCache.set(cacheKey, {
                results: searchResult.results || [],
                timestamp: Date.now()
            });

            const bestMatch = this.findBestMatch(title, searchResult.results || []);

            if (bestMatch) {
                logger.info(`[SourceManager] Found streaming match for "${title}": ${bestMatch.id}`);
                return bestMatch;
            }

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
            const sourceSupportsGenre = (source: AnimeSource): source is GenreAwareSource => {
                return 'getByGenre' in source && typeof (source as GenreAwareSource).getByGenre === 'function';
            };

            if (sourceSupportsGenre(source)) {
                const genreSource = source as GenreAwareSource;
                const result = await genreSource.getByGenre(genre, page);
                logger.sourceResponse(source.name, 'getByGenre', true, { resultCount: result.results?.length || 0 });
                timer.end();
                return result;
            }

            // Fallback: search with genre as query
            logger.info(`Using search fallback for genre: ${genre}`, undefined, 'SourceManager');
            const result = await source.search(genre, page);
            logger.sourceResponse(source.name, 'search (genre fallback)', true, { resultCount: result.results.length });
            timer.end();
            return result;
        } catch (error) {
            logger.error(`Genre search failed for ${source.name}`, error as Error, { genre, page }, 'SourceManager');
            // Try fallback
            source.isAvailable = false;
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
            const pagesToTry = Math.min(3, 5); // Try up to 3 pages

            for (let page = 1; page <= pagesToTry; page++) {
                try {
                    const trending = await source.getTrending(page);
                    allAnime.push(...trending);
                    if (allAnime.length >= 30) break; // Have enough to pick from
                } catch {
                    continue;
                }
            }

            if (allAnime.length === 0) {
                logger.warn(`No anime found for random selection`, undefined, 'SourceManager');
                timer.end();
                return null;
            }

            // Pick random anime
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
            // Try fallback
            source.isAvailable = false;
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


