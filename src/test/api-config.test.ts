import { describe, it, expect } from 'vitest';
import { API_DEPLOYMENTS, getApiFallbackUrl } from '../lib/api-config';

describe('API_DEPLOYMENTS URLs', () => {
    it('cloudflare URL points to the correct deployed worker', () => {
        expect(API_DEPLOYMENTS.cloudflare).toContain('anifoxwatch-api.anifoxwatch.workers.dev');
    });

    it('render fallback URL is the live ci33 instance', () => {
        expect(API_DEPLOYMENTS.render).toContain('anifoxwatch-ci33.onrender.com');
    });

    it('fallback from cloudflare resolves to the render instance', () => {
        const fallback = getApiFallbackUrl();
        if (fallback) {
            expect(fallback).toContain('onrender.com');
        }
    });
});

describe('env.production URL', () => {
    it('VITE_API_URL in .env.production is the correct worker', async () => {
        const fs = await import('fs');
        const content = fs.readFileSync('.env.production', 'utf-8');
        expect(content).toContain('anifoxwatch-api.anifoxwatch.workers.dev');
    });
});
