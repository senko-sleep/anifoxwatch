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
import { AnimeBase, AnimeSearchResult, Episode, TopAnime, SourceHealth } from '../types/anime.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';
import { logger, PerformanceTimer, createRequestContext } from '../utils/logger.js';

interface StreamingSource extends AnimeSource {
    getStreamingLinks?(episodeId: string, server?: string, category?: 'sub' | 'dub'): Promise<StreamingData>;
    getEpisodeServers?(episodeId: string): Promise<EpisodeServer[]>;
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

    getAvailableSources(): string[] {
        return Array.from(this.sources.keys());
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
            if ('getByGenre' in source && typeof (source as any).getByGenre === 'function') {
                const result = await (source as any).getByGenre(genre, page);
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