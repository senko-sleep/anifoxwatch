import { describe, it, expect } from 'vitest';
import { API_DEPLOYMENTS, getApiFallbackUrl } from '../lib/api-config';

describe('API_DEPLOYMENTS URLs', () => {
    it('cloudflare URL points to the deployed worker', () => {
        expect(API_DEPLOYMENTS.cloudflare).toContain('anifoxwatch-api.anya-bot.workers.dev');
    });

    it('no cross-host BFF fallback (Worker is the public API)', () => {
        expect(getApiFallbackUrl()).toBeNull();
    });
});

describe('env.production URL', () => {
    it('VITE_API_URL in .env.production points to the Worker', async () => {
        const fs = await import('fs');
        const content = fs.readFileSync('.env.production', 'utf-8');
        expect(content).toMatch(/VITE_API_URL=https:\/\/anifoxwatch-api\.anya-bot\.workers\.dev/);
    });
});
