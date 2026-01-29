import {
    AnimeSource,
    HiAnimeDirectSource,
    HiAnimeSource,
    AniwatchSource,
    GogoanimeSource,
    ConsumetSource,
    NineAnimeSource,
    AniwaveSource
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
    private sourceOrder: string[] = ['HiAnimeDirect', 'HiAnime', 'Gogoanime', '9Anime', 'Aniwave', 'Aniwatch', 'Consumet'];

    // Concurrency control for API requests
    private globalActiveRequests = 0;
    private maxGlobalConcurrent = 6;
    private requestQueue: Array<{
        fn: () => Promise<unknown>;
        resolve: (v: unknown) => void;
        reject: (e: unknown) => void
    }> = [];

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

    private async startHealthMonitor(): Promise<void> {
        // Initial health check
        await this.checkAllHealth();

        // Check health every 2 minutes
        setInterval(() => this.checkAllHealth(), 2 * 60 * 1000);
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

    private getAvailableSource(preferred?: string): StreamingSource | null {
        // Try preferred source first
        if (preferred && this.sources.has(preferred)) {
            const source = this.sources.get(preferred)!;
            if (source.isAvailable) return source;
        }

        // Try sources in priority order
        for (const name of this.sourceOrder) {
            if (this.sources.has(name)) {
                const source = this.sources.get(name)!;
                if (source.isAvailable) return source;
            }
        }

        // Fallback to any available source
        for (const source of this.sources.values()) {
            if (source.isAvailable) return source;
        }

        return null;
    }

    private getStreamingSource(id: string): StreamingSource | null {
        // Determine source from ID prefix
        // HiAnimeDirect is preferred for hianime- prefixed IDs (deep scraping)
        const prefixes = [
            { prefix: 'hianime-', source: 'HiAnimeDirect' },
            { prefix: '9anime-', source: '9Anime' },
            { prefix: 'aniwave-', source: 'Aniwave' },
            { prefix: 'aniwatch-', source: 'Aniwatch' },
            { prefix: 'gogoanime-', source: 'Gogoanime' },
            { prefix: 'consumet-', source: 'Consumet' },
        ];

        for (const { prefix, source } of prefixes) {
            if (id.toLowerCase().startsWith(prefix)) {
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

    async search(query: string, page: number = 1, sourceName?: string): Promise<AnimeSearchResult> {
        const timer = new PerformanceTimer(`Search: ${query}`, { query, page });
        const source = this.getAvailableSource(sourceName);

        if (!source) {
            logger.warn(`No available source for search`, { query, page }, 'SourceManager');
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
        }

        try {
            logger.sourceRequest(source.name, 'search', { query, page });
            const result = await source.search(query, page);
            logger.sourceResponse(source.name, 'search', true, { resultCount: result.results.length });
            timer.end();
            return result;
        } catch (error) {
            logger.error(`Search failed for ${source.name}`, error as Error, { query, page }, 'SourceManager');
            // Try fallback
            source.isAvailable = false;
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                logger.failover(source.name, fallback.name, 'search failed', { query, page });
                return fallback.search(query, page);
            }
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
        }
    }

    async getAnime(id: string): Promise<AnimeBase | null> {
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
                    const trending = await source.getTrending(page + i);
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
    }): Promise<{
        anime: AnimeBase[];
        totalPages: number;
        hasNextPage: boolean;
        totalResults: number;
    }> {
        const timer = new PerformanceTimer('Browse anime', filters);
        const source = this.getAvailableSource(filters.source);

        if (!source) {
            logger.warn(`No available source for browse`, filters, 'SourceManager');
            return { anime: [], totalPages: 0, hasNextPage: false, totalResults: 0 };
        }

        try {
            logger.sourceRequest(source.name, 'browseAnime', filters);

            const page = filters.page || 1;
            const limit = filters.limit || 25;
            const allAnime: AnimeBase[] = [];

            // Type guard function to check if source supports getByGenre
            const sourceSupportsGenre = (source: AnimeSource): source is GenreAwareSource => {
                return 'getByGenre' in source && typeof (source as GenreAwareSource).getByGenre === 'function';
            };
            const hasGenreSupport = sourceSupportsGenre(source);

            // Check if we have a single genre filter and the source supports getByGenre
            const hasSingleGenre = filters.genres && filters.genres.length === 1;
            const skipGenreFallback = hasSingleGenre && !hasGenreSupport;

            // Fetch data based on sort type
            const sortType = filters.sort || 'popularity';

            // Determine how many pages to fetch to have enough data for filtering
            const pagesToFetch = sortType === 'shuffle' ? 5 : 4;

            // Fetch anime based on primary sort type
            for (let i = 0; i < pagesToFetch; i++) {
                try {
                    let pageData: AnimeBase[] = [];

                    switch (sortType) {
                        case 'trending':
                            pageData = await source.getTrending(i + 1);
                            break;
                        case 'recently_released':
                            pageData = await source.getLatest(i + 1);
                            break;
                        case 'popularity':
                        case 'shuffle':
                        default:
                            // For popularity and shuffle, get from trending (most popular source)
                            pageData = await source.getTrending(i + 1);
                            break;
                    }

                    if (pageData && pageData.length > 0) {
                        allAnime.push(...pageData);
                    }

                    // Stop if we have enough data
                    if (allAnime.length >= limit * 4) break;
                } catch {
                    break;
                }
            }

            // Remove duplicates based on ID
            const uniqueAnime = Array.from(new Map(allAnime.map(a => [a.id, a])).values());
            let filtered = [...uniqueAnime];
            
            logger.info(`[SourceManager] Genre filter check: filters.genres = ${JSON.stringify(filters.genres)}, filtered.length = ${filtered.length}`);

            // Apply type filter
            if (filters.type) {
                filtered = filtered.filter(a =>
                    a.type?.toLowerCase() === filters.type?.toLowerCase()
                );
            }

            // Apply genres filter - use AniList for accurate genre matching
            if (filters.genres && filters.genres.length > 0 && !skipGenreFallback) {
                logger.info(`[SourceManager] Applying genre filter: ${filters.genres.join(', ')}`);
                
                // For single genre, try AniList's genre search first (most accurate)
                if (filters.genres.length === 1) {
                    try {
                        const anilistResult = await anilistService.searchByGenre(filters.genres[0], page, 50);
                        if (anilistResult.results && anilistResult.results.length > 0) {
                            // Enrich AniList results with streaming IDs
                            logger.info(`[SourceManager] Enriching ${anilistResult.results.length} AniList results with streaming IDs...`);
                            
                            const enrichedResults = await Promise.all(
                                anilistResult.results.map(async (anime) => {
                                    // Find streaming ID for this anime by title
                                    const streamingMatch = await this.findStreamingAnimeByTitle(anime.title);
                                    return {
                                        ...anime,
                                        streamingId: streamingMatch?.id || undefined
                                    };
                                })
                            );
                            
                            filtered = enrichedResults;
                            logger.info(`[SourceManager] AniList returned ${filtered.length} results for genre: ${filters.genres[0]} (${enrichedResults.filter(a => a.streamingId).length} with streaming IDs)`);
                        } else {
                            // Fallback to AniList tag search
                            const tagResult = await anilistService.searchByTag(filters.genres[0], page, 50);
                            if (tagResult.results && tagResult.results.length > 0) {
                                filtered = tagResult.results;
                                logger.info(`[SourceManager] AniList tag search returned ${filtered.length} results for: ${filters.genres[0]}`);
                            } else {
                                // No results from AniList - fall back to local filtering
                                logger.info(`[SourceManager] No AniList results for ${filters.genres[0]}, using local filtering`);
                                filtered = filtered.filter(a => {
                                    if (!a.genres || a.genres.length === 0) return false;
                                    return filters.genres!.some(g =>
                                        a.genres!.some(ag => ag.toLowerCase().includes(g.toLowerCase()))
                                    );
                                });
                            }
                        }
                    } catch (error) {
                        logger.warn(`AniList genre search failed for ${filters.genres[0]}, using local filtering`, undefined, 'SourceManager');
                        // Fall back to local filtering
                        filtered = filtered.filter(a => {
                            if (!a.genres || a.genres.length === 0) return false;
                            return filters.genres!.some(g =>
                                a.genres!.some(ag => ag.toLowerCase().includes(g.toLowerCase()))
                            );
                        });
                    }
                } else {
                    // Multiple genres - enrich local data with AniList genres and filter
                    logger.info(`[SourceManager] Multiple genres: ${filters.genres.join(', ')}, enriching with AniList`);
                    try {
                        // Enrich anime with AniList genre data
                        const enrichedAnime = await anilistService.enrichBatchWithGenres(filtered);
                        
                        // Filter by all specified genres (anime must match at least one)
                        filtered = enrichedAnime.filter(a => {
                            if (!a.genres || a.genres.length === 0) return false;
                            return filters.genres!.some(g =>
                                a.genres!.some(ag => ag.toLowerCase().includes(g.toLowerCase()))
                            );
                        });
                        
                        logger.info(`[SourceManager] After AniList enrichment: ${filtered.length} anime match genres`);
                    } catch (error) {
                        logger.warn(`AniList enrichment failed, using local filtering`, undefined, 'SourceManager');
                        // Fall back to local filtering
                        filtered = filtered.filter(a => {
                            if (!a.genres || a.genres.length === 0) return false;
                            return filters.genres!.some(g =>
                                a.genres!.some(ag => ag.toLowerCase().includes(g.toLowerCase()))
                            );
                        });
                    }
                }
            }

            // Apply status filter
            if (filters.status) {
                filtered = filtered.filter(a =>
                    a.status?.toLowerCase() === filters.status?.toLowerCase()
                );
            }

            // Apply year filter (exact year)
            if (filters.year) {
                filtered = filtered.filter(a => a.year === filters.year);
            }

            // Apply date range filter (startYear to endYear)
            if (filters.startYear || filters.endYear) {
                filtered = filtered.filter(a => {
                    if (!a.year) return false;
                    const startYear = filters.startYear || 1970;
                    const endYear = filters.endYear || new Date().getFullYear();
                    return a.year >= startYear && a.year <= endYear;
                });
            }

            // Apply sorting
            const order = filters.order || 'desc';

            if (sortType === 'shuffle') {
                // Fisher-Yates shuffle for random order - always shuffle for fresh results
                // Use a seeded random approach based on current time to ensure different results each click
                const seed = Date.now();
                const random = (i: number) => {
                    const x = Math.sin(seed + i) * 10000;
                    return x - Math.floor(x);
                };
                for (let i = filtered.length - 1; i > 0; i--) {
                    const j = Math.floor(random(i) * (i + 1));
                    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
                }
            } else {
                filtered.sort((a, b) => {
                    let comparison = 0;
                    switch (sortType) {
                        case 'popularity':
                        case 'trending':
                            // Keep original order for trending/popularity (already sorted by source)
                            comparison = 0;
                            break;
                        case 'recently_released':
                            // Sort by year (newest first)
                            comparison = (b.year || 0) - (a.year || 0);
                            break;
                        case 'rating':
                            comparison = (b.rating || 0) - (a.rating || 0);
                            break;
                        case 'year':
                            comparison = (b.year || 0) - (a.year || 0);
                            break;
                        case 'title':
                            comparison = (a.title || '').localeCompare(b.title || '');
                            break;
                        default:
                            comparison = 0;
                    }
                    return order === 'asc' ? -comparison : comparison;
                });
            }

            // Paginate results - 25 per page by default
            const startIndex = (page - 1) * limit;
            const paginated = filtered.slice(startIndex, startIndex + limit);
            const totalResults = filtered.length;
            const totalPages = Math.ceil(totalResults / limit) || 1;
            const hasNextPage = startIndex + limit < totalResults;

            logger.sourceResponse(source.name, 'browseAnime', true, {
                totalFetched: uniqueAnime.length,
                totalFiltered: totalResults,
                returned: paginated.length,
                page,
                totalPages
            });
            timer.end();

            return {
                anime: paginated,
                totalPages,
                hasNextPage,
                totalResults
            };
        } catch (error) {
            logger.error(`Browse anime failed for ${source.name}`, error as Error, filters, 'SourceManager');
            // Try fallback
            source.isAvailable = false;
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                logger.failover(source.name, fallback.name, 'browse anime failed', filters);
                return this.browseAnime({ ...filters, source: fallback.name });
            }
            return { anime: [], totalPages: 0, hasNextPage: false, totalResults: 0 };
        }
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
        for (const name of this.sourceOrder) {
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
        for (const name of this.sourceOrder) {
            const fallbackSource = this.sources.get(name) as StreamingSource;
            if (fallbackSource?.isAvailable && fallbackSource !== source && fallbackSource.getStreamingLinks) {
                try {
                    logger.failover(source?.name || 'unknown', fallbackSource.name, 'getStreamingLinks', { episodeId, server });
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
     * Uses instant lookup table for fast matching
     */
    async getAnimeByGenreAniList(genre: string, page: number = 1): Promise<AnimeSearchResult> {
        try {
            // Build lookup table on first genre search (lazy initialization)
            await this.buildStreamingLookupTable();
            
            const result = await anilistService.searchByGenre(genre, page, 50);
            logger.info(`[SourceManager] AniList genre search for "${genre}" returned ${result.results.length} results`);
            
            // Process results with instant lookup (fast)
            const enrichedResults = result.results.map(anime => {
                // Find streaming match using pre-built table (O(1) lookup)
                const match = this.findStreamingMatchInstant(anime.title);
                
                if (match) {
                    return {
                        ...match,
                        genres: anime.genres,
                        rating: anime.rating || match.rating,
                        streamingId: match.id,
                        source: 'HiAnimeDirect'
                    };
                }
                
                // No streaming match - keep AniList data
                return {
                    ...anime,
                    streamingId: undefined,
                    source: 'AniList'
                };
            });
            
            const withStreamingIds = enrichedResults.filter(a => a.streamingId).length;
            logger.info(`[SourceManager] Genre search: ${withStreamingIds}/${enrichedResults.length} results have streaming IDs`);
            
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

            // Get available source
            const source = this.getAvailableSource();
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