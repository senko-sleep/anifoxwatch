/**
 * Proxy configuration for sources that need to bypass geo-restrictions
 * Used primarily for hentai sources that may be blocked in certain regions
 */

export interface ProxyConfig {
    host: string;
    port: number;
    auth?: {
        username: string;
        password: string;
    };
}

/**
 * Get proxy configuration for hentai sources
 * Reads from environment variables:
 * - HENTAI_PROXY_HOST: Proxy server hostname/IP
 * - HENTAI_PROXY_PORT: Proxy server port
 * - HENTAI_PROXY_USER: Proxy username (optional)
 * - HENTAI_PROXY_PASS: Proxy password (optional)
 */
export function getHentaiProxyConfig(): ProxyConfig | undefined {
    const host = process.env.HENTAI_PROXY_HOST;
    const port = process.env.HENTAI_PROXY_PORT;

    if (!host || !port) {
        return undefined;
    }

    const config: ProxyConfig = {
        host,
        port: parseInt(port, 10)
    };

    const username = process.env.HENTAI_PROXY_USER;
    const password = process.env.HENTAI_PROXY_PASS;

    if (username && password) {
        config.auth = {
            username,
            password
        };
    }

    return config;
}

/**
 * Check if a source should use proxy based on its name
 */
export function shouldUseProxy(sourceName: string): boolean {
    const hentaiSources = ['Hanime', 'WatchHentai'];
    return hentaiSources.includes(sourceName);
}
