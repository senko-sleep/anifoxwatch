import {
    AnimeSource,
    AnimePaheDirectSource,
    AnimeKaiSource,
    NineAnimeSource,
    WatchHentaiSource,
    HanimeSource,
    AkiHSource,
    ConsumetSource,
    AnimeFLVSource,
    GogoanimeSource,
    AllAnimeSource,
    KaidoSource,
    ZoroSource,
    MiruroSource,
    AniwaveSource,
    AnixSource,
    DirectDownloadSource,
} from '../sources/index.js';
import { AnimeBase, AnimeSearchResult, Episode, TopAnime, SourceHealth, BrowseFilters } from '../types/anime.js';
import { GenreAwareSource, SourceRequestOptions } from '../sources/base-source.js';
import { StreamingData, EpisodeServer } from '../types/streaming.js';
import { logger, PerformanceTimer, createRequestContext } from '../utils/logger.js';
import { AnimeCache } from '../lib/anime-cache.js';
import { animeCache, episodesCache, searchCache, trendingCache } from '../lib/memory-cache.js';
import { anilistService } from './anilist-service.js';
import { reliableRequest, retry, withTimeout } from '../middleware/reliability.js';
import { REGISTERED_SOURCE_NAMES } from '../registered-sources.js';
import { isHianimeStyleEpisodeId } from '../utils/hianime-rest-servers.js';
import { reconstructAnimeKaiCompoundFromWatchUrl } from '../utils/animekai-compound-from-watch.js';

export { REGISTERED_SOURCE_NAMES };

interface StreamingSource extends AnimeSource {
    getStreamingLinks?(episodeId: string, server?: string, category?: 'sub' | 'dub', options?: SourceRequestOptions): Promise<StreamingData>;
    getEpisodeServers?(episodeId: string, options?: SourceRequestOptions): Promise<EpisodeServer[]>;
    getAnimeInfo?(id: string, options?: SourceRequestOptions): Promise<AnimeBase>;
}

/**
 * Source capabilities for intelligent routing
 */
interface SourceCapabilities {
    supportsDub: boolean;
    supportsSub: boolean;
    hasScheduleData: boolean;
    hasGenreFiltering: boolean;
    quality: 'high' | 'medium' | 'low'; // Response quality based on source reliability
}

/**
 * Enhanced source metadata for intelligent routing
 */
interface SourceMetadata {
    capabilities: SourceCapabilities;
    successRate: number; // 0-1, calculated from recent requests
    avgLatency: number; // in ms
    lastSuccessTime: number;
    consecutiveFailures: number;
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
 * - Intelligent routing based on source capabilities
 */
export class SourceManager {
    private sources: Map<string, StreamingSource> = new Map();
    private primarySource: string = 'AnimeFLV';
    private healthStatus: Map<string, SourceHealth> = new Map();
    private sourceMetadata: Map<string, SourceMetadata> = new Map();
    
    private sourceOrder: string[] = [...REGISTERED_SOURCE_NAMES];

    // Source capabilities mapping
    private sourceCapabilities: Map<string, SourceCapabilities> = new Map([
        ['AnimeKai', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'high' }],
        ['AnimePahe', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'high' }],
        ['9Anime', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: true, quality: 'medium' }],
        ['AnimeFLV', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'medium' }],
        ['Gogoanime', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'medium' }],
        ['AllAnime', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'medium' }],
        ['WatchHentai', { supportsDub: false, supportsSub: true, hasScheduleData: false, hasGenreFiltering: true, quality: 'medium' }],
        ['Hanime', { supportsDub: false, supportsSub: true, hasScheduleData: false, hasGenreFiltering: true, quality: 'medium' }],
        ['Consumet', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'high' }],
        ['Kaido', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'medium' }],
        ['Zoro', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'medium' }],
        ['Miruro', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'high' }],
        ['Aniwave', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'high' }],
        ['Anix', { supportsDub: true, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'medium' }],
        ['DirectDownload', { supportsDub: false, supportsSub: true, hasScheduleData: false, hasGenreFiltering: false, quality: 'high' }],
    ]);

    // Concurrency control for API requests with better reliability
    private globalActiveRequests = 0;
    private maxGlobalConcurrent = 20;
    private requestQueue: Array<{
        fn: (signal: AbortSignal) => Promise<unknown>;
        resolve: (value: unknown) => void;
        reject: (reason: unknown) => void;
        context: string;
        options: SourceRequestOptions;
        priority: number;
    }> = [];

    // Priority levels for request queue
    private readonly PRIORITY_HIGH = 1;
    private readonly PRIORITY_NORMAL = 2;
    private readonly PRIORITY_LOW = 3;

    // Rate limiting by source
    private sourceRequestCounts = new Map<string, number>();
    private sourceRateLimits = new Map<string, { limit: number; resetTime: number }>();

    // Performance tracking for smart source selection
    private recentLatencies: Map<string, number[]> = new Map();
    private readonly LATENCY_SAMPLE_SIZE = 10;
    private readonly SUCCESS_RATE_WINDOW = 50; // Number of requests to track
    private sourceSuccessRates: Map<string, { success: number; total: number }> = new Map();

    constructor() {
        // PRIMARY: AnimeFLV — verified working streams (bypasses aniwatch-pkg Cloudflare issues)
        this.registerSource(new AnimeFLVSource());

        // BACKUP: AnimeKai — verified working HLS streams (sub + dub) via @consumet/extensions
        this.registerSource(new AnimeKaiSource());

        // BACKUP: AnimePahe — @consumet/extensions
        this.registerSource(new AnimePaheDirectSource());

        // FALLBACK: External API-based sources
        this.registerSource(new NineAnimeSource());
        this.registerSource(new ConsumetSource(process.env.CONSUMET_API_URL || 'https://api.consumet.org', 'gogoanime'));

        // PRODUCTION FALLBACK: Gogoanime (anitaku.pe) — direct HTTP scraper, not Cloudflare-blocked
        this.registerSource(new GogoanimeSource());

        // PRODUCTION: AllAnime — GraphQL API + fast4speed.rsvp CDN (accessible from cloud IPs)
        this.registerSource(new AllAnimeSource());

        // Miruro / aniwatch-style episode IDs (see getStreamingSource $token= routing)
        this.registerSource(new MiruroSource());

        // BACKUP: Kaido (kaido.to) — used for enrichment + streaming fallback
        this.registerSource(new KaidoSource());

        // BACKUP: Zoro (zoro.to mirror) — additional streaming fallback
        this.registerSource(new ZoroSource());

        // New expansions
        this.registerSource(new AniwaveSource());
        this.registerSource(new AnixSource());
        this.registerSource(new DirectDownloadSource());

        // Adult sources
        this.registerSource(new WatchHentaiSource());
        this.registerSource(new HanimeSource());
        this.registerSource(new AkiHSource());

        logger.info(`Registered ${this.sources.size} sources`, undefined, 'SourceManager');
        console.log(`\n📡 [SourceManager] Registered ${this.sources.size} streaming sources`);

        // Configure rate limits for each source (requests per minute)
        this.sourceRateLimits.set('AnimeKai', { limit: 120, resetTime: 60000 });
        this.sourceRateLimits.set('AnimePahe', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('9Anime', { limit: 100, resetTime: 60000 });
        this.sourceRateLimits.set('AnimeFLV', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('Gogoanime', { limit: 60, resetTime: 60000 });
        this.sourceRateLimits.set('AllAnime', { limit: 120, resetTime: 60000 });
        this.sourceRateLimits.set('WatchHentai', { limit: 30, resetTime: 60000 });
        this.sourceRateLimits.set('Hanime', { limit: 40, resetTime: 60000 });
        this.sourceRateLimits.set('Consumet', { limit: 60, resetTime: 60000 });
        this.sourceRateLimits.set('Kaido', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('Zoro', { limit: 80, resetTime: 60000 });
        this.sourceRateLimits.set('Miruro', { limit: 60, resetTime: 60000 });
        this.sourceRateLimits.set('Aniwave', { limit: 60, resetTime: 60000 });
        this.sourceRateLimits.set('Anix', { limit: 80, resetTime: 60000 });

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

        // CRITICAL: Periodic health recovery - re-enable sources that were marked offline
        // Without this, sources marked isAvailable=false stay dead forever until server restart
        setInterval(() => {
            this.recoverOfflineSources().catch(err => {
                logger.error('Periodic health recovery failed', err, undefined, 'SourceManager');
            });
        }, 60000); // Every 60 seconds

        // Memory cleanup: cap performance tracking maps and drain stale queue entries
        setInterval(() => {
            this.cleanupMemory();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Periodically attempt to recover sources that were marked offline.
     * This prevents transient failures from permanently disabling sources.
     */
    private async recoverOfflineSources(): Promise<void> {
        const offlineSources = Array.from(this.sources.entries())
            .filter(([_, source]) => !source.isAvailable);

        if (offlineSources.length === 0) return;

        logger.info(`Attempting recovery for ${offlineSources.length} offline sources: ${offlineSources.map(([n]) => n).join(', ')}`, undefined, 'SourceManager');
        console.log(`🔄 [SourceManager] Recovering ${offlineSources.length} offline sources...`);

        for (const [name, source] of offlineSources) {
            try {
                const isHealthy = await Promise.race([
                    source.healthCheck({ timeout: 8000 }),
                    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 8000))
                ]);

                if (isHealthy !== false) {
                    source.isAvailable = true;
                    this.healthStatus.set(name, {
                        name,
                        status: 'online',
                        lastCheck: new Date()
                    });
                    console.log(`   ✅ ${name} recovered`);
                    logger.info(`Source ${name} recovered and marked online`, undefined, 'SourceManager');
                }
            } catch {
                // On error, optimistically re-enable - the source will be marked offline again
                // if it actually fails during a real request
                source.isAvailable = true;
                this.healthStatus.set(name, {
                    name,
                    status: 'online',
                    lastCheck: new Date()
                });
                console.log(`   ⚡ ${name} recovery inconclusive, re-enabling optimistically`);
                logger.info(`Source ${name} re-enabled optimistically after inconclusive recovery`, undefined, 'SourceManager');
            }
        }
    }

    /**
     * Periodic memory cleanup to prevent unbounded growth
     */
    private cleanupMemory(): void {
        // Cap latency samples
        for (const [name, latencies] of this.recentLatencies.entries()) {
            if (latencies.length > this.LATENCY_SAMPLE_SIZE) {
                this.recentLatencies.set(name, latencies.slice(-this.LATENCY_SAMPLE_SIZE));
            }
        }

        // Cap success rate counters
        for (const [name, rate] of this.sourceSuccessRates.entries()) {
            if (rate.total > this.SUCCESS_RATE_WINDOW * 2) {
                const ratio = rate.success / rate.total;
                rate.total = this.SUCCESS_RATE_WINDOW;
                rate.success = Math.round(ratio * this.SUCCESS_RATE_WINDOW);
                this.sourceSuccessRates.set(name, rate);
            }
        }

        // Drain stale queue entries (older than 60s)
        const now = Date.now();
        const staleThreshold = 60000;
        const staleEntries = this.requestQueue.filter((entry: any) => entry.queuedAt && (now - entry.queuedAt) > staleThreshold);
        for (const entry of staleEntries) {
            const idx = this.requestQueue.indexOf(entry);
            if (idx !== -1) {
                this.requestQueue.splice(idx, 1);
                entry.reject(new Error('Request expired in queue'));
            }
        }

        // Reset rate limit counters
        this.sourceRequestCounts.clear();

        const memUsage = process.memoryUsage();
        const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        if (heapMB > 400) {
            console.log(`⚠️ [SourceManager] High memory usage: ${heapMB}MB heap. Running GC if available.`);
            if (global.gc) {
                global.gc();
            }
        }

        logger.info(`Memory cleanup complete. Queue: ${this.requestQueue.length}, Heap: ${heapMB}MB`, undefined, 'SourceManager');
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
        const prioritySources = ['AnimeKai', 'AnimePahe'];
        
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
            const queuedAt = Date.now();
            const QUEUE_TIMEOUT = 55000; // 55s max wait in queue (Vercel limit is 60s)

            // Reject if queue is too large (backpressure)
            if (this.requestQueue.length >= 50) {
                reject(new Error(`Request queue full (${this.requestQueue.length} pending). Try again later.`));
                return;
            }

            const entry = {
                fn: fn as any,
                resolve: resolve as any,
                reject: reject as any,
                context,
                options,
                priority: this.PRIORITY_NORMAL,
                queuedAt
            };
            this.requestQueue.push(entry);

            // Auto-reject if stuck in queue too long
            const queueTimer = setTimeout(() => {
                const idx = this.requestQueue.indexOf(entry);
                if (idx !== -1) {
                    this.requestQueue.splice(idx, 1);
                    reject(new Error(`Request queued too long (${QUEUE_TIMEOUT}ms) for: ${context}`));
                }
            }, QUEUE_TIMEOUT);

            // Clear timer when resolved/rejected
            const origResolve = resolve;
            const origReject = reject;
            entry.resolve = ((val: unknown) => { clearTimeout(queueTimer); origResolve(val as T); }) as any;
            entry.reject = ((err: unknown) => { clearTimeout(queueTimer); origReject(err); }) as any;

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

        // Safety: cap active requests at a sane value to prevent counter drift
        if (this.globalActiveRequests > this.maxGlobalConcurrent + 5) {
            console.warn(`⚠️ [SourceManager] Active request counter drifted to ${this.globalActiveRequests}, resetting`);
            this.globalActiveRequests = Math.max(0, this.maxGlobalConcurrent);
        }

        const requestTimeout = request.options.timeout || 30000;
        // Safety timeout: if withTimeout itself hangs, force-complete after 2x the timeout
        const safetyTimer = setTimeout(() => {
            console.warn(`⚠️ [SourceManager] Safety timeout hit for: ${request.context}`);
            this.globalActiveRequests = Math.max(0, this.globalActiveRequests - 1);
            try { request.reject(new Error(`Safety timeout for: ${request.context}`)); } catch { /* already resolved */ }
            this.processQueue();
        }, requestTimeout * 2);

        try {
            const result = await withTimeout(
                (signal) => request.fn(signal),
                requestTimeout,
                { operation: request.context },
                request.options.signal
            );
            clearTimeout(safetyTimer);
            request.resolve(result);
        } catch (error) {
            clearTimeout(safetyTimer);
            request.reject(error);
        } finally {
            this.globalActiveRequests = Math.max(0, this.globalActiveRequests - 1);
            // Continue draining the queue
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

    /**
     * Get enhanced source status with metadata
     */
    getSourceStatus(): Array<{
        name: string;
        status: string;
        lastCheck: Date;
        capabilities?: SourceCapabilities;
        successRate?: number;
        avgLatency?: number;
    }> {
        return Array.from(this.sources.entries()).map(([name, source]) => {
            const health = this.healthStatus.get(name);
            const metadata = this.sourceMetadata.get(name);
            const capabilities = this.sourceCapabilities.get(name);
            
            // Calculate success rate
            let successRate = 1.0;
            if (metadata) {
                const rate = this.sourceSuccessRates.get(name);
                if (rate && rate.total > 0) {
                    successRate = rate.success / rate.total;
                }
            }
            
            return {
                name,
                status: health?.status || (source.isAvailable ? 'online' : 'offline'),
                lastCheck: health?.lastCheck || new Date(),
                capabilities,
                successRate: Math.round(successRate * 100),
                avgLatency: metadata?.avgLatency
            };
        });
    }

    getAvailableSources(): string[] {
        return Array.from(this.sources.keys()).filter(name => {
            const source = this.sources.get(name);
            return source?.isAvailable;
        });
    }

    /**
     * Run health check for a registered source by name.
     */
    async healthCheck(sourceName: string, options?: SourceRequestOptions): Promise<boolean> {
        const source = this.sources.get(sourceName);
        if (!source) return false;
        return source.healthCheck(options);
    }

    /**
     * Get best available source based on requirements and performance
     * Uses intelligent selection considering:
     * - Source capabilities (dub/sub support, quality)
     * - Recent success rate
     * - Average latency
     * - Availability status
     */
    getBestSource(options?: {
        preferDub?: boolean;
        preferHighQuality?: boolean;
        requireSchedule?: boolean;
        excludeAdult?: boolean;
    }): StreamingSource | null {
        const { preferDub = false, preferHighQuality = false, requireSchedule = false, excludeAdult = true } = options || {};
        
        const availableSources: Array<{
            name: string;
            source: StreamingSource;
            score: number;
            capabilities: SourceCapabilities;
        }> = [];
        
        // Score available sources
        for (const name of this.sourceOrder) {
            // Skip adult sources if excluded
            if (excludeAdult && name === 'WatchHentai') continue;
            
            const source = this.sources.get(name);
            if (!source?.isAvailable) continue;
            
            const capabilities = this.sourceCapabilities.get(name) || {
                supportsDub: true,
                supportsSub: true,
                hasScheduleData: false,
                hasGenreFiltering: true,
                quality: 'medium' as const
            };
            
            // Skip if requirements not met
            if (preferDub && !capabilities.supportsDub) continue;
            if (requireSchedule && !capabilities.hasScheduleData) continue;
            
            // Calculate score (higher is better)
            let score = 100;
            
            // Quality bonus
            if (capabilities.quality === 'high') score += 30;
            else if (capabilities.quality === 'medium') score += 15;
            
            // Latency bonus (lower latency = higher score)
            const latencies = this.recentLatencies.get(name);
            if (latencies && latencies.length > 0) {
                const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
                if (avgLatency < 500) score += 20;
                else if (avgLatency < 1000) score += 10;
                else if (avgLatency < 2000) score += 5;
            } else {
                // No latency data, give neutral score
                score += 10;
            }
            
            // Success rate bonus
            const rate = this.sourceSuccessRates.get(name);
            if (rate && rate.total > 5) {
                const successRate = rate.success / rate.total;
                score += successRate * 30;
            } else {
                // No history, assume good
                score += 20;
            }
            
            // Dub preference bonus
            if (preferDub && capabilities.supportsDub) score += 10;
            
            availableSources.push({ name, source, score, capabilities });
        }
        
        // Sort by score descending
        availableSources.sort((a, b) => b.score - a.score);
        
        // Return best source
        return availableSources.length > 0 ? availableSources[0].source : null;
    }

    /**
     * Record successful request for performance tracking
     */
    recordSuccess(sourceName: string, latency: number): void {
        // Update latency tracking
        let latencies = this.recentLatencies.get(sourceName) || [];
        latencies.push(latency);
        if (latencies.length > this.LATENCY_SAMPLE_SIZE) {
            latencies = latencies.slice(-this.LATENCY_SAMPLE_SIZE);
        }
        this.recentLatencies.set(sourceName, latencies);
        
        // Update success rate
        const rate = this.sourceSuccessRates.get(sourceName) || { success: 0, total: 0 };
        rate.success++;
        rate.total++;
        if (rate.total > this.SUCCESS_RATE_WINDOW) {
            // Keep window sliding
            rate.success = Math.max(0, rate.success - 1);
            rate.total = this.SUCCESS_RATE_WINDOW;
        }
        this.sourceSuccessRates.set(sourceName, rate);
        
        // Update metadata
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        this.sourceMetadata.set(sourceName, {
            capabilities: this.sourceCapabilities.get(sourceName)!,
            successRate: rate.success / Math.max(1, rate.total),
            avgLatency,
            lastSuccessTime: Date.now(),
            consecutiveFailures: 0
        });
    }

    /**
     * Record failed request for performance tracking
     */
    recordFailure(sourceName: string): void {
        // Update success rate
        const rate = this.sourceSuccessRates.get(sourceName) || { success: 0, total: 0 };
        rate.total++;
        if (rate.total > this.SUCCESS_RATE_WINDOW) {
            rate.total = this.SUCCESS_RATE_WINDOW;
        }
        this.sourceSuccessRates.set(sourceName, rate);
        
        // Update metadata
        const metadata = this.sourceMetadata.get(sourceName) || {
            capabilities: this.sourceCapabilities.get(sourceName)!,
            successRate: 0,
            avgLatency: 0,
            lastSuccessTime: 0,
            consecutiveFailures: 0
        };
        metadata.consecutiveFailures++;
        metadata.successRate = rate.success / Math.max(1, rate.total);
        this.sourceMetadata.set(sourceName, metadata);
        
        // Mark source unavailable after too many consecutive failures
        if (metadata.consecutiveFailures >= 5) {
            const source = this.sources.get(sourceName);
            if (source) {
                source.isAvailable = false;
                this.healthStatus.set(sourceName, {
                    name: sourceName,
                    status: 'offline',
                    lastCheck: new Date()
                });
                logger.warn(`Source ${sourceName} marked offline after ${metadata.consecutiveFailures} consecutive failures`, undefined, 'SourceManager');
                // Reset counter so recovery gets a fresh start
                metadata.consecutiveFailures = 0;
            }
        }
    }

    /**
     * Get source capabilities
     */
    getSourceCapabilities(sourceName: string): SourceCapabilities | undefined {
        return this.sourceCapabilities.get(sourceName);
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
     * Maps public API query values (`source=hianime`, `aniwatch`) to registered {@link #sources} keys.
     * Without this, `hianime` is unknown and {@link #getAvailableSource} falls through to AnimeKai priority.
     */
    private resolveSearchSourceAlias(raw?: string): string | undefined {
        if (!raw || typeof raw !== 'string') return undefined;
        const t = raw.trim();
        if (this.sources.has(t)) return t;

        const lower = t.toLowerCase();
        const aliases: Record<string, string> = {
            hianime: 'Miruro',
            'hi-anime': 'Miruro',
            hianimez: 'Miruro',
            aniwatch: 'Miruro',
            aniwatchtv: 'Miruro',
            miruro: 'Miruro',
        };
        const mapped = aliases[lower];
        if (mapped) return mapped;

        for (const name of this.sourceOrder) {
            if (name.toLowerCase() === lower) return name;
        }
        return t;
    }

    /**
     * Known source prefixes for ID detection
     */
    private readonly knownPrefixes = [
        'animekai-', 'animepahe-',
        '9anime-', 'gogoanime-', 'consumet-',
        'animeflv-', 'anilist-', 'watchhentai-', 'hanime-', 'akih-',
            'aniwave-', 'aniwatch-', 'allanime-', 'miruro-'
    ];

    /**
     * Consumet AnimeKai episode IDs (fetchAnimeInfo): "show-slug-suffix$ep=N$token=..."
     * Not the same as 9anime "slug?ep=NUM" watch URLs.
     */
    private isAnimeKaiConsumetEpisodeId(id: string): boolean {
        if (id.includes('?ep=')) return false;
        return /\$ep=\d+/.test(id);
    }

    /**
     * Check if an ID has a known source prefix
     */
    private hasKnownSourcePrefix(id: string): boolean {
        const lowerId = id.toLowerCase();
        if (this.knownPrefixes.some(prefix => lowerId.startsWith(prefix))) return true;
        return this.isAnimeKaiConsumetEpisodeId(id);
    }

    /**
     * Extract the raw anime ID without source prefix
     * e.g., "9anime-one-piece-100" -> "one-piece-100"
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
     * Human-ish title for cross-source stream fallback (strips watch params, AnimeKai $ep$token tails, hash suffix).
     */
    private episodeIdToFallbackSearchTitle(episodeId: string): string {
        let slug = episodeId.split('?')[0];
        const dollar = slug.indexOf('$');
        if (dollar !== -1) slug = slug.slice(0, dollar);
        slug = this.extractRawId(slug);
        slug = slug.replace(/-(?=[a-z]*\d)[a-z\d]{3,6}$/i, '');
        const rawSlug = slug.replace(/-\d{4,}$/, '');
        return rawSlug.replace(/[-_]/g, ' ').trim();
    }

    /**
     * Build ID with source prefix
     */
    private buildSourceId(rawId: string, sourceName: string): string {
        const prefixMap: Record<string, string> = {
            'Kaido': 'kaido-',
            'AnimePahe': 'animepahe-',
            'AnimeKai': 'animekai-',
            '9Anime': '9anime-',
            'Aniwave': 'aniwave-',
            'Aniwatch': 'aniwatch-',
            'Gogoanime': 'gogoanime-',
            'Consumet': 'consumet-',
            'Zoro': 'zoro-',
            'AnimeSuge': 'animesuge-',
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
            'Hanime': 'hanime-',
            'Miruro': 'miruro-'
        };
        
        const prefix = prefixMap[sourceName] || '';
        return prefix + rawId;
    }

    /**
     * Map aniwatch-/aniwave- IDs to 9anime- watch shape for {@link NineAnimeSource} (Puppeteer path — same as npm run dev).
     */
    private resolveStreamingEpisodeId(
        episodeId: string,
        source: StreamingSource,
        primarySource: StreamingSource | null,
        hasSourcePrefix: boolean,
        rawId: string
    ): string {
        if (source.name === '9Anime') {
            const slug = episodeId.split('?')[0].toLowerCase();
            if (slug.startsWith('aniwave-') || slug.startsWith('aniwatch-')) {
                return this.buildSourceId(rawId, '9Anime');
            }
        }
        if (source === primarySource || !hasSourcePrefix) return episodeId;
        return this.buildSourceId(rawId, source.name);
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

        const prefixes = [
            { prefix: 'miruro-', source: 'Miruro' },
            { prefix: 'kaido-', source: 'Kaido' },
            { prefix: 'aniwave-', source: '9Anime' },
            { prefix: 'aniwatch-', source: '9Anime' },
            { prefix: 'animepahe-', source: 'AnimePahe' },
            { prefix: 'animekai-', source: 'AnimeKai' },
            { prefix: '9anime-', source: '9Anime' },
            { prefix: 'gogoanime-', source: 'Gogoanime' },
            { prefix: 'allanime-', source: 'AllAnime' },
            { prefix: 'consumet-', source: 'Consumet' },
            { prefix: 'hanime-', source: 'WatchHentai' },
            { prefix: 'hh-', source: 'WatchHentai' },
            { prefix: 'watchhentai-', source: 'WatchHentai' },
            { prefix: 'akih-', source: 'AkiH' },
            { prefix: 'watchhentai-series/', source: 'WatchHentai' },
            { prefix: 'watchhentai-videos/', source: 'WatchHentai' },
            { prefix: 'animeflv-', source: 'AnimeFLV' },
        ];

        for (const { prefix, source } of prefixes) {
            if (lowerId.startsWith(prefix)) {
                const preferredSource = this.sources.get(source);
                if (preferredSource?.isAvailable) {
                    return preferredSource;
                }
            }
        }

        // Miruro / aniwatch embed shape: "slug$ep=N$token=..." (server-side episode key — not plain ?ep=N on hi.anime).
        if (/\$ep=\d+\$token=/i.test(id)) {
            const miruro = this.sources.get('Miruro');
            if (miruro?.isAvailable) return miruro;
        }

        // Raw Consumet AnimeKai episode IDs have no "animekai-" prefix (see mapAnime vs episode id: ep.id).
        if (this.isAnimeKaiConsumetEpisodeId(id)) {
            const kai = this.sources.get('AnimeKai');
            if (kai?.isAvailable) return kai;
        }

        // "{animeSlug}?ep={key}" — HiAnime / aniwatch watch URLs (display episode number OR internal embed token).
        // Compound AnimeKai list ids (`slug$ep=N$token=KEY`) normalize to `slug?ep=KEY` on the API; those must
        // resolve through Miruro, not Consumet AnimeKai (which expects `$episode$` / `$ep=` shapes).
        if (/^[^/?#]+\?ep=[^&?#]+$/i.test(id)) {
            const miruro = this.sources.get('Miruro');
            if (miruro?.isAvailable) return miruro;
            const nine = this.sources.get('9Anime');
            if (nine?.isAvailable) return nine;
            const kaido = this.sources.get('Kaido');
            if (kaido?.isAvailable) return kaido;
        }

        return this.getAvailableSource();
    }

    // ============ ANIME DATA METHODS ============

    async search(query: string, page: number = 1, sourceName?: string, options?: { mode?: 'safe' | 'mixed' | 'adult' }): Promise<AnimeSearchResult> {
        const timer = new PerformanceTimer(`Search: ${query}`, { query, page });
        const mode = options?.mode || 'safe';
        const resolvedSource = this.resolveSearchSourceAlias(sourceName);

        if (sourceName && resolvedSource && sourceName !== resolvedSource && this.sources.has(resolvedSource)) {
            console.log(`🔍 [SourceManager] Resolved source alias "${sourceName}" → "${resolvedSource}"`);
        }

        console.log(`🔍 [SourceManager] Search request: "${query}" (page: ${page}, mode: ${mode}, source: ${resolvedSource || 'auto'})`);

        if (mode === 'adult') {
            const adultSources = ['WatchHentai', 'Hanime', 'AkiH']
                .map(name => this.getAvailableSource(name))
                .filter(source => source && source.isAvailable) as StreamingSource[];

            if (adultSources.length === 0) {
                // Try to force get them if getAvailableSource failed due to strict checks but we want to try?
                // getAvailableSource uses isAvailable check.
                throw new Error('Adult sources (WatchHentai/Hanime) are not available');
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
                const enrichedResults = await this.enrichWithAniListData(uniqueResults);

                timer.end();
                return {
                    results: enrichedResults,
                    totalPages: maxTotalPages,
                    currentPage: page,
                    hasNextPage: hasNextPage,
                    totalResults: enrichedResults.length,
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

            const adultSources = ['WatchHentai', 'Hanime']
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
            const enrichedResults = await this.enrichWithAniListData(uniqueResults);

            timer.end();
            return {
                results: enrichedResults,
                totalPages: maxTotalPages,
                currentPage: page,
                hasNextPage: hasNextPage,
                totalResults: enrichedResults.length,
                source: 'Mixed'
            };
        }

        // Safe Mode (Default)
        // If a specific source is requested, use it
        if (resolvedSource) {
            // Do not use getAvailableSource() here: when Miruro is marked !isAvailable it would fall through to AnimeKai.
            const source = this.sources.get(resolvedSource) ?? null;
            if (!source) {
                console.log(`❌ [SourceManager] Unknown source "${resolvedSource}"`);
                logger.warn(`Unknown source ${resolvedSource}`, { query }, 'SourceManager');
                return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'none' };
            }
            try {
                const result = await this.executeReliably(source.name, 'search', (signal) => source.search(query, page, undefined, { signal }));
                if (!result.results || result.results.length === 0) {
                    logger.warn(`Source "${resolvedSource}" returned no results for query "${query}"`, { source: resolvedSource, query });
                    console.log(`⚠️ [SourceManager] Source "${resolvedSource}" returned no results for: "${query}"`);
                } else {
                    logger.info(`Source "${resolvedSource}" returned ${result.results.length} results for query "${query}"`, { source: resolvedSource, query, count: result.results.length });
                    console.log(`✅ [SourceManager] Source "${resolvedSource}" returned ${result.results.length} results`);
                }
                // Enrich results with AniList data
                const enrichedResults = await this.enrichWithAniListData(result.results || []);
                timer.end();
                return { ...result, results: enrichedResults };
            } catch (error) {
                console.log(`❌ [SourceManager] Search failed with source "${resolvedSource}": ${(error as Error).message}`);
                logger.error(`Search failed with source ${resolvedSource}`, error as Error, { query });
                throw error;
            }
        }

        const sourcesToTry = this.sourceOrder
            .filter(name => name !== 'WatchHentai')
            .map(name => this.sources.get(name))
            .filter(source => source && source.isAvailable)
            .slice(0, 3) as StreamingSource[];
        
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

            // Deduplicate, then sort by relevance to the query
            const uniqueResults = this.deduplicateResults(combinedResults);
            const sortedResults = this.sortByRelevance(uniqueResults, query);

            if (sortedResults.length === 0) {
                console.log(`❌ [SourceManager] No results from ANY source for query: "${query}"`);
                console.log(`   Tried sources: ${sourcesToTry.map(s => s.name).join(', ')}`);
                logger.warn(`No results from any source`, { query, page, triedSources: sourcesToTry.map(s => s.name) }, 'SourceManager');

                // AniList fallback for search
                try {
                    console.log(`[SourceManager] search: scrapers empty, falling back to AniList for "${query}"`);
                    const anilistResult = await anilistService.advancedSearch({ search: query, sort: ['SEARCH_MATCH'], perPage: 20, page });
                    if (anilistResult.results.length > 0) {
                        // Enrich AniList results with the missing fields
                        const enrichedResults = await this.enrichWithAniListData(anilistResult.results);
                        timer.end();
                        return { ...anilistResult, results: enrichedResults, source: 'AniList' };
                    }
                } catch (e) {
                    console.warn(`[SourceManager] AniList search fallback failed:`, (e as Error).message);
                }
            } else {
                console.log(`✅ [SourceManager] Found ${sortedResults.length} results from: ${successfulSources.join(', ')}`);
            }

            // Enrich results with AniList data for missing fields
            const enrichedResults = await this.enrichWithAniListData(sortedResults);

            timer.end();
            return {
                results: enrichedResults,
                totalPages: maxTotalPages,
                currentPage: page,
                hasNextPage: hasNextPage,
                totalResults: enrichedResults.length,
                source: successfulSources.join('+') || 'None'
            };

        } catch (error) {
            logger.error(`Multi-source search failed`, error as Error, { query });
            return { results: [], totalPages: 0, currentPage: page, hasNextPage: false, source: 'error' };
        }
    }

    // Cache for AniList enrichment data to avoid repeated API calls
    private anilistEnrichmentCache = new Map<string, AnimeBase>();
    private enrichmentQueue = new Map<string, Promise<AnimeBase>>();

    /**
     * Enrich search results with AniList data (rating, duration, title variants)
     * DISABLED - AniList rate limiting prevents reliable enrichment
     * Description and genres will be available on detail page instead
     */
    private async enrichWithAniListData(results: AnimeBase[]): Promise<AnimeBase[]> {
        return results.map(anime => ({
            ...anime,
            voiceActors: [],
            imdbRating: undefined
        }));
    }

    /**
     * Light normalization for search dedup — preserves season/part/cour info
     * so "Spy x Family" and "Spy x Family Season 3" stay separate entries.
     */
    private normalizeForSearchDedup(title: string): string {
        if (!title) return '';
        return title.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Deduplicate search results: only collapse entries that are truly the same
     * anime from different sources (same title + season). Prefer AnimeKai IDs.
     */
    private deduplicateResults(results: AnimeBase[]): AnimeBase[] {
        const unique = new Map<string, AnimeBase>();
        const titleMap = new Map<string, AnimeBase>();

        for (const anime of results) {
            if (unique.has(anime.id)) continue;

            const key = this.normalizeForSearchDedup(anime.title);

            if (titleMap.has(key)) {
                const existing = titleMap.get(key)!;
                // Always keep AnimeFLV version for streaming reliability
                const existingIsFLV = existing.id?.startsWith('animeflv-');
                const incomingIsFLV = anime.id?.startsWith('animeflv-');
                if (existingIsFLV && !incomingIsFLV) continue;
                if (incomingIsFLV && !existingIsFLV) {
                    unique.delete(existing.id);
                    unique.set(anime.id, anime);
                    titleMap.set(key, anime);
                    continue;
                }
                // Same source or neither is primary — keep first
                continue;
            }

            unique.set(anime.id, anime);
            titleMap.set(key, anime);
        }

        return Array.from(unique.values());
    }

    /**
     * Score + sort + filter search results by relevance.
     * Drops garbage results that only match on short filler words.
     * Boosts main series over specials/OVAs when the query doesn't ask for them.
     */
    private sortByRelevance(results: AnimeBase[], query: string): AnimeBase[] {
        const q = query.toLowerCase().trim();
        const STOP = new Set(['x', 'a', 'i', 'no', 'to', 'of', 'the', 'de', 'wa', 'ni', 'vs', 'and', '&']);
        const qWords = q.split(/\s+/).filter(w => w.length >= 1);
        const meaningfulWords = qWords.filter(w => !STOP.has(w) && w.length > 1);

        const qNorm = q.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        // Does the query explicitly ask for specials/OVA?
        const queryWantsSpecial = /\b(special|ova|ona|movie)\b/i.test(q);

        const relevance = (anime: AnimeBase): number => {
            const t = (anime.title || '').toLowerCase();
            // Normalize: & → and, strip punctuation
            const tNorm = t.replace(/&/g, 'and').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

            let score = 0;

            // Exact match
            if (tNorm === qNorm || tNorm === qNorm.replace(/&/g, 'and')) { score = 1000; }
            // Title starts with the query
            else if (tNorm.startsWith(qNorm)) { score = 900; }
            // Title contains the full query as a contiguous substring
            else if (tNorm.includes(qNorm)) { score = 800; }
            else {
                // Count meaningful word matches
                const meaningfulHits = meaningfulWords.filter(w => tNorm.includes(w)).length;
                const meaningfulRatio = meaningfulWords.length > 0 ? meaningfulHits / meaningfulWords.length : 0;
                if (meaningfulRatio === 1) { score = 700 + meaningfulHits; }
                else if (meaningfulRatio >= 0.6) { score = 400 + meaningfulRatio * 100; }
                else {
                    const allHits = qWords.filter(w => tNorm.includes(w)).length;
                    const allRatio = qWords.length > 0 ? allHits / qWords.length : 0;
                    if (allRatio >= 0.5) { score = 50 + allRatio * 50; }
                    else { return 0; }
                }
            }

            // Penalize specials/OVA/ONA when the user didn't ask for them
            if (!queryWantsSpecial) {
                const isSpecial = /\b(special|specials|ova|ona)\b/i.test(t);
                if (isSpecial) score -= 200;
            }

            // Shorter titles are more likely the main entry the user wants
            score -= Math.floor(tNorm.length / 10);

            return score;
        };

        const scored = results.map(r => ({ r, score: relevance(r) }));
        const filtered = scored.filter(s => s.score >= 50);
        filtered.sort((a, b) => b.score - a.score);
        return filtered.map(s => s.r);
    }

    /**
     * Get anime details by ID
     * Handles both streaming IDs and AniList IDs
     * For AniList IDs, does a title-based search to find the streaming source
     */
    async getAnime(id: string): Promise<AnimeBase | null> {
        // Check memory cache first (fastest)
        const memCached = animeCache.get(id);
        if (memCached) {
            logger.info(`[SourceManager] Memory cache hit for anime: ${id}`);
            return memCached;
        }

        // Check database cache
        if (process.env.POSTGRES_URL) {
            try {
                const cached = await AnimeCache.getAnime(id);
                if (cached) {
                    logger.info(`[SourceManager] Database cache hit for anime: ${id}`);
                    animeCache.set(id, cached); // Cache in memory for instant next access
                    return cached;
                }
            } catch (error) {
                logger.warn(`[SourceManager] Database cache check failed:`, { error: String(error) });
            }
        }

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

                // Now search for streaming source using multiple title variants (English/Romaji/Native)
                const titlesToTry = [
                    anilistData.titleEnglish,
                    anilistData.titleRomaji,
                    anilistData.titleJapanese,
                    anilistData.title,
                ]
                    .filter((t): t is string => typeof t === 'string' && t.trim().length >= 2)
                    .map((t) => t.trim());
                const seen = new Set<string>();
                const uniqueTitles = titlesToTry.filter((t) => {
                    const key = t.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                logger.info(
                    `[SourceManager] Looking for streaming match for AniList titles: ${uniqueTitles
                        .map((t) => `"${t}"`)
                        .join(' | ')} (type: ${anilistData.type})`
                );

                let streamingMatch: AnimeBase | null = null;
                for (const t of uniqueTitles) {
                    streamingMatch = await this.findStreamingAnimeByTitle(t, anilistData.type);
                    if (streamingMatch) break;
                }

                if (streamingMatch) {
                    logger.info(`[SourceManager] Found streaming match: ${streamingMatch.id}`);
                    // Return streaming data enriched with AniList info
                    return {
                        ...streamingMatch,
                        // Preserve original AniList id for the client, but also expose the playable streaming id
                        id: `anilist-${numericId}`,
                        streamingId: streamingMatch.id,
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
        const hasPrefix = this.hasKnownSourcePrefix(id);

        if (source) {
            try {
                const result = await this.executeReliably(source.name, 'getAnime', (signal) => source.getAnime(id, { signal }));
                if (result && result.title && result.title !== 'Unknown') {
                    // Cache the result in memory (instant access)
                    animeCache.set(id, result);
                    
                    // Cache the result if database is available
                    if (process.env.POSTGRES_URL) {
                        AnimeCache.setAnime(result).catch((err: Error) => 
                            logger.warn(`[SourceManager] Failed to cache anime:`, { error: err.message })
                        );
                    }
                    return result;
                }
            } catch (error) {
                console.log(`[SourceManager] getAnime failed for ${source.name}:`, (error as Error).message);
            }
        }

        // If no prefix or source failed, try title-based resolution
        if (!hasPrefix) {
            const titleFromSlug = id.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
            if (titleFromSlug.length >= 3) {
                console.log(`[SourceManager] getAnime: Fallback title search for "${titleFromSlug}"`);
                try {
                    const searchResult = await this.search(titleFromSlug, 1);
                    if (searchResult.results?.length) {
                        const best = searchResult.results[0];
                        if (best.id && this.hasKnownSourcePrefix(best.id) && best.id !== id) {
                            console.log(`[SourceManager] getAnime: Resolved "${titleFromSlug}" → ${best.id}`);
                            return this.getAnime(best.id);
                        }
                    }
                } catch (err) {
                    console.log(`[SourceManager] getAnime: Title fallback failed:`, (err as Error).message);
                }
            }
        }

        return null;
    }

    async getEpisodes(animeId: string): Promise<Episode[]> {
        const timer = new PerformanceTimer(`getEpisodes: ${animeId}`, { animeId });
        const startTime = Date.now();

        console.log(`📺 [SourceManager] getEpisodes called: ${animeId}`);

        // Check memory cache first (fastest)
        const memCached = episodesCache.get(animeId);
        if (memCached && memCached.length > 0) {
            console.log(`[SourceManager] Memory cache hit for episodes: ${animeId}`);
            timer.end();
            return memCached;
        }

        // Check database cache
        if (process.env.POSTGRES_URL) {
            try {
                const cachedEpisodes = await AnimeCache.getEpisodes(animeId);
                if (cachedEpisodes && cachedEpisodes.length > 0) {
                    console.log(`[SourceManager] Database cache hit for episodes: ${animeId}`);
                    episodesCache.set(animeId, cachedEpisodes); // Cache in memory for instant next access
                    timer.end();
                    return cachedEpisodes;
                }
            } catch (error) {
                logger.warn(`[SourceManager] Database episode cache check failed:`, { error: String(error) });
            }
        }

        // SPECIAL HANDLING: AniList IDs need title-based search to find streaming source
        if (animeId.toLowerCase().startsWith('anilist-')) {
            console.log(`   🔍 AniList ID detected - searching by title for streaming source`);

            try {
                // Get anime details from AniList
                const anilistId = animeId.replace(/^anilist-/i, '');
                const numericId = parseInt(anilistId, 10);

                if (!isNaN(numericId)) {
                    // Fast path: we've already resolved this AniList ID to a streaming ID recently
                    const cachedMapping = this.anilistStreamingIdCache.get(numericId);
                    if (cachedMapping && cachedMapping.timestamp > Date.now() - this.ANILIST_STREAMING_ID_TTL) {
                        console.log(`   ⚡ Cache hit: AniList ${numericId} → ${cachedMapping.streamingId}`);
                        const episodes = await this.getEpisodes(cachedMapping.streamingId);
                        if (episodes && episodes.length > 0) {
                            timer.end();
                            return episodes;
                        }
                        // Cached ID no longer works — fall through to re-resolve
                        this.anilistStreamingIdCache.delete(numericId);
                    }

                    const anilistData = await anilistService.getAnimeById(numericId);

                    if (anilistData?.title) {
                        const titlesToTry = [
                            anilistData.titleEnglish,
                            anilistData.titleRomaji,
                            anilistData.titleJapanese,
                            anilistData.title,
                        ]
                            .filter((t): t is string => typeof t === 'string' && t.trim().length >= 2)
                            .map((t) => t.trim());

                        // De-dupe while preserving order
                        const seen = new Set<string>();
                        const uniqueTitles = titlesToTry.filter((t) => {
                            const key = t.toLowerCase();
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });

                        console.log(
                            `   🔍 Resolving streaming episodes for AniList titles: ${uniqueTitles
                                .map((t) => `"${t}"`)
                                .join(' | ')} (type: ${anilistData.type})`
                        );

                        const isMovie = /movie/i.test(anilistData.type || '');

                        // Helper: synthesize a single episode for movies when source returns empty list
                        const syntheticMovieEpisode = (streamingId: string, title: string): Episode[] => [{
                            id: streamingId,
                            number: 1,
                            title: title || 'Movie',
                            isFiller: false,
                            hasSub: true,
                            hasDub: false,
                        }];

                        for (const searchTitle of uniqueTitles) {
                            const byTitle = await this.findStreamingAnimeByTitle(searchTitle, anilistData.type);
                            if (!byTitle?.id || byTitle.id.startsWith('anilist-')) continue;

                            console.log(`   ✅ findStreamingAnimeByTitle: "${byTitle.title}" (${byTitle.id})`);
                            const episodes = await this.getEpisodes(byTitle.id);
                            if (episodes && episodes.length > 0) {
                                const duration = Date.now() - startTime;
                                console.log(`   ✅ Got ${episodes.length} episodes via title match in ${duration}ms`);
                                // Cache this resolution for 30 min
                                this.anilistStreamingIdCache.set(numericId, { streamingId: byTitle.id, timestamp: Date.now() });
                                timer.end();
                                return episodes;
                            }
                            // For movies: streaming source found but episode list empty — synthesize ep 1
                            if (isMovie) {
                                console.log(`   🎬 Movie match found with empty episodes, synthesizing ep 1 for ${byTitle.id}`);
                                this.anilistStreamingIdCache.set(numericId, { streamingId: byTitle.id, timestamp: Date.now() });
                                timer.end();
                                return syntheticMovieEpisode(byTitle.id, anilistData.title || byTitle.title);
                            }
                        }

                        // Fallback: try searching with simplified title (remove common suffixes/prefixes)
                        console.log(`   🔍 Trying simplified title search as fallback`);
                        const simplifiedTitles = uniqueTitles.map(t => {
                            return t
                                .replace(/-\s*the movie:\s*/gi, '') // Remove "The Movie:" prefix
                                .replace(/:\s*the movie\s*$/gi, '') // Remove ": The Movie" suffix
                                .replace(/\s*-\s*mugen train\s*$/gi, '') // Remove specific subtitle (example)
                                .replace(/\s*-\s*the movie\s*$/gi, '') // Remove " - The Movie" suffix
                                .replace(/\s*\(movie\)\s*$/gi, '') // Remove "(movie)" suffix
                                .replace(/\s*-\s*movie\s*$/gi, '') // Remove " - movie" suffix
                                .replace(/-\s*kimetsu no yaiba\s*-/gi, '') // Remove franchise name (example)
                                .replace(/-\s*season\s*\d+\s*$/gi, '') // Remove " - Season X"
                                .trim();
                        }).filter(t => t.length > 2);

                        for (const simplifiedTitle of simplifiedTitles) {
                            const byTitle = await this.findStreamingAnimeByTitle(simplifiedTitle, anilistData.type);
                            if (!byTitle?.id || byTitle.id.startsWith('anilist-')) continue;

                            console.log(`   ✅ findStreamingAnimeByTitle (simplified): "${byTitle.title}" (${byTitle.id})`);
                            const episodes = await this.getEpisodes(byTitle.id);
                            if (episodes && episodes.length > 0) {
                                const duration = Date.now() - startTime;
                                console.log(`   ✅ Got ${episodes.length} episodes via simplified title match in ${duration}ms`);
                                this.anilistStreamingIdCache.set(numericId, { streamingId: byTitle.id, timestamp: Date.now() });
                                timer.end();
                                return episodes;
                            }
                            if (isMovie) {
                                console.log(`   🎬 Movie match (simplified) with empty episodes, synthesizing ep 1 for ${byTitle.id}`);
                                this.anilistStreamingIdCache.set(numericId, { streamingId: byTitle.id, timestamp: Date.now() });
                                timer.end();
                                return syntheticMovieEpisode(byTitle.id, anilistData.title || byTitle.title);
                            }
                        }

                        // Final fallback: try searching with just the main title (everything before subtitle)
                        console.log(`   🔍 Trying main title only as final fallback`);
                        for (const title of uniqueTitles) {
                            const mainTitle = title.split(/:\s*|-\s*/)[0].trim();
                            if (mainTitle.length > 3 && mainTitle !== title) {
                                const byTitle = await this.findStreamingAnimeByTitle(mainTitle, anilistData.type);
                                if (!byTitle?.id || byTitle.id.startsWith('anilist-')) continue;

                                console.log(`   ✅ findStreamingAnimeByTitle (main title): "${byTitle.title}" (${byTitle.id})`);
                                const episodes = await this.getEpisodes(byTitle.id);
                                if (episodes && episodes.length > 0) {
                                    const duration = Date.now() - startTime;
                                    console.log(`   ✅ Got ${episodes.length} episodes via main title match in ${duration}ms`);
                                    this.anilistStreamingIdCache.set(numericId, { streamingId: byTitle.id, timestamp: Date.now() });
                                    timer.end();
                                    return episodes;
                                }
                                if (isMovie) {
                                    console.log(`   🎬 Movie match (main title) with empty episodes, synthesizing ep 1 for ${byTitle.id}`);
                                    this.anilistStreamingIdCache.set(numericId, { streamingId: byTitle.id, timestamp: Date.now() });
                                    timer.end();
                                    return syntheticMovieEpisode(byTitle.id, anilistData.title || byTitle.title);
                                }
                            }
                        }

                        console.log(`   ⚠️ No streaming episodes for AniList titles (all attempts failed)`);
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

        // If no known prefix, resolve to an AnimeKai ID via title search first.
        // Kaido streaming is unreliable (404s) so we prefer AnimeKai episode IDs.
        if (!hasSourcePrefix) {
            // Step 1: Try primary source with original ID directly
            if (primarySource?.isAvailable) {
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
                        
                        // Cache in memory for instant access
                        episodesCache.set(animeId, episodes);
                        
                        // Cache episodes if database is available
                        if (process.env.POSTGRES_URL) {
                            AnimeCache.setEpisodes(animeId, episodes).catch((err: Error) => 
                                logger.warn(`[SourceManager] Failed to cache episodes:`, { error: err.message })
                            );
                        }
                        
                        timer.end();
                        return episodes;
                    }
                } catch (err) {
                    console.log(`   ❌ Primary source failed: ${(err as Error).message}`);
                }
            }

            // Step 2: Title search — find the anime on AnimeKai by title and use those episode IDs
            const titleFromSlug = animeId.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
            if (titleFromSlug.length >= 3) {
                console.log(`   🔍 Title search for AnimeKai episodes: "${titleFromSlug}"`);
                try {
                    const searchResult = await this.search(titleFromSlug, 1);
                    if (searchResult.results?.length) {
                        const best = searchResult.results[0];
                        if (best.id && this.hasKnownSourcePrefix(best.id) && best.id !== animeId) {
                            console.log(`   🔄 Resolved to: ${best.id} ("${best.title}")`);
                            const episodes = await this.getEpisodes(best.id);
                            if (episodes && episodes.length > 0) {
                                timer.end();
                                return episodes;
                            }
                        }
                    }
                } catch (err) {
                    console.log(`   ❌ Title search failed: ${(err as Error).message}`);
                }
            }

            // Step 3: Last resort — Kaido with original ID (streaming may fail but at least shows episode list)
            const kaidoSource = this.sources.get('Kaido');
            if (kaidoSource?.isAvailable && primarySource?.name !== 'Kaido') {
                console.log(`   ⏳ Last resort: Kaido with original ID`);
                try {
                    const episodes = await this.executeReliably('Kaido', 'getEpisodes',
                        (signal) => kaidoSource.getEpisodes(animeId, { signal }),
                        { timeout: 12000 }
                    );
                    if (episodes && episodes.length > 0) {
                        const duration = Date.now() - startTime;
                        console.log(`   ✅ Got ${episodes.length} episodes from Kaido in ${duration}ms`);
                        logger.episodeFetch(animeId, episodes.length, 'Kaido', duration);
                        timer.end();
                        return episodes;
                    }
                } catch (err) {
                    console.log(`   ❌ Kaido failed: ${(err as Error).message}`);
                }
            }

            timer.end();
            return [];
        }

        // Has known prefix - try primary source first
        if (!primarySource?.isAvailable) {
            console.log(`   ❌ Primary source ${primarySource?.name || 'unknown'} not available`);
            timer.end();
            return [];
        }

        console.log(`   ⏳ Trying primary source ${primarySource.name} with ID: ${animeId}`);

        let episodes: Episode[] = [];
        try {
            episodes = await this.executeReliably(primarySource.name, 'getEpisodes',
                (signal) => primarySource.getEpisodes(animeId, { signal }),
                { timeout: 15000 }
            );
        } catch (err) {
            console.log(`   ❌ Primary source failed: ${(err as Error).message}`);
        }

        // If primary source returned episodes, try to enrich with Kaido data (sub/dub info)
        const needsEnrichment = episodes.length > 0 && 
            primarySource.name !== 'Kaido' && primarySource.name !== '9Anime' &&
            !isAdultContent;

        if (needsEnrichment) {
            console.log(`   🔄 Attempting cross-reference with Kaido for sub/dub enrichment...`);
            try {
                const rawId = this.extractRawId(animeId);
                // Strip AnimeKai hash suffix (3-5 char alphanumeric codes like "1yqp", "v2q8")
                const cleanSlug = rawId.replace(/-(?=[a-z]*\d)[a-z\d]{3,5}$/i, '');
                const searchQuery = cleanSlug.replace(/-/g, ' ').replace(/\d+$/, '').trim();
                
                const seasonMatch = cleanSlug.match(/(\d+)(?:st|nd|rd|th)[\s-]*season/i) || cleanSlug.match(/season[\s-]*(\d+)/i);
                const querySeason = seasonMatch ? parseInt(seasonMatch[1]) : 0;
                
                const kaidoSource = this.sources.get('Kaido') as StreamingSource;
                if (kaidoSource?.isAvailable && searchQuery.length > 3) {
                    const searchResult = await Promise.race([
                        kaidoSource.search(searchQuery, 1),
                        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000))
                    ]);
                    
                    if (searchResult && searchResult.results?.length > 0) {
                        let bestMatch: typeof searchResult.results[0] | null = null;
                        let bestScore = -1;
                        const qWords = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 1);
                        
                        for (const result of searchResult.results) {
                            const rLow = result.title.toLowerCase();
                            const jpLow = (result.titleJapanese || '').toLowerCase();
                            const combinedText = `${result.title} ${result.titleJapanese || ''}`.toLowerCase();
                            
                            const matchesEn = qWords.every(w => rLow.includes(w));
                            const matchesJp = qWords.every(w => jpLow.includes(w));
                            if (!matchesEn && !matchesJp) continue;
                            
                            if (querySeason > 1) {
                                const resultSeasonMatch = combinedText.match(/(\d+)(?:st|nd|rd|th)[\s-]*season/i) || 
                                    combinedText.match(/season[\s-]*(\d+)/i) ||
                                    combinedText.match(/\b(\d+)\b/);
                                const resultSeason = resultSeasonMatch ? parseInt(resultSeasonMatch[1]) : 1;
                                
                                if (resultSeason !== querySeason) {
                                    console.log(`   ⏭️ Skipping "${result.title}" (season ${resultSeason} != ${querySeason})`);
                                    continue;
                                }
                            }
                            
                            // Score: prefer shortest matching title (closest to query)
                            // Exact match gets highest score
                            const rNorm = rLow.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
                            const qNorm = searchQuery.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
                            let score = 100 - Math.abs(rNorm.length - qNorm.length);
                            if (rNorm === qNorm) score += 200;
                            if (querySeason === 0 && /\b(season|final|2nd|3rd|\d+th)\b/i.test(rLow)) score -= 50;
                            
                            if (score > bestScore) {
                                bestScore = score;
                                bestMatch = result;
                            }
                        }
                        
                        if (bestMatch) {
                            console.log(`   🔍 Found Kaido match: "${bestMatch.title}" (${bestMatch.id})`);
                            
                            const kaidoEpisodes = await Promise.race([
                                this.executeReliably('Kaido', 'getEpisodes',
                                    (signal) => kaidoSource.getEpisodes(bestMatch!.id, { signal }),
                                    { timeout: 10000 }
                                ),
                                new Promise<Episode[]>((resolve) => setTimeout(() => resolve([]), 10000))
                            ]);
                            
                            // Use anime-level dubCount from search results when episode-level hasDub is unreliable
                            const animeDubCount: number = (bestMatch as any).dubCount ?? 0;
                            const animeSubCount: number = (bestMatch as any).subCount ?? 0;
                            
                            if (kaidoEpisodes && kaidoEpisodes.length > 0) {
                                const kaidoByNum = new Map(kaidoEpisodes.map(e => [e.number, e]));
                                let enriched = 0;
                                for (const ep of episodes) {
                                    const kep = kaidoByNum.get(ep.number);
                                    if (kep) {
                                        if (kep.hasSub != null) ep.hasSub = kep.hasSub;
                                        // Prefer anime-level dubCount over broken episode-level hasDub
                                        if (animeDubCount > 0) {
                                            ep.hasDub = ep.number <= animeDubCount;
                                        } else if (kep.hasDub != null) {
                                            ep.hasDub = kep.hasDub;
                                        }
                                        if (!ep.title || ep.title === `Episode ${ep.number}`) ep.title = kep.title;
                                        enriched++;
                                    }
                                }
                                console.log(`   ✅ Enriched ${enriched}/${episodes.length} episodes (animeDubCount: ${animeDubCount})`);
                            } else if (animeDubCount > 0) {
                                // No Kaido episodes, but search told us dub exists
                                for (const ep of episodes) {
                                    ep.hasDub = ep.number <= animeDubCount;
                                }
                                console.log(`   ✅ Applied dubCount=${animeDubCount} from search (no Kaido eps)`);
                            } else {
                                console.log(`   ⚠️ Kaido returned ${kaidoEpisodes?.length || 0} eps, skipping enrichment`);
                            }
                        } else {
                            console.log(`   ℹ️ No season-matching Kaido result found`);
                        }
                    }
                }
                console.log(`   ℹ️ Using ${primarySource.name} episodes (${episodes.length} eps)`);
            } catch (err) {
                console.log(`   ℹ️ Enrichment failed (non-fatal): ${(err as Error).message}`);
            }
        }

        if (episodes.length > 0) {
            const duration = Date.now() - startTime;
            console.log(`   ✅ Got ${episodes.length} episodes from ${primarySource.name} in ${duration}ms`);
            logger.episodeFetch(animeId, episodes.length, primarySource.name, duration);
            timer.end();
            return episodes;
        }

        // Primary source returned no episodes — try backup sources with converted IDs
        const rawId = this.extractRawId(animeId);
        const backupSourceNames = REGISTERED_SOURCE_NAMES.filter(
            (name) => name !== primarySource.name && name !== 'WatchHentai' && name !== 'Hanime'
        );
        
        const strippedTitle = rawId.replace(/-\d+$/, '').replace(/[-_]/g, ' ').trim();
        console.log(`   🔄 Doing cross-source episode search for title: "${strippedTitle}"`);
        
        for (const name of backupSourceNames) {
            if (isAdultContent) continue;
            const source = this.sources.get(name) as StreamingSource;
            if (!source?.isAvailable) continue;
            
            console.log(`   ⏳ Trying backup ${name} via title search: "${strippedTitle}"`);
            try {
                // 1. Search by title instead of guessing ID format
                const searchResult = await this.executeReliably(name, 'search',
                    (signal) => source.search(strippedTitle, 1, { signal }),
                    { timeout: 8000 }
                );
                
                if (searchResult && searchResult.results?.length > 0) {
                    // Match the first result loosely
                    const bestMatchId = searchResult.results[0].id;
                    console.log(`   ✅ Found title on ${name}: ${bestMatchId}`);
                    
                    // 2. Get episodes using the native ID
                    const backupEpisodes = await this.executeReliably(name, 'getEpisodes',
                        (signal) => source.getEpisodes(bestMatchId, { signal }),
                        { timeout: 12000 }
                    );
                    
                    if (backupEpisodes && backupEpisodes.length > 0) {
                        const duration = Date.now() - startTime;
                        console.log(`   ✅ Got ${backupEpisodes.length} episodes from backup ${name} in ${duration}ms`);
                        logger.episodeFetch(bestMatchId, backupEpisodes.length, name, duration);
                        timer.end();
                        return backupEpisodes;
                    }
                }
            } catch (err) {
                console.log(`   ❌ Backup ${name} failed: ${(err as Error).message}`);
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

        // FAST PATH: bypass executeReliably queue entirely for homepage data.
        // Call sources directly with hard Promise.race timeouts.
        // Race scrapers against AniList — first with results wins.
        const HOMEPAGE_TIMEOUT = 5000;
        const startTime = Date.now();

        const availableSources = this.sourceOrder
            .filter(name => name !== 'WatchHentai' && name !== 'Hanime' && name !== 'Consumet' && name !== 'AkiH')
            .map(name => this.sources.get(name))
            .filter(source => source && source.isAvailable)
            .slice(0, 2) as StreamingSource[];

        console.log(`🔍 [SourceManager] getTrending: racing [${availableSources.map(s => s.name).join(', ')}, AniList]`);

        // Direct source calls with hard timeout — no queue, no retries
        const sourcePromises = availableSources.map(source =>
            Promise.race([
                source.getTrending(page).then(res => ({ source: source.name, results: res || [] })),
                new Promise<{ source: string; results: AnimeBase[] }>(r => setTimeout(() => r({ source: source.name, results: [] }), HOMEPAGE_TIMEOUT))
            ]).catch(() => ({ source: source.name, results: [] as AnimeBase[] }))
        );

        // AniList as parallel racer
        const anilistPromise = Promise.race([
            anilistService.advancedSearch({ sort: ['TRENDING_DESC'], perPage: 24, page })
                .then(res => ({ source: 'AniList', results: res.results || [] as AnimeBase[] })),
            new Promise<{ source: string; results: AnimeBase[] }>(r => setTimeout(() => r({ source: 'AniList', results: [] }), HOMEPAGE_TIMEOUT))
        ]).catch(() => ({ source: 'AniList', results: [] as AnimeBase[] }));

        const allPromises = [...sourcePromises, anilistPromise];

        // Return the first one that has results
        const result = await new Promise<AnimeBase[]>((resolve) => {
            let done = false;
            let remaining = allPromises.length;

            allPromises.forEach(p => p.then(r => {
                remaining--;
                if (r.results.length > 0 && !done) {
                    done = true;
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ getTrending: ${r.source} won race with ${r.results.length} results in ${duration}ms`);
                    timer.end();
                    resolve(r.results);
                }
                if (remaining <= 0 && !done) {
                    done = true;
                    timer.end();
                    console.log(`   ❌ getTrending: all sources empty`);
                    resolve([]);
                }
            }));

            // Hard safety net
            setTimeout(() => {
                if (!done) { done = true; timer.end(); resolve([]); }
            }, HOMEPAGE_TIMEOUT + 1000);
        });

        return result;
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

        // FAST PATH: bypass executeReliably queue entirely for homepage data.
        const HOMEPAGE_TIMEOUT = 5000;
        const startTime = Date.now();

        const availableSources = this.sourceOrder
            .filter(name => name !== 'WatchHentai' && name !== 'Hanime' && name !== 'Consumet' && name !== 'AkiH')
            .map(name => this.sources.get(name))
            .filter(source => source && source.isAvailable)
            .slice(0, 2) as StreamingSource[];

        console.log(`🔍 [SourceManager] getLatest: racing [${availableSources.map(s => s.name).join(', ')}, AniList]`);

        const sourcePromises = availableSources.map(source =>
            Promise.race([
                source.getLatest(page).then(res => ({ source: source.name, results: res || [] })),
                new Promise<{ source: string; results: AnimeBase[] }>(r => setTimeout(() => r({ source: source.name, results: [] }), HOMEPAGE_TIMEOUT))
            ]).catch(() => ({ source: source.name, results: [] as AnimeBase[] }))
        );

        const anilistPromise = Promise.race([
            anilistService.advancedSearch({ sort: ['START_DATE_DESC'], status: 'RELEASING', perPage: 24, page })
                .then(res => ({ source: 'AniList', results: res.results || [] as AnimeBase[] })),
            new Promise<{ source: string; results: AnimeBase[] }>(r => setTimeout(() => r({ source: 'AniList', results: [] }), HOMEPAGE_TIMEOUT))
        ]).catch(() => ({ source: 'AniList', results: [] as AnimeBase[] }));

        const allPromises = [...sourcePromises, anilistPromise];

        const result = await new Promise<AnimeBase[]>((resolve) => {
            let done = false;
            let remaining = allPromises.length;

            allPromises.forEach(p => p.then(r => {
                remaining--;
                if (r.results.length > 0 && !done) {
                    done = true;
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ getLatest: ${r.source} won race with ${r.results.length} results in ${duration}ms`);
                    timer.end();
                    resolve(r.results);
                }
                if (remaining <= 0 && !done) {
                    done = true;
                    timer.end();
                    console.log(`   ❌ getLatest: all sources empty`);
                    resolve([]);
                }
            }));

            setTimeout(() => {
                if (!done) { done = true; timer.end(); resolve([]); }
            }, HOMEPAGE_TIMEOUT + 1000);
        });

        return result;
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
                return results;
            }
        } catch (error) {
            console.log(`❌ [SourceManager] getTopRated failed on ${source.name}: ${(error as Error).message}`);
            const fallback = this.getAvailableSource();
            if (fallback && fallback !== source) {
                try {
                    const results = await this.executeReliably(fallback.name, 'getTopRated', (signal) => fallback.getTopRated(page, limit, { signal }));
                    if (results && results.length > 0) return results;
                } catch { /* fall through to AniList */ }
            }
        }

        // AniList fallback
        try {
            console.log(`[SourceManager] getTopRated: scrapers empty, falling back to AniList`);
            const anilistResult = await anilistService.getTopRatedAnime(page, limit);
            if (anilistResult.results.length > 0) {
                return anilistResult.results.map((a, i) => ({ rank: (page - 1) * limit + i + 1, anime: a }));
            }
        } catch (e) {
            console.warn(`[SourceManager] AniList top-rated fallback failed:`, (e as Error).message);
        }
        return [];
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
            // Try fallback - don't permanently disable the source for a single failure
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
            // Use only WatchHentai for adult content - simpler and more consistent
            effectiveSource = filters.source && ['WatchHentai', 'Hanime', 'AkiH'].includes(filters.source) 
                ? filters.source 
                : 'WatchHentai';
        } else if (mode === 'mixed') {
            // For mixed mode, just use standard source - adult content should use adult mode
            // This avoids duplicate results across pages when combining sources
            const standardSource = this.getAvailableSource(filters.source);
            if (standardSource) {
                effectiveSource = filters.source;
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

        // STRATEGY: Try AniList first (stable public API), then fall back to native scrapers.
        // Skip AniList for adult mode - use native source methods instead
        const canUseAniList = filters.mode !== 'adult';

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
                            // Has streaming source - include it with richer data
                            enrichedResults.push({
                                ...match,
                                genres: anime.genres,
                                rating: anime.rating || match.rating,
                                year: anime.year || match.year,
                                streamingId: match.id,
                                source: match.source || 'Kaido'
                            });
                        } else {
                            // Include AniList result directly — streaming ID resolved lazily on watch
                            enrichedResults.push(anime);
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

            const isAdultSource = ['WatchHentai', 'Hanime'].includes(source.name);

            // Special Case 1: Genre-only browsing with source support (including adult sources)
            if (filters.genres && filters.genres.length > 0 && typeof (source as any).getByGenre === 'function') {
                try {
                    const genre = filters.genres[0];
                    const genreResult = await (source as any).getByGenre(genre, page);
                    // If genre returns results, use them. Otherwise, don't fall through to massive crawl.
                    // Just return empty or try getLatest for adult sources.
                    if (genreResult.results && genreResult.results.length > 0) {
                        finalResults = genreResult.results;
                        totalResults = genreResult.totalResults || 1000;
                        totalPages = genreResult.totalPages || 100;
                        hasNextPage = genreResult.hasNextPage;
                        isPaginatedResult = true;
                        logger.info(`[SourceManager] Genre browse success via ${source.name} for genre: ${genre}`);
                    } else if (isAdultSource) {
                        // Genre not found on adult source - use getLatest instead of 48-page crawl
                        const latestResult = await (source as any).getLatest(page);
                        if (latestResult.length > 0) {
                            finalResults = latestResult;
                            totalResults = 100;
                            totalPages = 5;
                            hasNextPage = page < 5;
                            isPaginatedResult = true;
                            logger.info(`[SourceManager] Genre "${genre}" not found, falling back to latest via ${source.name}`);
                        }
                    }
                } catch (e) {
                    logger.warn(`[SourceManager] Genre browse failed on ${source.name}, trying getLatest for adult`);
                    if (isAdultSource) {
                        const latestResult = await (source as any).getLatest(page);
                        if (latestResult.length > 0) {
                            finalResults = latestResult;
                            isPaginatedResult = true;
                        }
                    }
                }
            }

            // Special Case 2: Type-only browsing for non-adult sources
            // For adult sources without genre, use getLatest() instead of getByType() to avoid 48-page crawl
            if (!isPaginatedResult && typeof (source as any).getByType === 'function' && filters.type && !isAdultSource) {
                try {
                    const typeResult = await (source as any).getByType(filters.type, page);
                    if (typeResult.results && typeResult.results.length > 0) {
                        finalResults = typeResult.results;
                        totalResults = typeResult.totalResults || typeResult.totalPages * (filters.limit || 25);
                        totalPages = typeResult.totalPages || 100;
                        hasNextPage = typeResult.hasNextPage;
                        isPaginatedResult = true;
                        logger.info(`[SourceManager] Type browse success via ${source.name} - ${typeResult.totalPages} pages, ${typeResult.results.length} results on page ${page}`);
                    }
                } catch (e) {
                    logger.warn(`[SourceManager] Type browse failed on ${source.name}, falling back to trending`);
                }
            }

            // Special Case 3: Adult source with no genre/type filter - use getLatest (not getByType which crawls)
            if (!isPaginatedResult && isAdultSource && !filters.type && typeof (source as any).getLatest === 'function') {
                try {
                    const latestResult = await (source as any).getLatest(page);
                    if (latestResult.length > 0) {
                        finalResults = latestResult;
                        totalResults = 100;
                        totalPages = 5;
                        hasNextPage = page < 5;
                        isPaginatedResult = true;
                        logger.info(`[SourceManager] Adult source ${source.name} using latest page ${page} (${latestResult.length} results)`);
                    }
                } catch (e) {
                    logger.warn(`[SourceManager] getLatest failed on ${source.name}, falling back to trending`);
                }
            }

            // Normal Case: Trending / Popular / Latest + Local Filtering
            // Use MULTI-SOURCE aggregation for better results and streaming coverage
            if (!isPaginatedResult) {
                // Get backup sources to aggregate from - prioritize reliable streaming sources
                // Skip backup sources for adult sources since they don't have adult content
                const isAdultSource = ['WatchHentai', 'Hanime'].includes(source.name);
                const backupSourceNames = isAdultSource ? [] : REGISTERED_SOURCE_NAMES.filter(
                    (n) => n !== source.name && n !== 'WatchHentai' && n !== 'Hanime'
                );
                const backupSources = backupSourceNames
                    .map(n => this.sources.get(n))
                    .filter(s => s?.isAvailable) as StreamingSource[];
                
                logger.info(`[SourceManager] Multi-source browse: primary=${source.name}, backups=${backupSources.map(s => s.name).join(',')}`);

                // Fetch from primary source and backups in parallel
                const fetchPromises: Promise<AnimeBase[]>[] = [];
                
                // Primary source - fetch multiple pages (but only 1 for adult sources to avoid pagination overlap)
                const pagesToFetch = isAdultSource ? 1 : (sortType === 'shuffle' ? 3 : 2);
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

                // Content mode filtering - skip for adult sources since all their content is adult
                const mode = filters.mode || 'mixed';
                const adultGenres = ['hentai', 'ecchi', 'yaoi', 'yuri'];

                if (!isAdultSource) {
                    if (mode === 'safe') {
                        // Exclude adult content
                        filtered = filtered.filter(a => {
                            if (!a.genres || a.genres.length === 0) return true;
                            return !a.genres.some(g => g && adultGenres.includes(g.toLowerCase()));
                        });
                    } else if (mode === 'adult') {
                        // Only show adult content
                        filtered = filtered.filter(a => {
                            if (!a.genres || a.genres.length === 0) return false;
                            return a.genres.some(g => g && adultGenres.includes(g.toLowerCase()));
                        });
                    }
                    // mixed mode: show everything (no filtering)
                }

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

        // Filter out results with no ID at all; AniList results are allowed through
        // since streaming is resolved lazily on the watch page.
        const streamableResults = finalResults.filter(anime => {
            if (!anime.id) return false;
            // AniList results without a pre-matched streaming ID are still valid —
            // the watch page resolves the streaming source lazily.
            if (anime.id.startsWith('anilist-')) return true;
            // For non-AniList results, require a known streaming source.
            const hasStreamingPrefix = this.hasKnownSourcePrefix(anime.id);
            const isFromStreamingSource = anime.source && !['AniList', 'MAL'].includes(anime.source);
            return hasStreamingPrefix || isFromStreamingSource || !!anime.streamingId;
        });

        logger.info(`[SourceManager] Browse filtered: ${finalResults.length} -> ${streamableResults.length} streamable results`);

        // For paginated results (from getByType, getByGenre, etc.), preserve the source's pagination metadata
        // For non-paginated results (from getTrending/getLatest), keep the calculated values
        // This ensures pagination is accurate even after deduplication
        const streamableTotalResults = isPaginatedResult ? totalResults : totalResults;
        const streamableTotalPages = isPaginatedResult ? totalPages : totalPages;

        return {
            anime: streamableResults,
            totalPages: streamableTotalPages,
            hasNextPage,
            totalResults: streamableTotalResults
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

        // No prefix = universal slug (one-piece-100?ep=2): try any source that supports slug?ep=
        if (!hasSourcePrefix) {
            const slugSources = ['AnimeKai', '9Anime'] as const;
            const toTry = slugSources
                .map(n => this.sources.get(n) as StreamingSource)
                .filter((s): s is StreamingSource => !!s?.isAvailable && !!s.getEpisodeServers);
            for (const source of toTry) {
                try {
                    console.log(`   ⏳ Trying ${source.name} with slug: ${episodeId}`);
                    const servers = await this.executeReliably(source.name, 'getEpisodeServers',
                        (signal) => source.getEpisodeServers!(episodeId, { signal }),
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

        // Has known prefix - can try a couple backup sources
        const rawId = this.extractRawId(episodeId);
        const sourcesToTry: StreamingSource[] = [];
        
        if (primarySource?.isAvailable && primarySource.getEpisodeServers) {
            sourcesToTry.push(primarySource);
        }

        // Add limited backup sources
        const backupNames = REGISTERED_SOURCE_NAMES.filter((n) => n !== primarySource?.name);
        for (const name of backupNames) {
            const source = this.sources.get(name) as StreamingSource;
            if (source?.isAvailable && source.getEpisodeServers) {
                sourcesToTry.push(source);
            }
        }

        // Try sources sequentially (servers are fast, no need for parallel)
        for (const source of sourcesToTry) {
            const idToUse = this.resolveStreamingEpisodeId(episodeId, source, primarySource, hasSourcePrefix, rawId);
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
    async getStreamingLinks(episodeId: string, server?: string, category: 'sub' | 'dub' = 'sub', episodeNum?: number, anilistId?: number): Promise<StreamingData> {
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
        
        // Add primary source first: matching prefix or any available for raw slug
        // Removed isAvailable check to try all sources even if health check failed
        const primaryMatchesId = primarySource && hasSourcePrefix && primarySource.getStreamingLinks;
        if (primaryMatchesId && !sourcesToTry.includes(primarySource!)) {
            sourcesToTry.push(primarySource!);
        }
        if (primarySource?.getStreamingLinks && !sourcesToTry.includes(primarySource)) {
            sourcesToTry.push(primarySource);
        }

        // Backup sources: only names actually registered in the constructor (see REGISTERED_SOURCE_NAMES).
        const backupNames = REGISTERED_SOURCE_NAMES.filter((n) => n !== primarySource?.name);
        for (const name of backupNames) {
            if (isAdultContent && name !== 'WatchHentai' && name !== 'Hanime') continue;
            if (!isAdultContent && (name === 'WatchHentai' || name === 'Hanime')) continue;
            const source = this.sources.get(name) as StreamingSource;
            if (source?.isAvailable && source.getStreamingLinks && !sourcesToTry.includes(source)) {
                sourcesToTry.push(source);
            }
        }

        // Tie-break order = constructor registration order (REGISTERED_SOURCE_NAMES).
        const STREAM_PRIORITY = [...REGISTERED_SOURCE_NAMES];
        const ordered: StreamingSource[] = [];
        for (const name of STREAM_PRIORITY) {
            const s = sourcesToTry.find(x => x.name === name);
            if (s && !ordered.includes(s)) ordered.push(s);
        }
        for (const s of sourcesToTry) {
            if (!ordered.includes(s)) ordered.push(s);
        }
        let finalSources = ordered;

        // HiAnime/Miruro embed ids (`slug?ep=<token>`) should not fan out to every scraper —
        // several providers will launch Puppeteer and keep running long after we've already
        // decided to give up, which delays HTTP responses and makes the client feel "stuck".
        if (isHianimeStyleEpisodeId(episodeId)) {
            const allow = new Set<string>([
                'Miruro',
                'Consumet',
                'AllAnime',
                'AnimeKai',
                'Gogoanime',
                'AnimePahe',
                'Zoro',
                'AnimeFLV',
                'Aniwave',
                'Anix',
            ]);
            finalSources = finalSources.filter((s) => allow.has(s.name));
        }

        console.log(`   📋 Sources to try (priority-ordered): ${finalSources.map(s => s.name).join(', ')}`);

        /** Prefer Miruro + API mirrors for aniwatch-shaped IDs so we do not wait on Puppeteer first. */
        const buildStreamingPickOrder = (epId: string): string[] => {
            // HiAnime/Miruro episode keys are usually `slug?ep=<id>` where `<id>` is often NOT numeric
            // (e.g. Miruro's `$ep=12$token=XXXX` normalizes to `slug?ep=XXXX`).
            const watchShape = /^[^/?#]+\?ep=[^&?#]+$/i.test(epId);
            if (!watchShape) return [...STREAM_PRIORITY, 'cross-source'];
            const preferred = [
                'Miruro',
                'Consumet',
                'AllAnime',
                'Gogoanime',
                'AnimePahe',
                'AnimeKai',
                'Zoro',
                '9Anime',
                'AnimeFLV',
                'Aniwave',
                'Anix',
            ];
            const seen = new Set<string>();
            const out: string[] = [];
            for (const n of preferred) {
                if (STREAM_PRIORITY.includes(n) && !seen.has(n)) {
                    out.push(n);
                    seen.add(n);
                }
            }
            for (const n of STREAM_PRIORITY) {
                if (!seen.has(n)) {
                    out.push(n);
                    seen.add(n);
                }
            }
            out.push('cross-source');
            return out;
        };

        if (finalSources.length === 0) {
            console.log(`   ❌ No available sources for streaming`);
            logger.warn(`No available sources for streaming: ${episodeId}`, { episodeId }, 'SourceManager');
            timer.end();
            return { sources: [], subtitles: [] };
        }

        // Fast-path: race all sources in parallel, return as soon as a high-priority
        // source succeeds instead of waiting for every source to finish/timeout.
        type RaceResult = { source: string; data: StreamingData; success: boolean };

        const pickOrder = buildStreamingPickOrder(episodeId);
        const allResults: RaceResult[] = [];
        let resolved = false;
        let graceTimer: ReturnType<typeof setTimeout> | null = null;
            const GRACE_PERIOD = 3000; // Wait up to 3s for a higher-priority source after first success
            /** Cross-source does search + episodes + stream per provider (~40s worst case). Cap so watch API does not hang. */
            // Keep watch-page requests bounded: long hangs feel like "infinite loading" in the UI
            // even though the browser may abort earlier.
            const CROSS_SOURCE_FALLBACK_MAX_MS = 14_000;
            const STREAM_GLOBAL_MAX_MS = 18_000;

            const result = await new Promise<StreamingData>((resolveStream) => {
            let pending = 0;

            const pickBestAndResolve = (force = false) => {
                if (resolved) return;
                const ok = allResults.filter(r => r.success);
                if (ok.length === 0) return false;
                // Prefer sources with real M3U8/MP4 streams over embed-only fallbacks
                const hasRealStream = (r: RaceResult) =>
                    r.data.sources.some((s) => {
                        const u = (s as { originalUrl?: string }).originalUrl || s.url || '';
                        return u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mpd');
                    });
                // Strongly prefer proxyable streams (M3U8/HLS) over IP-locked sources
                // (e.g. Streamtape /get_video URLs whose CDN token is bound to the
                // server IP — breaks when proxied through serverless/Vercel).
                const hasProxyableStream = (r: RaceResult) =>
                    r.data.sources.some((s) => {
                        if ((s as { ipLocked?: boolean }).ipLocked) return false;
                        const u = (s as { originalUrl?: string }).originalUrl || s.url || '';
                        // Streamtape direct videos are IP-locked even without the flag
                        if ((u.includes('streamtape') || u.includes('tapecontent')) && u.includes('get_video')) return false;
                        return u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mpd');
                    });
                const proxyableOk = ok.filter(hasProxyableStream);

                // If only IP-locked sources are available and there are still pending
                // requests (cross-source fallback may return HLS), don't resolve yet.
                if (!force && proxyableOk.length === 0 && pending > 0) {
                    console.log(`   ⏳ Only IP-locked sources so far, waiting for ${pending} pending source(s)...`);
                    return false;
                }

                const realOk = proxyableOk.length > 0 ? proxyableOk : ok.filter(hasRealStream);
                const candidates = realOk.length > 0 ? realOk : ok;
                // Pick the highest-priority successful source
                let best: RaceResult | null = null;
                for (const name of pickOrder) {
                    const match = candidates.find(r => r.source === name);
                    if (match) { best = match; break; }
                }
                if (!best) best = candidates[0];
                resolved = true;
                if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
                const duration = Date.now() - startTime;
                logger.streamingSuccess('unknown', episodeId, best.source,
                    best.data.sources[0]?.quality || 'unknown', duration);
                timer.end();
                console.log(`   ✅ Picked stream source: ${best.source} (${best.data.sources.length} URLs, ${duration}ms)`);
                resolveStream(best.data);
                return true;
            };

            const tryResolve = () => {
                if (resolved) return;
                const ok = allResults.filter(r => r.success);
                if (ok.length === 0) return;

                // Check if the top-priority source already responded (success or fail)
                const topPriority = pickOrder[0];
                const topResult = allResults.find(r => r.source === topPriority);
                if (topResult) {
                    // Top priority responded — pick best now
                    pickBestAndResolve();
                    return;
                }

                // First success arrived but top priority hasn't responded yet.
                // Start a grace period — if top priority responds within GRACE_PERIOD, use it.
                // Otherwise, resolve with what we have.
                if (!graceTimer) {
                    console.log(`   ⏱️ First stream available, waiting ${GRACE_PERIOD}ms for higher-priority source...`);
                    graceTimer = setTimeout(() => {
                        graceTimer = null;
                        pickBestAndResolve();
                    }, GRACE_PERIOD);
                }
            };

            const onDone = () => {
                pending--;
                tryResolve();
                if (pending <= 0 && !resolved) {
                    // All sources done, pick whatever we have (force=true bypasses IP-lock wait)
                    if (!pickBestAndResolve(true)) {
                        resolved = true;
                        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
                        timer.end();
                        console.log(`   ❌ No sources found after trying all available sources`);
                        logger.streamingFailed('unknown', episodeId, 'all-sources', 'No sources returned streaming URLs');
                        resolveStream({ sources: [], subtitles: [] });
                    }
                }
            };

            // Global safety — return 404 before the client feels stuck forever (~60s fetches)
            setTimeout(() => {
                if (!resolved) {
                    console.log(`   ⏰ Global streaming timeout (${STREAM_GLOBAL_MAX_MS}ms) — resolving with best available`);
                    if (!pickBestAndResolve(true)) {
                        resolved = true;
                        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
                        timer.end();
                        logger.streamingFailed('unknown', episodeId, 'all-sources', 'Global timeout');
                        resolveStream({ sources: [], subtitles: [] });
                    }
                }
            }, STREAM_GLOBAL_MAX_MS);

            for (const source of finalSources) {
                pending++;
                const idToUse = this.resolveStreamingEpisodeId(episodeId, source, primarySource, hasSourcePrefix, rawId);
                console.log(`   📡 ${source.name} trying with ID: ${idToUse}`);

                const usesPuppeteerStream = source.name === '9Anime' || source.name === 'Kaido';
                const usesMiruroStack = source.name === 'Miruro';
                const streamReliabilityOpts = usesPuppeteerStream
                    ? { timeout: 50_000, maxAttempts: 1 }
                    : usesMiruroStack
                        ? { timeout: 25_000, maxAttempts: 1 }
                        : { timeout: 25_000, maxAttempts: 1 };
                this.executeReliably(source.name, 'getStreamingLinks',
                    (signal) => source.getStreamingLinks!(idToUse, server, category, { signal, episodeNum, anilistId }),
                    streamReliabilityOpts
                )
                .then(data => {
                    if (data.sources.length > 0) {
                        console.log(`   ✅ ${source.name} returned ${data.sources.length} sources`);
                        allResults.push({ source: source.name, data, success: true });
                    } else {
                        allResults.push({ source: source.name, data, success: false });
                    }
                })
                .catch(err => {
                    console.log(`   ❌ ${source.name} failed: ${(err as Error).message?.substring(0, 80)}`);
                    allResults.push({ source: source.name, data: { sources: [], subtitles: [] } as StreamingData, success: false });
                })
                .finally(onDone);
            }

            // Cross-source title-based fallback (lower priority, runs in parallel; time-boxed — full uncapped run can exceed 35s)
            pending++;
            Promise.race([
                this.crossSourceStreamingFallback(episodeId, server, category, episodeNum, anilistId),
                new Promise<StreamingData | null>((resolve) =>
                    setTimeout(() => resolve(null), CROSS_SOURCE_FALLBACK_MAX_MS),
                ),
            ])
                .then(data => {
                    if (data && data.sources.length > 0) {
                        console.log(`   ✅ Cross-source fallback got ${data.sources.length} sources`);
                        allResults.push({ source: 'cross-source', data, success: true });
                    } else {
                        allResults.push({
                            source: 'cross-source',
                            data: { sources: [], subtitles: [] } as StreamingData,
                            success: false,
                        });
                    }
                })
                .catch(err => {
                    console.log(`   ❌ Cross-source fallback failed: ${(err as Error).message?.substring(0, 80)}`);
                    allResults.push({ source: 'cross-source', data: { sources: [], subtitles: [] } as StreamingData, success: false });
                })
                .finally(onDone);

        });

        return result;
    }

    /**
     * Direct AnimeKai (Consumet) fetch using native compound id when we only have `slug?ep=TOKEN` on the wire
     * plus catalog episode from `ep_num` (from `slug$ep=N$token=TOKEN` on the client).
     */
    async tryAnimeKaiCompoundFromWatchQueryEpisode(
        watchEpisodeId: string,
        catalogEpisode: number,
        server?: string,
        category: 'sub' | 'dub' = 'sub',
        extra?: { anilistId?: number }
    ): Promise<StreamingData | null> {
        const compound = reconstructAnimeKaiCompoundFromWatchUrl(watchEpisodeId, catalogEpisode);
        if (!compound) return null;
        const kai = this.sources.get('AnimeKai') as StreamingSource | undefined;
        if (!kai?.getStreamingLinks) return null;
        const id = `animekai-${compound}`;
        try {
            const data = await this.executeReliably(
                'AnimeKai',
                'getStreamingLinks',
                (signal) =>
                    kai.getStreamingLinks!(id, server, category, {
                        signal,
                        episodeNum: catalogEpisode,
                        anilistId: extra?.anilistId,
                    }),
                { timeout: 14_000, maxAttempts: 1 }
            );
            if (data?.sources?.length) return data;
        } catch {
            /* ignore */
        }
        return null;
    }

    /**
     * Cross-source streaming fallback: when primary source streaming fails,
     * look up the anime on AnimePahe/AnimeKai by title and match the episode by number.
     */
    private async crossSourceStreamingFallback(
        episodeId: string,
        server?: string,
        category: 'sub' | 'dub' = 'sub',
        hintEpisodeNum?: number,
        anilistId?: number
    ): Promise<StreamingData | null> {
        let title = this.episodeIdToFallbackSearchTitle(episodeId);
        if (!title && !anilistId) return null;

        // Use AniList API to get the canonical title (romaji/english) for better search
        if (anilistId) {
            try {
                const { default: axios } = await import('axios');
                const query = `query($id:Int){Media(id:$id,type:ANIME){title{romaji english}}}`;
                const res = await axios.post<{ data: { Media: { title: { romaji: string; english: string | null } } } }>(
                    'https://graphql.anilist.co',
                    { query, variables: { id: anilistId } },
                    { timeout: 5000, headers: { 'Content-Type': 'application/json' } }
                );
                const t = res.data?.data?.Media?.title;
                if (t?.romaji) title = t.romaji;
                else if (t?.english) title = t.english;
            } catch { /* use slug-derived title */ }
        }

        if (!title) return null;

        console.log(`   🔄 Cross-source fallback: searching "${title}" on fallback sources${anilistId ? ` (anilistId=${anilistId})` : ''}`);

        // Determine target episode number
        let targetEpNum: number | null = null;

        // Method 1: find the episode in the Kaido episode list (likely cached)
        let animeSlug = episodeId.split('?')[0];
        const dollar = animeSlug.indexOf('$');
        if (dollar !== -1) animeSlug = animeSlug.slice(0, dollar);
        const kaidoSource = this.sources.get('Kaido') as StreamingSource;
        if (kaidoSource?.isAvailable) {
            try {
                const kaidoId = animeSlug.includes('kaido-') ? animeSlug : `kaido-${animeSlug}`;
                const eps = await Promise.race([
                    kaidoSource.getEpisodes!(kaidoId, { timeout: 15000 }),
                    new Promise<Episode[]>((_, r) => setTimeout(() => r(new Error('timeout')), 15000))
                ]);
                const match = eps.find(e => e.id === episodeId);
                if (match) targetEpNum = match.number;
            } catch { /* ignore */ }
        }

        // Method 1b: 9anime/kaido watch shape "slug?ep=INTERNAL" — ep is NOT the display number; match listing IDs
        if (!targetEpNum && /^[^?]+\?ep=\d+$/i.test(episodeId)) {
            const slugOnly = episodeId.split('?')[0];
            const nine = this.sources.get('9Anime') as StreamingSource;
            if (nine?.getEpisodes) {
                try {
                    const numericSuffix = slugOnly.match(/-(\d+)$/)?.[1];
                    if (numericSuffix) {
                        const eps = await Promise.race([
                            nine.getEpisodes(`9anime-${slugOnly}`, { timeout: 15_000 }),
                            new Promise<Episode[]>((_, r) => setTimeout(() => r(new Error('timeout')), 15_000))
                        ]);
                        const hit = eps.find((e) => e.id === episodeId);
                        if (hit?.number != null) targetEpNum = hit.number;
                    }
                } catch { /* ignore */ }
            }
        }

        // Method 2: try to infer from the episode's position (ep param is internal, not the episode number)
        if (!targetEpNum) {
            // Some slugs have $ep=N format (AnimeKai) where N IS the episode number
            const dollarEp = episodeId.match(/\$ep=(\d+)/)?.[1];
            if (dollarEp) {
                targetEpNum = parseInt(dollarEp, 10);
            }
        }

        // Method 3: use the frontend-provided hint, else default to 1
        if (!targetEpNum) {
            targetEpNum = hintEpisodeNum ?? 1;
            console.log(`   ⚠️ Could not determine episode number, using ${hintEpisodeNum ? `hint=${hintEpisodeNum}` : 'default=1'}`);
        }

        console.log(`   🔢 Target episode number: ${targetEpNum}`);

        // Registered sources to try for cross-source fallback (by title search).
        // AllAnime is first: GraphQL API + fast4speed.rsvp CDN accessible from cloud IPs.
        const consumetSources = ['AllAnime', 'Gogoanime', 'AnimeKai', 'AnimePahe', 'Consumet']
            .map(n => ({ name: n, src: this.sources.get(n) as StreamingSource }))
            .filter(({ src }) => src?.isAvailable && src.getStreamingLinks);

        const crossResults = await Promise.allSettled(
            consumetSources.map(async ({ name: srcName, src }) => {
                // Consumet (Gogoanime) splits sub and dub into separate entities.
                let searchTitle = title;
                if (category === 'dub' && srcName === 'Consumet') {
                    searchTitle = `${title} dub`;
                }

                console.log(`   📡 ${srcName} title-search for "${searchTitle}"`);
                const searchResult = await Promise.race([
                    src.search(searchTitle, 1),
                    new Promise<AnimeSearchResult>((_, r) => setTimeout(() => r(new Error('timeout')), 15000))
                ]);
                if (!searchResult.results?.length) throw new Error('no results');

                const bestMatch = searchResult.results[0];
                console.log(`   📺 ${srcName} found: "${bestMatch.title}" (${bestMatch.id})`);

                const episodes = await Promise.race([
                    src.getEpisodes!(bestMatch.id, { timeout: 15000 }),
                    new Promise<Episode[]>((_, r) => setTimeout(() => r(new Error('timeout')), 15000))
                ]);
                if (!episodes?.length) throw new Error('no episodes');

                const targetEp = episodes.find(e => e.number === targetEpNum);
                if (!targetEp) throw new Error(`ep ${targetEpNum} not in ${episodes.length} episodes`);

                console.log(`   ⏳ ${srcName}: streaming ep ${targetEpNum} (ID: ${targetEp.id})`);
                const streamData = await Promise.race([
                    src.getStreamingLinks!(targetEp.id, server, category, { timeout: 20000 }),
                    new Promise<StreamingData>((_, r) => setTimeout(() => r(new Error('timeout')), 20000))
                ]);
                if (!streamData.sources.length) throw new Error('no sources');

                console.log(`   ✅ ${srcName}: ${streamData.sources.length} streaming sources`);
                return streamData;
            })
        );

        for (const r of crossResults) {
            if (r.status === 'fulfilled') return r.value;
        }

        return null;
    }

    /**
     * Direct AllAnime fallback: when only IP-locked sources are available,
     * use AniList title + AllAnime search to find non-IP-locked streams.
     */
    async tryAllAnimeFallback(
        episodeId: string,
        category: 'sub' | 'dub' = 'sub',
        episodeNum?: number,
        anilistId?: number
    ): Promise<StreamingData | null> {
        const allAnime = this.sources.get('AllAnime') as StreamingSource;
        if (!allAnime?.isAvailable || !allAnime.getStreamingLinks) return null;

        // Get title from AniList or slug
        let title = this.episodeIdToFallbackSearchTitle(episodeId);
        if (anilistId) {
            try {
                const { default: axios } = await import('axios');
                const query = `query($id:Int){Media(id:$id,type:ANIME){title{romaji english}}}`;
                const res = await axios.post<{ data: { Media: { title: { romaji: string; english: string | null } } } }>(
                    'https://graphql.anilist.co',
                    { query, variables: { id: anilistId } },
                    { timeout: 5000, headers: { 'Content-Type': 'application/json' } }
                );
                const t = res.data?.data?.Media?.title;
                if (t?.romaji) title = t.romaji;
                else if (t?.english) title = t.english;
            } catch { /* use slug-derived title */ }
        }
        if (!title) return null;

        const targetEpNum = episodeNum ?? 1;
        console.log(`[AllAnime fallback] Searching "${title}" ep ${targetEpNum}`);

        try {
            const searchResult = await Promise.race([
                allAnime.search(title, 1),
                new Promise<AnimeSearchResult>((_, r) => setTimeout(() => r(new Error('timeout')), 15000))
            ]);
            if (!searchResult.results?.length) return null;

            const bestMatch = searchResult.results[0];
            console.log(`[AllAnime fallback] Found: "${bestMatch.title}" (${bestMatch.id})`);

            const episodes = await Promise.race([
                allAnime.getEpisodes!(bestMatch.id, { timeout: 15000 }),
                new Promise<Episode[]>((_, r) => setTimeout(() => r(new Error('timeout')), 15000))
            ]);
            if (!episodes?.length) return null;

            const targetEp = episodes.find(e => e.number === targetEpNum);
            if (!targetEp) {
                console.log(`[AllAnime fallback] ep ${targetEpNum} not in ${episodes.length} episodes`);
                return null;
            }

            console.log(`[AllAnime fallback] Streaming ep ${targetEpNum} (ID: ${targetEp.id})`);
            const streamData = await Promise.race([
                allAnime.getStreamingLinks!(targetEp.id, undefined, category, { timeout: 25000 }),
                new Promise<StreamingData>((_, r) => setTimeout(() => r(new Error('timeout')), 25000))
            ]);
            if (!streamData.sources?.length) return null;

            console.log(`[AllAnime fallback] Got ${streamData.sources.length} source(s)`);
            return streamData;
        } catch (e) {
            console.log(`[AllAnime fallback] Failed: ${(e as Error).message}`);
            return null;
        }
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
                        source: match.source || 'Kaido'
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
                                    source: searchMatch.source || 'Kaido'
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
    private readonly SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minute cache
    // Long-lived cache: AniList numeric ID → resolved streaming ID. Avoids repeated title searches.
    private anilistStreamingIdCache: Map<number, { streamingId: string; timestamp: number }> = new Map();
    private readonly ANILIST_STREAMING_ID_TTL = 30 * 60 * 1000; // 30 minutes

    /**
     * Resolve an AniList id to a playable streaming id.
     * Uses multiple title variants + multi-source search as fallback.
     */
    async resolveAniListToStreamingId(anilistNumericId: number): Promise<string | null> {
        if (!Number.isFinite(anilistNumericId) || anilistNumericId <= 0) return null;

        const cachedMapping = this.anilistStreamingIdCache.get(anilistNumericId);
        if (cachedMapping && cachedMapping.timestamp > Date.now() - this.ANILIST_STREAMING_ID_TTL) {
            return cachedMapping.streamingId;
        }

        const anilistData = await anilistService.getAnimeById(anilistNumericId);
        if (!anilistData?.title) return null;

        const titlesToTry = [
            anilistData.titleEnglish,
            anilistData.titleRomaji,
            anilistData.titleJapanese,
            anilistData.title,
        ]
            .filter((t): t is string => typeof t === 'string' && t.trim().length >= 2)
            .map((t) => t.trim());

        const seen = new Set<string>();
        const uniqueTitles = titlesToTry.filter((t) => {
            const key = t.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Fast path: try the dedicated title matcher.
        for (const t of uniqueTitles) {
            const match = await this.findStreamingAnimeByTitle(t, anilistData.type);
            if (match?.id && !match.id.startsWith('anilist-')) {
                this.anilistStreamingIdCache.set(anilistNumericId, { streamingId: match.id, timestamp: Date.now() });
                return match.id;
            }
        }

        // Fallback: multi-source search and pick best similarity.
        const normalize = (s: string) =>
            s
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

        const scoreCandidate = (queryTitle: string, candidateTitle: string) => {
            const q = normalize(queryTitle);
            const c = normalize(candidateTitle);
            if (!q || !c) return 0;
            if (q === c) return 10;
            const qWords = q.split(' ').filter((w) => w.length >= 3);
            let hits = 0;
            for (const w of qWords) if (c.includes(w)) hits++;
            return hits / Math.max(1, qWords.length);
        };

        for (const t of uniqueTitles) {
            const all = await this.searchAll(t, 1);
            const candidates = (all?.results || []).filter((r) => r?.id && !String(r.id).startsWith('anilist-'));
            if (!candidates.length) continue;

            const best = candidates
                .map((c) => ({
                    c,
                    s:
                        scoreCandidate(anilistData.title, c.title) +
                        (anilistData.titleJapanese ? 0.35 * scoreCandidate(anilistData.titleJapanese, c.title) : 0) +
                        (c.type === anilistData.type ? 0.25 : 0),
                }))
                .sort((a, b) => b.s - a.s)[0];

            if (best?.c?.id && best.s >= 0.34) {
                this.anilistStreamingIdCache.set(anilistNumericId, { streamingId: best.c.id, timestamp: Date.now() });
                return best.c.id;
            }
        }

        return null;
    }

    /**
     * Calculate similarity between two strings (simple Levenshtein-based ratio)
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const s1 = str1.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const s2 = str2.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

        // Extract season numbers for better matching
        const extractSeason = (s: string): number | null => {
            const seasonMatch = s.match(/(?:season|cour|part)\s*(\d+)/i);
            if (seasonMatch) return parseInt(seasonMatch[1], 10);
            const ordinalMatch = s.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
            if (ordinalMatch) return parseInt(ordinalMatch[1], 10);
            return null;
        };

        const season1 = extractSeason(s1);
        const season2 = extractSeason(s2);

        // Exact match after normalization
        if (s1 === s2) return 1.0;

        // Check if one contains the other
        if (s2.includes(s1)) {
            let score = s1.length / s2.length;
            if (season1 !== null && season2 !== null && season1 === season2) {
                score *= 1.3;
            } else if (season1 !== null && season2 !== null && season1 !== season2) {
                score *= 0.3;
            }
            return score;
        }
        if (s1.includes(s2)) {
            let score = (s2.length / s1.length) * 0.55;
            if (season1 !== null && season2 !== null && season1 === season2) {
                score *= 1.3;
            } else if (season1 !== null && season2 !== null && season1 !== season2) {
                score *= 0.3;
            }
            return score;
        }

        // Word-based matching
        const words1 = s1.split(/\s+/).filter(w => w.length > 2);
        const words2 = s2.split(/\s+/).filter(w => w.length > 2);
        const matchedQueryWords = words1.filter(w => words2.includes(w));
        let baseScore = matchedQueryWords.length / Math.max(words1.length, words2.length);

        // Apply season matching bonus/penalty
        if (season1 !== null && season2 !== null) {
            if (season1 === season2) {
                baseScore *= 1.3;
            } else {
                baseScore *= 0.3;
            }
        }

        const missingRatio = (words1.length - matchedQueryWords.length) / words1.length;
        const penaltyFactor = 1 - missingRatio * 0.5;

        return baseScore * penaltyFactor;
    }

    /**
     * Find the best matching anime from search results
     */
    private findBestMatch(title: string, results: AnimeBase[], animeType?: string): AnimeBase | null {
        if (!results || results.length === 0) return null;

        // If only one result and it's a close match, use it
        if (results.length === 1) {
            const similarity = this.calculateSimilarity(title, results[0].title);
            if (similarity > 0.5) {
                return results[0];
            }
            return null;
        }

        // Find best match — apply a type-match bonus so e.g. "Spy x Family Code: White" (Movie)
        // won't be confused with the "Spy x Family" TV series entries.
        let bestMatch: AnimeBase | null = null;
        let bestScore = 0;

        for (const anime of results) {
            let score = this.calculateSimilarity(title, anime.title);
            // Boost when the result's type matches what we're looking for
            if (animeType && anime.type && anime.type === animeType) {
                score += 0.15;
            }
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
    async findStreamingAnimeByTitle(title: string, animeType?: string): Promise<AnimeBase | null> {
        try {
            console.log(`🔎 [SourceManager] Finding streaming match for AniList title: "${title}" (type: ${animeType || 'unknown'})`);

            // Check cache first
            const cacheKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
            const cached = this.searchCache.get(cacheKey);
            if (cached && cached.timestamp > Date.now() - this.SEARCH_CACHE_TTL) {
                console.log(`   ✅ Using cached results for "${title}"`);
                return this.findBestMatch(title, cached.results, animeType);
            }

            let source = this.sources.get('Kaido');
            if (!source || !source.isAvailable) {
                console.log(`   ⚠️ Kaido not available, trying 9Anime...`);
                source = this.sources.get('9Anime');
            }

            if (!source || !source.isAvailable) {
                console.log(`   ⚠️ Primary streaming sources not available, using fallback source...`);
                source = this.getAvailableSource() as StreamingSource | undefined;
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

            const bestMatch = this.findBestMatch(title, results, animeType);

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


