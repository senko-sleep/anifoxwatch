import { Hono } from 'hono';

// Flexible interface for both SourceManager and CloudflareSourceManager
interface SourcesManagerLike {
    getAvailableSources(): string[];
    getHealthStatus(): Array<{ name: string; status: string; latency?: number; lastCheck?: Date }>;
    checkAllHealth(): Promise<Map<string, { name: string; status: string; latency?: number; lastCheck?: Date }>>;
    setPreferredSource?(source: string): boolean;
}

/**
 * Sources routes for Cloudflare Worker (Hono)
 * Compatible with both SourceManager and CloudflareSourceManager
 */
export function createSourcesRoutes(sourceManager: SourcesManagerLike) {
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

            if (!sourceManager.setPreferredSource) {
                return c.json({ error: 'Setting preferred source not supported in this environment' }, 501);
            }

            const success = sourceManager.setPreferredSource(source);

            if (!success) {
                return c.json({ error: 'Source not found' }, 404);
            }

            return c.json({ message: `Preferred source set to ${source}` });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            return c.json({ error: message }, 500);
        }
    });

    return app;
}
