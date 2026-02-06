import { Router, Request, Response } from 'express';
import { sourceManager } from '../services/source-manager.js';

const router = Router();

/**
 * @route GET /api/sources
 * @description Get list of all available sources
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
        const sources = sourceManager.getAvailableSources();
        res.json({ sources });
    } catch (error) {
        console.error('Get sources error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/sources/health
 * @description Get health status of all sources
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
    try {
        const health = sourceManager.getHealthStatus();
        res.json({ sources: health });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/sources/health/enhanced
 * @description Get enhanced health status with capabilities and performance metrics
 */
router.get('/health/enhanced', async (_req: Request, res: Response): Promise<void> => {
    try {
        const status = sourceManager.getSourceStatus();
        res.json({
            sources: status,
            summary: {
                total: status.length,
                online: status.filter((s: { status: string }) => s.status === 'online').length,
                offline: status.filter((s: { status: string }) => s.status === 'offline').length,
                avgSuccessRate: status.reduce((acc: number, s: { successRate?: number }) => acc + (s.successRate || 0), 0) / Math.max(1, status.length),
                lastUpdated: new Date()
            }
        });
    } catch (error) {
        console.error('Enhanced health check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/sources/recommended
 * @description Get recommended source based on performance metrics
 */
router.get('/recommended', async (_req: Request, res: Response): Promise<void> => {
    try {
        const bestSource = sourceManager.getBestSource({
            preferHighQuality: true,
            excludeAdult: true
        });
        
        res.json({
            recommended: bestSource?.name || null,
            capabilities: bestSource ? sourceManager.getSourceCapabilities(bestSource.name) : null
        });
    } catch (error) {
        console.error('Get recommended source error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/sources/check
 * @description Trigger a health check for all sources
 */
router.post('/check', async (_req: Request, res: Response): Promise<void> => {
    try {
        const health = await sourceManager.checkAllHealth();
        res.json({ sources: Array.from(health.values()) });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/sources/preferred
 * @body source - Source name to set as preferred
 */
router.post('/preferred', async (req: Request, res: Response): Promise<void> => {
    try {
        const { source } = req.body;

        if (!source || typeof source !== 'string') {
            res.status(400).json({ error: 'Source name is required' });
            return;
        }

        const success = sourceManager.setPreferredSource(source);

        if (!success) {
            res.status(404).json({ error: 'Source not found' });
            return;
        }

        res.json({ message: `Preferred source set to ${source}` });
    } catch (error) {
        console.error('Set preferred source error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
