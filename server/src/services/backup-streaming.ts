/**
 * Backup Streaming Infrastructure
 * Provides multiple stream sources for each anime with automatic failover
 * Verifies source availability and quality before presenting to users
 */

import { SourceManager } from './source-manager.js';
import { Episode, StreamingData, VideoSource, EpisodeServer } from '../types/anime.js';
import { logger, PerformanceTimer } from '../utils/logger.js';

interface BackupStreamSource {
    source: string;
    priority: number;
    available: boolean;
    latency: number;
    quality: 'hd' | 'sd' | 'low';
    streamData?: StreamingData;
}

interface StreamSelectionResult {
    selectedSource: string;
    selectedServer?: string;
    streamData: StreamingData;
    alternatives: BackupStreamSource[];
    totalSourcesAttempted: number;
    failedSources: string[];
}

interface SourceHealthInfo {
    source: string;
    lastChecked: Date;
    successRate: number;
    avgLatency: number;
    consecutiveFailures: number;
}

export class BackupStreamingManager {
    private sourceManager: SourceManager;
    private sourceHealth: Map<string, SourceHealthInfo> = new Map();
    private readonly MAX_SOURCES = 5;
    private readonly TIMEOUT_MS = 15000;
    private readonly QUALITY_PRIORITY = ['1080p', '720p', '480p', '360p', 'auto'];

    constructor(sourceManager: SourceManager) {
        this.sourceManager = sourceManager;
    }

    /**
     * Get best available stream for an episode with backup sources
     * Automatically prioritizes working streams and switches on failure
     */
    async getBestStream(
        episodeId: string,
        preferServer?: string,
        category: 'sub' | 'dub' = 'sub'
    ): Promise<StreamSelectionResult> {
        const timer = new PerformanceTimer('BackupStreaming', undefined, 'BackupStreaming');
        logger.info(`Getting best stream for episode: ${episodeId}`, { episodeId, preferServer, category });

        const sources = this.sourceManager.getAvailableSources();
        const backupSources: BackupStreamSource[] = [];
        const failedSources: string[] = [];
        let totalAttempted = 0;

        // Get all available sources and their health info
        for (const source of sources) {
            const healthInfo = this.sourceHealth.get(source) || {
                source,
                lastChecked: new Date(),
                successRate: 1,
                avgLatency: 0,
                consecutiveFailures: 0
            };

            backupSources.push({
                source,
                priority: this.calculatePriority(source, healthInfo),
                available: healthInfo.consecutiveFailures < 3,
                latency: healthInfo.avgLatency,
                quality: this.getSourceQuality(source)
            });
        }

        // Sort by priority (higher priority first)
        backupSources.sort((a, b) => b.priority - a.priority);

        // Try sources in priority order
        for (const backupSource of backupSources.slice(0, this.MAX_SOURCES)) {
            totalAttempted++;

            if (!backupSource.available) {
                logger.debug(`Skipping unavailable source: ${backupSource.source}`);
                failedSources.push(backupSource.source);
                continue;
            }

            try {
                logger.debug(`Attempting stream from: ${backupSource.source}`);

                const streamData = await Promise.race([
                    this.sourceManager.getStreamingLinks(episodeId, preferServer, category),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Stream timeout')), this.TIMEOUT_MS)
                    )
                ]);

                if (streamData.sources && streamData.sources.length > 0) {
                    // Update health info
                    this.updateSourceHealth(backupSource.source, true, Date.now() - this.TIMEOUT_MS);

                    // Sort sources by quality preference
                    streamData.sources = this.sortSourcesByQuality(streamData.sources);

                    timer.end();

                    return {
                        selectedSource: backupSource.source,
                        selectedServer: preferServer,
                        streamData,
                        alternatives: backupSources.filter(s => s.source !== backupSource.source),
                        totalSourcesAttempted,
                        failedSources
                    };
                }

                // No streams from this source
                failedSources.push(backupSource.source);
                this.updateSourceHealth(backupSource.source, false, this.TIMEOUT_MS);

            } catch (error) {
                logger.warn(`Source ${backupSource.source} failed:`, error);
                failedSources.push(backupSource.source);
                this.updateSourceHealth(backupSource.source, false, this.TIMEOUT_MS);
            }
        }

        // All sources failed
        timer.end();
        logger.error(`All sources failed for episode: ${episodeId}`, { episodeId, totalAttempted, failedSources });

        return {
            selectedSource: '',
            streamData: { sources: [], subtitles: [], source: 'none' },
            alternatives: [],
            totalSourcesAttempted,
            failedSources
        };
    }

    /**
     * Get streams from multiple sources for fallback
     */
    async getMultipleStreams(
        episodeId: string,
        maxStreams: number = 3,
        category: 'sub' | 'dub' = 'sub'
    ): Promise<StreamingData[]> {
        const sources = this.sourceManager.getAvailableSources();
        const streams: StreamingData[] = [];

        for (const source of sources.slice(0, maxStreams)) {
            try {
                const streamData = await Promise.race([
                    this.sourceManager.getStreamingLinks(episodeId, undefined, category),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Stream timeout')), this.TIMEOUT_MS)
                    )
                ]);

                if (streamData.sources && streamData.sources.length > 0) {
                    streamData.source = `${streamData.source} (${source})`;
                    streams.push(streamData);
                }
            } catch (error) {
                logger.debug(`Source ${source} failed for multi-stream:`, error);
            }
        }

        return streams;
    }

    /**
     * Verify source availability and quality
     */
    async verifySource(source: string): Promise<SourceHealthInfo> {
        const startTime = Date.now();
        let success = false;
        let latency = Date.now() - startTime;

        try {
            // Quick health check
            const healthCheck = await Promise.race([
                this.sourceManager.healthCheck(source),
                new Promise<boolean>((resolve) =>
                    setTimeout(() => resolve(false), 5000)
                )
            ]);

            if (healthCheck === true) {
                success = true;
            }

            // Try a test stream
            const testEpisodes = await Promise.race([
                this.sourceManager.getEpisodes(`${source.toLowerCase()}-naruto`),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Episodes timeout')), this.TIMEOUT_MS)
                )
            ]);

            if (testEpisodes.length > 0) {
                const streamData = await Promise.race([
                    this.sourceManager.getStreamingLinks(testEpisodes[0].id, undefined, 'sub'),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Stream timeout')), this.TIMEOUT_MS)
                    )
                ]);

                if (streamData.sources && streamData.sources.length > 0) {
                    success = true;
                }
            }

            latency = Date.now() - startTime;
        } catch (error) {
            success = false;
            latency = Date.now() - startTime;
        }

        const healthInfo: SourceHealthInfo = {
            source,
            lastChecked: new Date(),
            successRate: success ? 1 : 0,
            avgLatency: latency,
            consecutiveFailures: success ? 0 : (this.sourceHealth.get(source)?.consecutiveFailures || 0) + 1
        };

        this.sourceHealth.set(source, healthInfo);
        return healthInfo;
    }

    /**
     * Get all source health information
     */
    getSourceHealth(): SourceHealthInfo[] {
        return Array.from(this.sourceHealth.values());
    }

    /**
     * Calculate priority for a source based on health and capabilities
     */
    private calculatePriority(source: string, health: SourceHealthInfo): number {
        let priority = 0;

        // Success rate weight (0-40 points)
        priority += health.successRate * 40;

        // Latency weight (0-30 points) - lower is better
        if (health.avgLatency > 0) {
            const latencyScore = Math.max(0, 30 - (health.avgLatency / 1000));
            priority += latencyScore;
        }

        // Consecutive failures penalty
        priority -= health.consecutiveFailures * 10;

        // Quality bonus
        const qualityBonus = this.getSourceQuality(source) === 'hd' ? 20 : 10;
        priority += qualityBonus;

        // Base priority for known good sources
        const knownGood = ['HiAnimeDirect', 'HiAnime', '9Anime', 'Aniwave', 'Zoro'];
        if (knownGood.includes(source)) {
            priority += 10;
        }

        return priority;
    }

    /**
     * Get quality rating for a source
     */
    private getSourceQuality(source: string): 'hd' | 'sd' | 'low' {
        const hdSources = ['HiAnimeDirect', 'HiAnime', '9Anime', 'Zoro'];
        const sdSources = ['Aniwave', 'Aniwatch', 'Gogoanime', 'AnimePahe'];

        if (hdSources.includes(source)) return 'hd';
        if (sdSources.includes(source)) return 'sd';
        return 'low';
    }

    /**
     * Sort video sources by quality preference
     */
    private sortSourcesByQuality(sources: VideoSource[]): VideoSource[] {
        return [...sources].sort((a, b) => {
            const qualityA = this.QUALITY_PRIORITY.indexOf(a.quality);
            const qualityB = this.QUALITY_PRIORITY.indexOf(b.quality);
            return qualityA - qualityB;
        });
    }

    /**
     * Update source health after a request
     */
    private updateSourceHealth(source: string, success: boolean, latency: number): void {
        const current = this.sourceHealth.get(source) || {
            source,
            lastChecked: new Date(),
            successRate: 1,
            avgLatency: 0,
            consecutiveFailures: 0
        };

        // Update success rate (exponential moving average)
        const alpha = 0.3;
        current.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * current.successRate;

        // Update latency (exponential moving average)
        current.avgLatency = alpha * latency + (1 - alpha) * current.avgLatency;

        // Update consecutive failures
        if (success) {
            current.consecutiveFailures = 0;
        } else {
            current.consecutiveFailures++;
        }

        current.lastChecked = new Date();
        this.sourceHealth.set(source, current);
    }

    /**
     * Check if all sources are healthy
     */
    areAllSourcesHealthy(): boolean {
        const healthValues = Array.from(this.sourceHealth.values());
        if (healthValues.length === 0) return true;

        return healthValues.every(h => h.consecutiveFailures < 3);
    }

    /**
     * Get summary of streaming infrastructure health
     */
    getInfrastructureHealth(): {
        totalSources: number;
        healthySources: number;
        unhealthySources: number;
        avgSuccessRate: number;
        avgLatency: number;
    } {
        const healthValues = Array.from(this.sourceHealth.values());
        const total = Math.max(healthValues.length, 1);
        const healthy = healthValues.filter(h => h.consecutiveFailures < 3).length;
        const unhealthy = healthValues.filter(h => h.consecutiveFailures >= 3).length;

        return {
            totalSources: this.sourceManager.getAvailableSources().length,
            healthySources: healthy,
            unhealthySources: unhealthy,
            avgSuccessRate: healthValues.reduce((sum, h) => sum + h.successRate, 0) / total,
            avgLatency: healthValues.reduce((sum, h) => sum + h.avgLatency, 0) / total
        };
    }
}

export default BackupStreamingManager;
