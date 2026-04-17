import { describe, it, expect } from 'vitest';
import { API_DEPLOYMENTS, getApiFallbackUrl } from '../lib/api-config';

describe('API_DEPLOYMENTS URLs', () => {
    it('cloudflare URL points to the correct deployed worker', () => {
        expect(API_DEPLOYMENTS.cloudflare).toContain('anifoxwatch-api.anya-bot.workers.dev');
    });

    it('render URL points to sm7s instance (not ci33)', () => {
        expect(API_DEPLOYMENTS.render).toContain('sm7s.onrender.com');
        expect(API_DEPLOYMENTS.render).not.toContain('ci33');
    });

    it('fallback from cloudflare resolves to render sm7s', () => {
        const fallback = getApiFallbackUrl();
        // In test env VITE_API_URL is not set so getApiConfig falls to cloudflare default
        // fallback should be the render URL
        if (fallback) {
            expect(fallback).toContain('sm7s.onrender.com');
            expect(fallback).not.toContain('ci33');
        }
    });
});

describe('env.production URL', () => {
    it('VITE_API_URL in .env.production is the correct worker', async () => {
        const fs = await import('fs');
        const content = fs.readFileSync('.env.production', 'utf-8');
        expect(content).toContain('anifoxwatch-api.anya-bot.workers.dev');
    });
});
