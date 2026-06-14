import Hls from 'hls.js';
import { apiUrl } from './api-config';

interface LoadStats {
  trequest: number;
  tfirst?: number;
  tload?: number;
  retry: number;
}

// ── Manifest response cache ─────────────────────────────────────────────────
// Caches manifest text for 30s. Repeat fetches (ABR level changes, retries)
// hit memory instead of the network — eliminates redundant round-trips.
const MANIFEST_CACHE_TTL = 30_000; // 30 seconds
interface ManifestCacheEntry { data: string; ts: number }
const manifestCache = new Map<string, ManifestCacheEntry>();

function manifestCacheGet(url: string): string | null {
  const entry = manifestCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.ts > MANIFEST_CACHE_TTL) {
    manifestCache.delete(url);
    return null;
  }
  return entry.data;
}

function manifestCacheSet(url: string, data: string): void {
  // Evict stale entries periodically to prevent unbounded growth
  if (manifestCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of manifestCache) {
      if (now - v.ts > MANIFEST_CACHE_TTL) manifestCache.delete(k);
    }
  }
  manifestCache.set(url, { data, ts: Date.now() });
}

/**
 * Custom HLS loader that uses POST requests for proxied URLs
 * This solves Cloudflare Workers URL length limitations.
 * Also caches HLS manifests in memory for 30s to avoid redundant round-trips.
 */
export class PostProxyLoader extends Hls.DefaultConfig.loader {
  private proxyBaseUrl: string;
  private xhrRef: XMLHttpRequest | null = null;

  constructor(config: Hls.LoaderConfiguration) {
    super(config);
    this.proxyBaseUrl = '';
  }

  load(
    context: Hls.LoaderContext,
    config: Hls.LoaderConfiguration,
    callbacks: Hls.LoaderCallbacks<Hls.LoaderContext>
  ): void {
    let url = context.url;

    // Check if this is a proxied URL
    const isProxied = url.includes('/api/stream/proxy?url=');
    const isManifest = url.includes('.m3u8') || context.type === 'manifest' || context.type === 'level';

    if (isProxied) {
      try {
        const urlParams = new URL(url, window.location.origin).searchParams;
        const actualUrl = urlParams.get('url');

        if (actualUrl) {
          // Extract proxy base (everything before ?)
          const proxyBase = url.substring(0, url.indexOf('?'));

          // Check manifest cache first (skip for segments)
          if (isManifest) {
            const cached = manifestCacheGet(url);
            if (cached) {
              const stats: LoadStats = { trequest: performance.now(), tfirst: performance.now(), tload: performance.now(), retry: 0 };
              callbacks.onSuccess(
                { url: context.url, data: cached, code: 200 },
                stats,
                context
              );
              return;
            }
          }

          // Use POST request for long URLs (> 1000 chars to be safe)
          if (actualUrl.length > 1000) {
            const referer = urlParams.get('referer') || '';
            this.loadViaPost(proxyBase, actualUrl, referer, context, config, callbacks, isManifest);
            return;
          }
        }
      } catch (e) {
        console.error('[PostProxyLoader] Failed to parse proxied URL', e);
      }
    } else if (url.includes('.key')) {
      // Automatic proxy for cross-origin key files to avoid CORS blocks.
      // Must use apiUrl() so production hits the same API host as npm run dev (Vite proxy), not static / Firebase.
      const proxyBase = apiUrl('/api/stream/proxy');
      context.url = `${proxyBase}?url=${encodeURIComponent(url)}`;
      // Continue to super.load with the rewritten proxied URL
      super.load(context, config, callbacks);
      return;
    }

    // For proxied manifest URLs (non-POST path): wrap success to cache response
    if (isProxied && isManifest) {
      const originalOnSuccess = callbacks.onSuccess.bind(callbacks);
      const wrappedCallbacks = {
        ...callbacks,
        onSuccess: (
          response: { url: string; data: string | ArrayBuffer; code: number },
          stats: LoadStats,
          ctx: Hls.LoaderContext
        ) => {
          if (typeof response.data === 'string' && response.data.includes('#EXTM3U')) {
            manifestCacheSet(url, response.data);
          }
          originalOnSuccess(response as any, stats as any, ctx);
        },
      };
      super.load(context, config, wrappedCallbacks as any);
      return;
    }

    // Fall back to default loader for non-proxied or short proxied URLs.
    super.load(context, config, callbacks);
  }

  private loadViaPost(
    proxyUrl: string,
    actualUrl: string,
    referer: string,
    context: Hls.LoaderContext,
    config: Hls.LoaderConfiguration,
    callbacks: Hls.LoaderCallbacks<Hls.LoaderContext>,
    isManifest: boolean
  ): void {
    const xhr = new XMLHttpRequest();
    this.xhrRef = xhr;
    const stats: LoadStats = { trequest: performance.now(), retry: 0 };

    xhr.open('POST', proxyUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    if (context.rangeEnd) {
      xhr.setRequestHeader('Range', `bytes=${context.rangeStart}-${context.rangeEnd}`);
    }

    xhr.timeout = config.timeout || 10000;
    xhr.responseType = context.responseType || 'text';

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        stats.tfirst = Math.max(performance.now(), stats.trequest);
        stats.tload = performance.now();

        // Cache manifest responses
        if (isManifest && typeof xhr.response === 'string' && xhr.response.includes('#EXTM3U')) {
          const cacheKey = `${proxyUrl}?url=${encodeURIComponent(actualUrl)}`;
          manifestCacheSet(cacheKey, xhr.response);
        }

        callbacks.onSuccess(
          {
            url: context.url,
            data: xhr.response,
            code: xhr.status
          },
          stats,
          context
        );
      } else {
        callbacks.onError(
          {
            code: xhr.status,
            text: xhr.statusText
          },
          context
        );
      }
    };

    xhr.onerror = () => {
      callbacks.onError(
        {
          code: xhr.status,
          text: 'Network error'
        },
        context
      );
    };

    xhr.ontimeout = () => {
      callbacks.onTimeout(stats, context);
    };

    // Send POST request with URL and Referer in body
    xhr.send(JSON.stringify({ url: actualUrl, referer }));
  }

  destroy(): void {
    if (this.xhrRef) {
      this.xhrRef.abort();
      this.xhrRef = null;
    }
    super.destroy();
  }
}
