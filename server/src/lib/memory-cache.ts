/**
 * In-memory cache for instant loading
 * Used when database is not available or for faster responses
 */

export class MemoryCache<T> {
  private cache = new Map<string, { data: T; expires: number }>();
  private defaultTTL: number;

  constructor(defaultTTL: number = 5 * 60 * 1000) { // 5 minutes default
    this.defaultTTL = defaultTTL;
  }

  set(key: string, data: T, ttl?: number): void {
    const expires = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, { data, expires });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expires) {
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

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instances
export const animeCache = new MemoryCache<any>(10 * 60 * 1000); // 10 minutes
export const episodesCache = new MemoryCache<any>(10 * 60 * 1000); // 10 minutes
export const searchCache = new MemoryCache<any>(5 * 60 * 1000); // 5 minutes
export const trendingCache = new MemoryCache<any>(2 * 60 * 1000); // 2 minutes

// Cleanup expired entries every 5 minutes
setInterval(() => {
  animeCache.cleanup();
  episodesCache.cleanup();
  searchCache.cleanup();
  trendingCache.cleanup();
}, 5 * 60 * 1000);
