import { LOW_MEMORY_PROFILE } from './runtime-memory.js';

/**
 * In-memory cache for instant loading
 * Used when database is not available or for faster responses
 */

export class MemoryCache<T> {
  private cache = new Map<string, { data: T; expires: number }>();
  private defaultTTL: number;
  private readonly maxEntries: number;

  constructor(defaultTTL: number = 5 * 60 * 1000, maxEntries: number = LOW_MEMORY_PROFILE ? 128 : 512) {
    this.defaultTTL = defaultTTL;
    this.maxEntries = Math.max(1, Number.isFinite(maxEntries) ? Math.floor(maxEntries) : 128);
  }

  set(key: string, data: T, ttl?: number): void {
    const expires = Date.now() + (ttl ?? this.defaultTTL);
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      this.cleanup();
    }
    this.cache.delete(key);
    while (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { data, expires });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expires) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() >= entry.expires) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expires) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instances - reduced TTLs for memory optimization
const IS_LOW_MEMORY = LOW_MEMORY_PROFILE;
export const animeCache = new MemoryCache<any>(IS_LOW_MEMORY ? 5 * 60 * 1000 : 10 * 60 * 1000); // 5-10 minutes
export const episodesCache = new MemoryCache<any>(IS_LOW_MEMORY ? 5 * 60 * 1000 : 10 * 60 * 1000); // 5-10 minutes
export const searchCache = new MemoryCache<any>(IS_LOW_MEMORY ? 3 * 60 * 1000 : 5 * 60 * 1000); // 3-5 minutes
export const trendingCache = new MemoryCache<any>(IS_LOW_MEMORY ? 1 * 60 * 1000 : 2 * 60 * 1000); // 1-2 minutes

// Cleanup expired entries every 5 minutes in non-worker environments
const isWorker = typeof (globalThis as any).WebSocketPair !== 'undefined' || (typeof process !== 'undefined' && process.env && (process.env.CF_PAGES || process.env.CF_WORKER || process.env.MINIFLARE));
if (!isWorker) {
  const timer = setInterval(() => {
    animeCache.cleanup();
    episodesCache.cleanup();
    searchCache.cleanup();
    trendingCache.cleanup();
  }, 5 * 60 * 1000);
  timer.unref?.();
}
