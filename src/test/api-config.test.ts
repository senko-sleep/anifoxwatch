import { describe, it, expect } from 'vitest';
import { API_DEPLOYMENTS, getApiFallbackUrl, resolveDevApiConfig } from '../lib/api-config';

function devEnv(partial: Record<string, string | boolean | undefined>): ImportMetaEnv {
    return partial as unknown as ImportMetaEnv;
}

describe('API_DEPLOYMENTS URLs', () => {
    it('vercel deployment uses same-origin base by default', () => {
        // On Vercel, the Node API is co-deployed and served from the same origin via `/api/*`.
        // We intentionally avoid hardcoding a specific *.vercel.app domain so forks/preview URLs work.
        expect(API_DEPLOYMENTS.vercel).toBe('');
    });

    it('no cross-host BFF fallback', () => {
        expect(getApiFallbackUrl()).toBeNull();
    });
});

describe('env.production URL', () => {
    it('VITE_API_URL in .env.production is blank (use same-origin on Vercel)', async () => {
        const fs = await import('fs');
        const content = fs.readFileSync('.env.production', 'utf-8');
        expect(content).toMatch(/^\s*VITE_API_URL\s*=\s*$/m);
    });
});

describe('resolveDevApiConfig', () => {
    it('VITE_USE_LOCAL_API=true uses empty base (Vite proxy) even if VITE_API_URL is set', () => {
        const cfg = resolveDevApiConfig(
            devEnv({
                VITE_USE_LOCAL_API: 'true',
                VITE_API_URL: 'http://localhost:3001',
            }),
        );
        expect(cfg.baseUrl).toBe('');
        expect(cfg.deployment).toBe('local');
    });

    it('VITE_DEV_API_URL wins over VITE_API_URL when not using local proxy', () => {
        const cfg = resolveDevApiConfig(
            devEnv({
                VITE_USE_LOCAL_API: 'false',
                VITE_DEV_API_URL: 'http://127.0.0.1:4000',
                VITE_API_URL: 'http://localhost:3001',
            }),
        );
        expect(cfg.baseUrl).toBe('http://127.0.0.1:4000');
    });

    it('defaults to localhost:3001 when no overrides', () => {
        const cfg = resolveDevApiConfig(devEnv({}));
        expect(cfg.baseUrl).toBe(API_DEPLOYMENTS.local);
    });
});
