import { Hono } from 'hono';
import { SourceManager } from '../services/source-manager.js';

/**
 * Sources routes for Cloudflare Worker (Hono)
 * Mirrors the Express sources routes functionality
 */
export function createSourcesRoutes(sourceManager: SourceManager) {
    const app = new Hono();

    // Get all sources
    app.get('/', (c) => {
        const sources = sourceManager.getAvailableSources();
        return c.json({ sources });
    });

    // Get sources health
    app.get('/health', (c) => {
        const health = sourceManager.getHealthStatus();
        return c.json({ sources: health });
    });

    // Check all sources health
    app.post('/check', async (c) => {
        const health = await sourceManager.checkAllHealth();
        return c.json({ sources: Array.from(health.values()) });
    });

    // Set preferred source
    app.post('/preferred', async (c) => {
        try {
            const body = await c.req.json();
            const { source } = body;

            if (!source || typeof source !== 'string') {
                return c.json({ error: 'Source name is required' }, 400);
            }

            const success = sourceManager.setPreferredSource(source);

            if (!success) {
                return c.json({ error: 'Source not found' }, 404);
            }

            return c.json({ message: `Preferred source set to ${source}` });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    return app;
}
