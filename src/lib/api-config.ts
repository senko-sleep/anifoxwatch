/**
 * API Configuration for AniStream Hub
 * 
 * Automatically switches between different API deployments:
 * - Local Development: Express API on `127.0.0.1:3001`, reached from the browser via Vite’s same-origin
 *   proxy (`/api/*`, `/health`) when `VITE_USE_LOCAL_API=true`.
 * - Vercel: Node API from this repo (`/api/*` on your *.vercel.app deployment)
 * - Production: Configured in .env.production
 */

export type ApiDeployment = 'local' | 'vercel' | 'firebase' | 'custom' | 'hianimeRest';

export interface ApiConfig {
    deployment: ApiDeployment;
    baseUrl: string;
    timeout: number;
    retries: number;
}

/**
 * API deployment URLs
 */
export const API_DEPLOYMENTS = {
    local: 'http://localhost:3001',
    /**
     * Vercel (and most SPA hosts): the API is served from the same origin via `/api/*`
     * (see root `vercel.json`). Keep empty here so production defaults can use
     * `window.location.origin` (your current deployment domain) instead of a hardcoded app.
     */
    vercel: '',
    firebase: '/api',
    custom: '',
    /** Optional HiAnime REST host for status checks (same shape as VITE_ANIWATCH_API_URL). */
    hianimeRest: (import.meta.env.VITE_ANIWATCH_API_URL as string | undefined)?.trim() || '',
} as const;

function configFromUrl(envApiUrl: string): ApiConfig {
    let deployment: ApiDeployment = 'custom';

    if (envApiUrl.includes('localhost') || envApiUrl.includes('127.0.0.1')) {
        deployment = 'local';
    } else if (envApiUrl.includes('vercel.app')) {
        deployment = 'vercel';
    } else if (envApiUrl === '/api') {
        deployment = 'firebase';
    }

    return {
        deployment,
        baseUrl: envApiUrl.replace(/\/$/, ''),
        timeout: 30000,
        retries: 3
    };
}

/**
 * Get the current API configuration.
 *
 * Development (`import.meta.env.DEV`):
 * - **`VITE_USE_LOCAL_API=true` (default in `.env.development`):** `baseUrl` is empty so requests use
 *   same-origin paths (`/api/...`). Vite proxies to `127.0.0.1:3001`. Use `npm run dev` (starts API + client).
 * - **Remote only:** `VITE_USE_LOCAL_API=false` and set `VITE_API_URL` to a deployed API (for `vite` alone).
 * - **`VITE_DEV_API_URL`:** absolute override (e.g. another port).
 *
 * Production / `vite preview`: uses `VITE_API_URL`, then hosting detection, then the Vercel API default.
 */
/**
 * Build the URL for an API path. When `baseUrl` is empty (local dev + Vite proxy),
 * returns the path as-is so the browser hits the dev server and `/api` is proxied.
 * When `baseUrl` is set (production), returns an absolute URL to the API host.
 */
export function apiUrl(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const base = getApiConfig().baseUrl.replace(/\/$/, '');
    return base ? `${base}${normalized}` : normalized;
}

/**
 * Resolve dev API config from env-like values (extracted for unit tests).
 * Precedence: `VITE_USE_LOCAL_API=true` → same-origin (empty base) → `VITE_DEV_API_URL` → `VITE_API_URL` → localhost:3001.
 */
export function resolveDevApiConfig(env: ImportMetaEnv): ApiConfig {
    if (env.VITE_USE_LOCAL_API === 'true') {
        return {
            deployment: 'local',
            baseUrl: '',
            timeout: 45000,
            retries: 3,
        };
    }

    const devExplicit = env.VITE_DEV_API_URL as string | undefined;
    if (devExplicit && String(devExplicit).trim()) {
        return configFromUrl(String(devExplicit).trim());
    }

    const remote = env.VITE_API_URL as string | undefined;
    if (remote && String(remote).trim()) {
        return configFromUrl(String(remote).trim());
    }

    return {
        deployment: 'local',
        baseUrl: API_DEPLOYMENTS.local,
        timeout: 30000,
        retries: 3,
    };
}

export function getApiConfig(): ApiConfig {
    if (import.meta.env.DEV) {
        return resolveDevApiConfig(import.meta.env);
    }

    // ─── Production / preview: respect VITE_API_URL from .env.production etc. ───
    const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (envApiUrl && String(envApiUrl).trim()) {
        return configFromUrl(String(envApiUrl).trim());
    }

    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isFirebaseHosting = hostname.includes('firebaseapp.com') || hostname.includes('web.app');

    // In production, default to same-origin so the frontend always hits the co-deployed BFF.
    // This fixes deployments on arbitrary Vercel domains (preview URLs, forks, custom domains).
    const sameOrigin = typeof window !== 'undefined' ? window.location.origin : '';

    if (isFirebaseHosting) {
        return {
            deployment: 'firebase',
            baseUrl: API_DEPLOYMENTS.firebase,
            timeout: 30000,
            retries: 3
        };
    }

    return {
        deployment: 'vercel',
        baseUrl: sameOrigin.replace(/\/$/, ''),
        timeout: 30000,
        retries: 3
    };
}

/**
 * Secondary BFF URL when the primary fails (no alternate public BFF configured).
 */
export function getApiFallbackUrl(): string | null {
    // Explicit override (optional): allow configuring a secondary BFF host without code changes.
    const envFallback = (import.meta.env.VITE_API_FALLBACK_URL as string | undefined)?.trim();
    if (envFallback) return envFallback.replace(/\/$/, '');

    // In Node/test environments there is no runtime-origin to fall back to.
    if (typeof window === 'undefined') return null;

    const sameOrigin = (window.location?.origin || '').replace(/\/$/, '');
    const primary = (getApiConfig().baseUrl || '').replace(/\/$/, '');

    // If primary is empty or relative, requests already go to the current origin.
    if (!primary || primary.startsWith('/')) return null;

    // If an external API host is configured (e.g. stale deploy), fall back to same-origin.
    // This is particularly useful on Vercel where the API is co-deployed with the SPA.
    if (sameOrigin && primary !== sameOrigin) return sameOrigin;

    return null;
}

/**
 * Switch API deployment at runtime
 */
export function setApiDeployment(deployment: Exclude<ApiDeployment, 'custom'> | string): string {
    if (deployment in API_DEPLOYMENTS) {
        return API_DEPLOYMENTS[deployment as keyof typeof API_DEPLOYMENTS];
    }
    return deployment; // Custom URL
}

/**
 * Get API status information
 */
export async function getApiStatus(baseUrl: string): Promise<{
    online: boolean;
    deployment: string;
    latency: number;
    version: string;
}> {
    const startTime = Date.now();

    try {
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });

        const data = await response.json();
        const latency = Date.now() - startTime;

        return {
            online: response.ok,
            deployment: data.environment || 'unknown',
            latency,
            version: data.version || '1.0.0'
        };
    } catch (error) {
        return {
            online: false,
            deployment: 'offline',
            latency: -1,
            version: 'unknown'
        };
    }
}

/** HiAnime REST /health may be plain text (e.g. daijoubu). */
async function getHianimeRestStatus(baseUrl: string): Promise<{
    online: boolean;
    deployment: string;
    latency: number;
    version: string;
}> {
    const start = Date.now();
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });
        const latency = Date.now() - start;
        const text = (await response.text()).trim().slice(0, 80);
        return {
            online: response.ok,
            deployment: 'hianime-rest',
            latency,
            version: text || (response.ok ? 'ok' : 'unknown'),
        };
    } catch {
        return { online: false, deployment: 'offline', latency: -1, version: 'unknown' };
    }
}

/**
 * Test configured deployments (local + Vercel API + firebase + optional HiAnime REST).
 */
export async function testAllDeployments(): Promise<Record<ApiDeployment, { online: boolean; deployment: string; latency: number; version: string; error?: boolean }>> {
    const hianimeBase = API_DEPLOYMENTS.hianimeRest;
    const results = await Promise.allSettled([
        getApiStatus(API_DEPLOYMENTS.local),
        getApiStatus(API_DEPLOYMENTS.vercel),
        getApiStatus(API_DEPLOYMENTS.firebase),
        hianimeBase ? getHianimeRestStatus(hianimeBase) : Promise.resolve({ online: false, deployment: 'skipped', latency: -1, version: 'not-configured' }),
    ]);

    const offline = { online: false, deployment: 'offline', latency: -1, version: 'unknown', error: true };
    return {
        local: results[0].status === 'fulfilled' ? results[0].value : offline,
        vercel: results[1].status === 'fulfilled' ? results[1].value : offline,
        firebase: results[2].status === 'fulfilled' ? results[2].value : offline,
        hianimeRest: results[3].status === 'fulfilled' ? results[3].value : offline,
        custom: offline,
    };
}
