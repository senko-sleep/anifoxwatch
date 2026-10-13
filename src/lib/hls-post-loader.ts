import Hls, { type HlsConfig, type LoaderCallbacks, type LoaderConfiguration, type LoaderContext } from 'hls.js';
import { apiUrl } from './api-config';

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
  // Signed manifests can create a new key on every resolution. Keep both the
  // entry size and count bounded even during a burst of fresh requests.
  if (data.length > 1024 * 1024) return;
  if (manifestCache.size >= 50) {
    const now = Date.now();
    for (const [k, v] of manifestCache) {
      if (now - v.ts > MANIFEST_CACHE_TTL) manifestCache.delete(k);
    }
    while (manifestCache.size >= 50) {
      const oldest = manifestCache.keys().next().value;
      if (!oldest) break;
      manifestCache.delete(oldest);
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
  constructor(config: HlsConfig) {
    super(config);
  }

  load(
    context: LoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ): void {
    const url = context.url;

    // Check if this is a proxied URL
    const isProxied = url.includes('/api/stream/proxy?url=');
    const contextType = (context as LoaderContext & { type?: string }).type;
    const isManifest = url.includes('.m3u8') || contextType === 'manifest' || contextType === 'level';

    if (isProxied) {
      // Check manifest cache first (skip for segments)
      if (isManifest) {
        const cached = manifestCacheGet(url);
        if (cached) {
          const stats = this.stats;
          stats.loading.start = stats.loading.first = stats.loading.end = performance.now();
          stats.loaded = stats.total = cached.length;
          callbacks.onSuccess(
            { url: context.url, data: cached, code: 200 },
            stats,
            context,
            null,
          );
          return;
        }
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

    // For proxied manifest URLs: wrap success to cache response
    if (isProxied && isManifest) {
      const originalOnSuccess = callbacks.onSuccess.bind(callbacks);
      const wrappedCallbacks = {
        ...callbacks,
        onSuccess: (
          response: { url: string; data?: string | ArrayBuffer; code?: number },
          stats: typeof this.stats,
          ctx: LoaderContext,
          networkDetails: unknown,
        ) => {
          if (typeof response.data === 'string' && response.data.includes('#EXTM3U')) {
            manifestCacheSet(url, response.data);
          }
          originalOnSuccess(response, stats, ctx, networkDetails);
        },
      };
      super.load(context, config, wrappedCallbacks as any);
      return;
    }

    // Fall back to default loader for all URLs (including proxied segments).
    super.load(context, config, callbacks);
  }

}
