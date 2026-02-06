/**
 * Monitoring API Routes
 * Provides endpoints for verification results, genre stats, and search analytics
 */

import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';
import { StreamingVerifier } from '../services/streaming-verifier.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Verification cache
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

let cachedVerificationResults: VerificationResult[] | null = null;
let lastVerificationTime: number = 0;
const VERIFICATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * @route GET /api/monitoring/verification
 * @description Get cached verification results
 */
router.get('/verification', async (req: Request, res: Response): Promise<void> => {
    const now = Date.now();
    
    // Return cached results if still valid
    if (cachedVerificationResults && (now - lastVerificationTime) < VERIFICATION_CACHE_TTL) {
        res.json(cachedVerificationResults);
        return;
    }

    // Return cached results even if expired (better than empty)
    if (cachedVerificationResults) {
        res.json(cachedVerificationResults);
        return;
    }

    res.json([]);
});

/**
 * @route POST /api/monitoring/verify
 * @description Run verification on all streaming sources
 */
router.post('/verify', async (req: Request, res: Response): Promise<void> => {
    logger.info('Starting source verification...');
    
    try {
        const verifier = new StreamingVerifier(sourceManager);
        const results = await verifier.verifyAllSources();
        
        // Cache results
        cachedVerificationResults = results;
        lastVerificationTime = Date.now();

        logger.info(`Verification complete: ${results.filter(r => r.status === 'pass').length}/${results.length} sources passed`);
        
        res.json(results);
    } catch (error: unknown) {
        logger.error('Verification failed:', error as Error);
        res.status(500).json({ error: 'Verification failed', message: error instanceof Error ? error.message : 'Unknown error' });
    }
});

/**
 * @route GET /api/monitoring/health
 * @description Get source health status
 */
router.get('/health', async (req: Request, res: Response): Promise<void> => {
    try {
        const health = sourceManager.getSourceStatus();
        res.json(health);
    } catch (error: unknown) {
        logger.error('Health check failed:', error as Error);
        res.status(500).json({ error: 'Health check failed' });
    }
});

/**
 * @route GET /api/monitoring/infrastructure
 * @description Get backup streaming infrastructure status
 */
router.get('/infrastructure', async (req: Request, res: Response): Promise<void> => {
    try {
        const sources = sourceManager.getAvailableSources();
        const health = sourceManager.getHealthStatus();
        
        const infrastructure = {
            totalSources: sources.length,
            onlineSources: health.filter(s => s.status === 'online').length,
            offlineSources: health.filter(s => s.status === 'offline').length,
            degradedSources: health.filter(s => s.status === 'degraded').length,
            sources: health.map(s => ({
                name: s.name,
                status: s.status,
                lastCheck: s.lastCheck
            }))
        };

        res.json(infrastructure);
    } catch (error: unknown) {
        logger.error('Infrastructure check failed:', error as Error);
        res.status(500).json({ error: 'Infrastructure check failed' });
    }
});

/**
 * @route GET /api/monitoring/genre-stats
 * @description Get genre completion statistics
 */
router.get('/genre-stats', async (req: Request, res: Response): Promise<void> => {
    try {
        // This would normally fetch from a database
        // For now, return mock data
        const stats = {
            totalAnime: 1250,
            withGenres: 1180,
            withoutGenres: 70,
            completionRate: 94.4,
            topGenres: [
                { genre: 'Action', count: 450 },
                { genre: 'Comedy', count: 380 },
                { genre: 'Adventure', count: 320 },
                { genre: 'Fantasy', count: 280 },
                { genre: 'Romance', count: 220 },
                { genre: 'Sci-Fi', count: 180 },
                { genre: 'Drama', count: 150 },
                { genre: 'Horror', count: 90 },
                { genre: 'Mystery', count: 75 },
                { genre: 'Sports', count: 60 }
            ]
        };

        res.json(stats);
    } catch (error: unknown) {
        logger.error('Genre stats failed:', error as Error);
        res.status(500).json({ error: 'Genre stats failed' });
    }
});

/**
 * @route GET /api/monitoring/search-analytics
 * @description Get search analytics
 */
router.get('/search-analytics', async (req: Request, res: Response): Promise<void> => {
    try {
        // This would normally fetch from analytics tracking
        // For now, return mock data
        const analytics = {
            totalSearches: 15847,
            avgResponseTime: 245,
            failedSearches: 234,
            popularQueries: [
                { query: 'Naruto', count: 2341 },
                { query: 'One Piece', count: 1892 },
                { query: 'Dragon Ball', count: 1654 },
                { query: 'Attack on Titan', count: 1423 },
                { query: 'Demon Slayer', count: 1287 },
                { query: 'My Hero Academia', count: 987 },
                { query: 'Fullmetal Alchemist', count: 876 },
                { query: 'Death Note', count: 765 },
                { query: 'Tokyo Revengers', count: 654 },
                { query: 'Jujutsu Kaisen', count: 543 }
            ]
        };

        res.json(analytics);
    } catch (error: unknown) {
        logger.error('Search analytics failed:', error as Error);
        res.status(500).json({ error: 'Search analytics failed' });
    }
});

/**
 * @route GET /api/monitoring/stream-quality/:source
 * @description Get stream quality for a specific source
 */
router.get('/stream-quality/:source', async (req: Request, res: Response): Promise<void> => {
    const { source } = req.params;

    try {
        const verifier = new StreamingVerifier(sourceManager);
        const quality = await verifier.getStreamQuality(source);
        res.json(quality);
    } catch (error: unknown) {
        logger.error(`Stream quality check failed for ${source}:`, error as Error);
        res.status(500).json({ error: 'Stream quality check failed' });
    }
});

export default router;
