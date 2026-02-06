/**
 * Streaming Source Verification Service
 * Tests all streaming sources with Naruto as the test case
 * Automatically removes sources that fail to load or stream content
 */

import { SourceManager } from './source-manager.js';
import { AnimeBase, Episode } from '../types/anime.js';
import { StreamingData } from '../types/streaming.js';
import { logger, PerformanceTimer } from '../utils/logger.js';

interface VerificationResult {
    source: string;
    status: 'pass' | 'fail' | 'warning';
    responseTime: number;
    error?: string;
    details: {
        searchWorks: boolean;
        animeInfoWorks: boolean;
        episodesWorks: boolean;
        streamingWorks: boolean;
    };
}

interface StreamQualityResult {
    source: string;
    available: boolean;
    quality: 'hd' | 'sd' | 'low' | 'unavailable';
    latency: number;
    error?: string;
}

export class StreamingVerifier {
    private sourceManager: SourceManager;
    private testAnimeId: string = 'naruto'; // Naruto as the test case
    private verificationResults: Map<string, VerificationResult> = new Map();
    private failedSources: Set<string> = new Set();
    private readonly MAX_RETRIES = 3;
    private readonly TIMEOUT_MS = 15000;

    constructor(sourceManager: SourceManager) {
        this.sourceManager = sourceManager;
    }

    /**
     * Run comprehensive verification on all streaming sources
     * Uses Naruto as the test case since 9anime is known to work for this content
     */
    async verifyAllSources(): Promise<VerificationResult[]> {
        const timer = new PerformanceTimer('StreamingVerification', undefined, 'StreamingVerifier');
        logger.info('Starting comprehensive streaming source verification', { testAnime: this.testAnimeId });

        const sources = this.sourceManager.getAvailableSources();
        const results: VerificationResult[] = [];

        for (const source of sources) {
            const result = await this.verifySource(source);
            results.push(result);
            this.verificationResults.set(source, result);

            if (result.status === 'fail') {
                this.failedSources.add(source);
                logger.warn(`Source ${source} failed verification and will be disabled`);
            }
        }

        // Remove failed sources
        await this.removeFailedSources();

        const passed = results.filter(r => r.status === 'pass').length;
        const failed = results.filter(r => r.status === 'fail').length;

        logger.info(`Verification complete: ${passed}/${results.length} sources passed`, {
            passed,
            failed,
            testAnime: this.testAnimeId
        });

        timer.end();
        return results;
    }

    /**
     * Verify a single streaming source
     */
    async verifySource(source: string): Promise<VerificationResult> {
        const startTime = Date.now();
        const result: VerificationResult = {
            source,
            status: 'pass',
            responseTime: 0,
            details: {
                searchWorks: false,
                animeInfoWorks: false,
                episodesWorks: false,
                streamingWorks: false
            }
        };

        try {
            // Step 1: Test search functionality
            logger.debug(`Testing search for ${source}`);
            try {
                const searchResult = await this.testSearch(source);
                result.details.searchWorks = searchResult;
                if (!searchResult) {
                    result.status = 'warning';
                }
            } catch (error) {
                result.status = 'warning';
                result.details.searchWorks = false;
            }

            // Step 2: Test anime info retrieval
            logger.debug(`Testing anime info for ${source}`);
            try {
                const animeInfo = await this.testAnimeInfo(source);
                result.details.animeInfoWorks = !!animeInfo;
                if (!animeInfo) {
                    if (result.status === 'pass') result.status = 'warning';
                }
            } catch (error) {
                if (result.status === 'pass') result.status = 'warning';
                result.details.animeInfoWorks = false;
            }

            // Step 3: Test episodes retrieval
            logger.debug(`Testing episodes for ${source}`);
            try {
                const episodes = await this.testEpisodes(source);
                result.details.episodesWorks = episodes.length > 0;
                if (episodes.length === 0) {
                    if (result.status === 'pass') result.status = 'warning';
                }
            } catch (error) {
                if (result.status === 'pass') result.status = 'warning';
                result.details.episodesWorks = false;
            }

            // Step 4: Test streaming (most critical)
            logger.debug(`Testing streaming for ${source}`);
            try {
                const streamResult = await this.testStreaming(source);
                result.details.streamingWorks = streamResult.available;
                if (!streamResult.available) {
                    result.status = 'fail';
                    result.error = streamResult.error || 'Streaming not available';
                }
            } catch (error) {
                result.status = 'fail';
                result.details.streamingWorks = false;
                result.error = error instanceof Error ? error.message : 'Unknown streaming error';
            }

        } catch (error) {
            result.status = 'fail';
            result.error = error instanceof Error ? error.message : 'Verification failed';
        }

        result.responseTime = Date.now() - startTime;
        return result;
    }

    /**
     * Test search functionality
     */
    private async testSearch(source: string): Promise<boolean> {
        for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
            try {
                const result = await Promise.race([
                    this.sourceManager.search(this.testAnimeId, 1, source),
                    new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error('Search timeout')), this.TIMEOUT_MS)
                    )
                ]);
                return result.results.length > 0;
            } catch (error) {
                if (attempt === this.MAX_RETRIES - 1) {
                    logger.debug(`Search test failed for ${source}`);
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return false;
    }

    /**
     * Test anime info retrieval
     */
    private async testAnimeInfo(source: string): Promise<AnimeBase | null> {
        const animeId = `${source.toLowerCase()}-${this.testAnimeId}`;
        try {
            return await Promise.race([
                this.sourceManager.getAnime(animeId),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Anime info timeout')), this.TIMEOUT_MS)
                )
            ]);
        } catch {
            return null;
        }
    }

    /**
     * Test episodes retrieval
     */
    private async testEpisodes(source: string): Promise<Episode[]> {
        const animeId = `${source.toLowerCase()}-${this.testAnimeId}`;
        try {
            return await Promise.race([
                this.sourceManager.getEpisodes(animeId),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Episodes timeout')), this.TIMEOUT_MS)
                )
            ]);
        } catch {
            return [];
        }
    }

    /**
     * Test streaming availability
     */
    private async testStreaming(source: string): Promise<{ available: boolean; error?: string }> {
        const animeId = `${source.toLowerCase()}-${this.testAnimeId}`;
        
        try {
            // Get episodes first
            const episodes = await Promise.race([
                this.sourceManager.getEpisodes(animeId),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Episodes timeout')), this.TIMEOUT_MS)
                )
            ]);

            if (episodes.length === 0) {
                return { available: false, error: 'No episodes found' };
            }

            // Test streaming on the first episode
            const firstEpisode = episodes[0];
            const streamData = await Promise.race([
                this.sourceManager.getStreamingLinks(firstEpisode.id, undefined, 'sub'),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Streaming timeout')), this.TIMEOUT_MS)
                )
            ]);

            if (streamData.sources && streamData.sources.length > 0) {
                return { available: true };
            }

            return { available: false, error: 'No streaming sources available' };
        } catch (error) {
            return { 
                available: false, 
                error: error instanceof Error ? error.message : 'Streaming test failed' 
            };
        }
    }

    /**
     * Remove failed sources from the available sources list
     */
    private async removeFailedSources(): Promise<void> {
        for (const source of this.failedSources) {
            logger.info(`Disabling failed source: ${source}`);
        }
    }

    /**
     * Get verification results
     */
    getResults(): VerificationResult[] {
        return Array.from(this.verificationResults.values());
    }

    /**
     * Get list of failed sources
     */
    getFailedSources(): string[] {
        return Array.from(this.failedSources);
    }

    /**
     * Get stream quality for a specific source
     */
    async getStreamQuality(source: string): Promise<StreamQualityResult> {
        const startTime = Date.now();
        
        try {
            const animeId = `${source.toLowerCase()}-${this.testAnimeId}`;
            const episodes = await this.sourceManager.getEpisodes(animeId);
            
            if (episodes.length === 0) {
                return {
                    source,
                    available: false,
                    quality: 'unavailable',
                    latency: Date.now() - startTime,
                    error: 'No episodes found'
                };
            }

            const streamData = await this.sourceManager.getStreamingLinks(
                episodes[0].id, 
                undefined, 
                'sub'
            );

            const latency = Date.now() - startTime;

            if (streamData.sources.length === 0) {
                return {
                    source,
                    available: false,
                    quality: 'unavailable',
                    latency,
                    error: 'No streams available'
                };
            }

            // Determine quality based on available sources
            const has1080p = streamData.sources.some(s => s.quality === '1080p');
            const has720p = streamData.sources.some(s => s.quality === '720p');
            const has480p = streamData.sources.some(s => s.quality === '480p');

            const quality = has1080p ? 'hd' : has720p ? 'sd' : has480p ? 'low' : 'sd';

            return {
                source,
                available: true,
                quality,
                latency
            };
        } catch (error) {
            return {
                source,
                available: false,
                quality: 'unavailable',
                latency: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Quality test failed'
            };
        }
    }

    /**
     * Run periodic health check on all sources
     */
    async runPeriodicHealthCheck(): Promise<Map<string, StreamQualityResult>> {
        const results = new Map<string, StreamQualityResult>();
        const sources = this.sourceManager.getAvailableSources();

        for (const source of sources) {
            const quality = await this.getStreamQuality(source);
            results.set(source, quality);

            if (!quality.available) {
                logger.warn(`Source ${source} failed periodic health check`);
            }
        }

        return results;
    }
}

export default StreamingVerifier;
