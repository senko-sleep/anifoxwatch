/**
 * KV Cache Service for Cloudflare Workers
 *
 * Wraps Cloudflare's `KVNamespace` binding with:
 *  - Automatic JSON serialization / deserialization
 *  - Graceful in-memory fallback when KV is unavailable (local dev)
 *  - Safe error handling — cache misses never crash the Worker
 *  - TTL enforcement on both KV and in-memory paths
 *
 * Usage:
 *   import { KVCache } from '../lib/kv-cache.js';
 *
 *   const cache = new KVCache(env.CACHE_STORE, env.ENABLE_KV_CACHING === 'true');
 *
 *   const hit = await cache.get<MyType>('my-cache-key');
 *   if (!hit) {
 *     const data = await fetchExpensiveThing();
 *     await cache.set('my-cache-key', data, 300); // 5-minute TTL
 *     return data;
 *   }
 *   return hit;
 */

// ---------------------------------------------------------------------------
// In-memory fallback (used when KVNamespace is not available)
// ---------------------------------------------------------------------------

interface MemoryEntry<T> {
  data: T;
  expiresAt: number;
}

class InMemoryStore {
  private store = new Map<string, MemoryEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Evict all expired entries (call periodically if needed). */
  purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

// Module-level singleton so the in-memory store survives across requests
// within the same isolate lifetime (warm Worker).
const memoryFallback = new InMemoryStore();

// ---------------------------------------------------------------------------
// KVCache
// ---------------------------------------------------------------------------

export class KVCache {
  private kv: any | undefined;
  private enabled: boolean;

  /**
   * @param kv        Cloudflare KVNamespace binding (may be undefined locally)
   * @param enabled   Set to false to bypass all caching (useful for debug)
   */
  constructor(kv: any | undefined, enabled: boolean) {
    this.kv = kv;
    this.enabled = enabled;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Retrieve a cached value.
   * Returns `null` on miss, parse error, or when caching is disabled.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;

    // Try KV first (distributed, survives isolate restarts)
    if (this.kv) {
      try {
        const raw = await this.kv.get(key);
        if (raw !== null) {
          return JSON.parse(raw) as T;
        }
      } catch (err) {
        console.warn(`[KVCache] get error for "${key}":`, err);
      }
      return null;
    }

    // Fallback to in-memory when KV binding is not present (local dev)
    return memoryFallback.get<T>(key);
  }

  /**
   * Store a value in the cache.
   * @param ttlSeconds  Time-to-live in seconds (minimum 60 for KV, no min for memory)
   * @returns true on success, false on failure or disabled
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    if (!this.enabled) return false;

    if (this.kv) {
      try {
        // Cloudflare KV enforces a minimum TTL of 60 seconds.
        const safeTtl = Math.max(60, ttlSeconds);
        await this.kv.put(key, JSON.stringify(value), {
          expirationTtl: safeTtl,
        });
        return true;
      } catch (err) {
        console.warn(`[KVCache] set error for "${key}":`, err);
        return false;
      }
    }

    // In-memory fallback
    memoryFallback.set(key, value, ttlSeconds);
    return true;
  }

  /**
   * Delete a cached entry.
   */
  async delete(key: string): Promise<boolean> {
    if (this.kv) {
      try {
        await this.kv.delete(key);
        return true;
      } catch (err) {
        console.warn(`[KVCache] delete error for "${key}":`, err);
        return false;
      }
    }
    memoryFallback.delete(key);
    return true;
  }

  /**
   * Cache-aside helper: read from cache, or populate from factory function.
   *
   * @example
   * const results = await cache.getOrSet(
   *   'trending:1',
   *   () => fetchTrending(1),
   *   120
   * );
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number
  ): Promise<{ data: T; cacheHit: boolean }> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return { data: cached, cacheHit: true };
    }

    const fresh = await factory();

    // Store only if we got a non-empty result
    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, ttlSeconds);
    }

    return { data: fresh, cacheHit: false };
  }

  /** Whether we are using the distributed KV store (true) or in-memory fallback (false). */
  get isKVBacked(): boolean {
    return this.enabled && this.kv !== undefined;
  }
}
