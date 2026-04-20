import { describe, it, expect } from 'vitest';
import { API_DEPLOYMENTS, getApiFallbackUrl } from '../lib/api-config';

describe('API_DEPLOYMENTS URLs', () => {
    it('vercel URL points to the deployed Node API', () => {
        expect(API_DEPLOYMENTS.vercel).toContain('anifoxwatch.vercel.app');
    });

    it('no cross-host BFF fallback', () => {
        expect(getApiFallbackUrl()).toBeNull();
    });
});

describe('env.production URL', () => {
    it('VITE_API_URL in .env.production points to the Vercel API', async () => {
        const fs = await import('fs');
        const content = fs.readFileSync('.env.production', 'utf-8');
        expect(content).toMatch(/VITE_API_URL=https:\/\/anifoxwatch\.vercel\.app/);
    });
});
