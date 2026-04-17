/**
 * API Configuration for AniStream Hub
 * 
 * Automatically switches between different API deployments:
 * - Local Development: Express server on localhost:3001
 * - Cloudflare Workers: Your Cloudflare Workers deployment
 * - Render.com: Your Render.com deployment
 * - Production: Configured in .env.production
 */

export type ApiDeployment = 'local' | 'cloudflare' | 'render' | 'firebase' | 'custom';

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
    cloudflare: 'https://anifoxwatch-api.anifoxwatch.workers.dev',
    render: 'https://anifoxwatch-ci33.onrender.com', // primary when Worker is degraded
    firebase: '/api', // Firebase Functions proxy endpoint
    custom: '' // Will be set from environment variable
} as const;

function configFromUrl(envApiUrl: string): ApiConfig {
    let deployment: ApiDeployment = 'custom';

    if (envApiUrl.includes('localhost') || envApiUrl.includes('127.0.0.1')) {
        deployment = 'local';
    } else if (envApiUrl.includes('workers.dev')) {
        deployment = 'cloudflare';
    } else if (envApiUrl.includes('render.com')) {
        deployment = 'render';
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
 * Production / `vite preview`: uses `VITE_API_URL`, then hosting detection, then Render default
 * (`https://anifoxwatch-ci33.onrender.com` unless overridden).
 */
/**
 * Build the URL for an API path. When `baseUrl` is empty (local dev + Vite proxy),
 * returns the path as-is so the browser hits the dev server and `/api` is proxied.
 * When `baseUrl` is set (production), returns an absolute URL to the Render/API host
 * so requests do not go to static hosting or Firebase rewrites.
 */
export function apiUrl(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const base = getApiConfig().baseUrl.replace(/\/$/, '');
    return base ? `${base}${normalized}` : normalized;
}

export function getApiConfig(): ApiConfig {
    if (import.meta.env.DEV) {
        if (import.meta.env.VITE_USE_LOCAL_API === 'true') {
            // Empty baseUrl → same origin (Vite dev server). Requests go to `/api/*` and
            // `vite.config.ts` proxies to the Express API — no CORS, works with `npm run dev`.
            return {
                deployment: 'local',
                baseUrl: '',
                timeout: 45000,
                retries: 3
            };
        }

        const devExplicit = import.meta.env.VITE_DEV_API_URL as string | undefined;
        if (devExplicit && String(devExplicit).trim()) {
            return configFromUrl(String(devExplicit).trim());
        }

        const remote = import.meta.env.VITE_API_URL as string | undefined;
        if (remote && String(remote).trim()) {
            return configFromUrl(String(remote).trim());
        }

        return {
            deployment: 'cloudflare',
            baseUrl: API_DEPLOYMENTS.cloudflare,
            timeout: 30000,
            retries: 3
        };
    }

    // ─── Production / preview: respect VITE_API_URL from .env.production etc. ───
    const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (envApiUrl && String(envApiUrl).trim()) {
        return configFromUrl(String(envApiUrl).trim());
    }

    const isFirebaseHosting = typeof window !== 'undefined' && (
        window.location.hostname.includes('firebaseapp.com') ||
        window.location.hostname.includes('web.app')
    );

    if (isFirebaseHosting) {
        return {
            deployment: 'cloudflare',
            baseUrl: API_DEPLOYMENTS.cloudflare,
            timeout: 30000,
            retries: 3
        };
    }

    return {
        deployment: 'cloudflare',
        baseUrl: API_DEPLOYMENTS.cloudflare,
        timeout: 30000,
        retries: 3
    };
}

/**
 * Get fallback API URL when primary is unreachable.
 * Cloudflare → Render, Render → Cloudflare.
 */
export function getApiFallbackUrl(): string | null {
    const { baseUrl } = getApiConfig();
    if (baseUrl.includes('workers.dev')) return API_DEPLOYMENTS.render;
    if (baseUrl.includes('onrender.com')) return API_DEPLOYMENTS.cloudflare;
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

/**
 * Test all API deployments and return their status
 */
export async function testAllDeployments(): Promise<Record<ApiDeployment, { online: boolean; deployment: string; latency: number; version: string; error?: boolean }>> {
    const results = await Promise.allSettled([
        getApiStatus(API_DEPLOYMENTS.local),
        getApiStatus(API_DEPLOYMENTS.cloudflare),
        getApiStatus(API_DEPLOYMENTS.render),
        getApiStatus(API_DEPLOYMENTS.firebase)
    ]);

    const offline = { online: false, deployment: 'offline', latency: -1, version: 'unknown', error: true };
    return {
        local:      results[0].status === 'fulfilled' ? results[0].value : offline,
        cloudflare: results[1].status === 'fulfilled' ? results[1].value : offline,
        render:     results[2].status === 'fulfilled' ? results[2].value : offline,
        firebase:   results[3].status === 'fulfilled' ? results[3].value : offline,
        custom:     offline,
    };
}
