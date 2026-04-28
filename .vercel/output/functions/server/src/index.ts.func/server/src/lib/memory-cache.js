/**
 * In-memory cache for instant loading
 * Used when database is not available or for faster responses
 */
export class MemoryCache {
    cache = new Map();
    defaultTTL;
    constructor(defaultTTL = 5 * 60 * 1000) {
        this.defaultTTL = defaultTTL;
    }
    set(key, data, ttl) {
        const expires = Date.now() + (ttl || this.defaultTTL);
        this.cache.set(key, { data, expires });
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }
    has(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return false;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    delete(key) {
        this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    // Clean up expired entries
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expires) {
                this.cache.delete(key);
            }
        }
    }
}
// Global cache instances
export const animeCache = new MemoryCache(10 * 60 * 1000); // 10 minutes
export const episodesCache = new MemoryCache(10 * 60 * 1000); // 10 minutes
export const searchCache = new MemoryCache(5 * 60 * 1000); // 5 minutes
export const trendingCache = new MemoryCache(2 * 60 * 1000); // 2 minutes
// Cleanup expired entries every 5 minutes
setInterval(() => {
    animeCache.cleanup();
    episodesCache.cleanup();
    searchCache.cleanup();
    trendingCache.cleanup();
}, 5 * 60 * 1000);
//# sourceMappingURL=memory-cache.js.map