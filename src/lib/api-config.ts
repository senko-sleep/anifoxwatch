/**
 * API Configuration for AniStream Hub
 * 
 * Automatically switches between different API deployments:
 * - Local Development: Express server on localhost:3001
 * - Cloudflare Workers: Your Cloudflare Workers deployment
 * - Render.com: Your Render.com deployment
 * - Production: Configured in .env.production
 */

export type ApiDeployment = 'local' | 'cloudflare' | 'render' | 'custom';

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
    cloudflare: 'https://your-worker.workers.dev', // Update with your Cloudflare Workers URL
    render: 'https://anifoxwatch.onrender.com',
    custom: '' // Will be set from environment variable
} as const;

/**
 * Get the current API configuration
 */
export function getApiConfig(): ApiConfig {
    // Check environment variable first
    const envApiUrl = import.meta.env.VITE_API_URL;
    
    if (envApiUrl) {
        // Determine deployment type from URL
        let deployment: ApiDeployment = 'custom';
        
        if (envApiUrl.includes('localhost') || envApiUrl.includes('127.0.0.1')) {
            deployment = 'local';
        } else if (envApiUrl.includes('workers.dev')) {
            deployment = 'cloudflare';
        } else if (envApiUrl.includes('render.com')) {
            deployment = 'render';
        }
        
        return {
            deployment,
            baseUrl: envApiUrl,
            timeout: 30000,
            retries: 3
        };
    }
    
    // Auto-detect based on environment
    if (import.meta.env.DEV) {
        return {
            deployment: 'local',
            baseUrl: API_DEPLOYMENTS.local,
            timeout: 30000,
            retries: 3
        };
    }
    
    // Production defaults to Render (update if using Cloudflare Workers primarily)
    return {
        deployment: 'render',
        baseUrl: API_DEPLOYMENTS.render,
        timeout: 30000,
        retries: 3
    };
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
export async function testAllDeployments(): Promise<Record<ApiDeployment, any>> {
    const results = await Promise.allSettled([
        getApiStatus(API_DEPLOYMENTS.local),
        getApiStatus(API_DEPLOYMENTS.cloudflare),
        getApiStatus(API_DEPLOYMENTS.render)
    ]);
    
    return {
        local: results[0].status === 'fulfilled' ? results[0].value : { online: false, error: true },
        cloudflare: results[1].status === 'fulfilled' ? results[1].value : { online: false, error: true },
        render: results[2].status === 'fulfilled' ? results[2].value : { online: false, error: true },
        custom: { online: false, error: true }
    };
}
