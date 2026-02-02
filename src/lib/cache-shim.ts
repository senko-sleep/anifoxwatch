// Browser cache shim
// This file provides a compatible cache interface for browser environments
// by using localStorage and in-memory cache for better performance

interface CacheStore {
    data: string;
    expiry: number;
}

// In-memory cache for faster access
const memoryCache = new Map<string, CacheStore>();

// Constants
const MEMORY_CACHE_SIZE = 100; // Max items in memory cache
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const STORAGE_PREFIX = 'aniwatch_cache_';

// Helper functions
function getCacheKey(key: string): string {
    return `${STORAGE_PREFIX}${key}`;
}

function isExpired(cacheItem: CacheStore): boolean {
    return Date.now() > cacheItem.expiry;
}

function cleanExpiredMemoryCache(): void {
    for (const [key, item] of memoryCache.entries()) {
        if (isExpired(item)) {
            memoryCache.delete(key);
        }
    }
}

function limitMemoryCacheSize(): void {
    if (memoryCache.size > MEMORY_CACHE_SIZE) {
        // Remove oldest entries (simple FIFO)
        const entries = Array.from(memoryCache.entries());
        const toDelete = entries.slice(0, memoryCache.size - MEMORY_CACHE_SIZE);
        toDelete.forEach(([key]) => memoryCache.delete(key));
    }
}

// Browser cache implementation
export const browserCache = {
    // Get item from cache (memory first, then localStorage)
    get(key: string): string | null {
        const cacheKey = getCacheKey(key);
        
        // Check memory cache first
        const memoryItem = memoryCache.get(cacheKey);
        if (memoryItem && !isExpired(memoryItem)) {
            return memoryItem.data;
        }
        
        // Remove expired memory item
        if (memoryItem && isExpired(memoryItem)) {
            memoryCache.delete(cacheKey);
        }
        
        // Check localStorage
        try {
            const stored = localStorage.getItem(cacheKey);
            if (stored) {
                const parsed: CacheStore = JSON.parse(stored);
                if (!isExpired(parsed)) {
                    // Move to memory cache for faster access
                    memoryCache.set(cacheKey, parsed);
                    limitMemoryCacheSize();
                    return parsed.data;
                } else {
                    // Remove expired item from localStorage
                    localStorage.removeItem(cacheKey);
                }
            }
        } catch (error) {
            console.warn('[Browser Cache] localStorage access failed:', error);
        }
        
        return null;
    },
    
    // Set item in cache (both memory and localStorage)
    set(key: string, value: string, ttlSeconds: number = 300): void {
        const cacheKey = getCacheKey(key);
        const expiry = Date.now() + (ttlSeconds * 1000);
        const cacheItem: CacheStore = { data: value, expiry };
        
        // Set in memory cache
        memoryCache.set(cacheKey, cacheItem);
        limitMemoryCacheSize();
        
        // Set in localStorage
        try {
            localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
        } catch (error) {
            console.warn('[Browser Cache] localStorage write failed:', error);
            // Might be quota exceeded, try to clean up
            cleanStorage();
            // Retry once
            try {
                localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
            } catch (retryError) {
                console.warn('[Browser Cache] localStorage retry failed:', retryError);
            }
        }
    },
    
    // Remove item from cache
    delete(key: string): void {
        const cacheKey = getCacheKey(key);
        memoryCache.delete(cacheKey);
        
        try {
            localStorage.removeItem(cacheKey);
        } catch (error) {
            console.warn('[Browser Cache] localStorage delete failed:', error);
        }
    },
    
    // Clear all cache
    clear(): void {
        memoryCache.clear();
        
        try {
            // Only remove our cache items, not all localStorage
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(STORAGE_PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.warn('[Browser Cache] localStorage clear failed:', error);
        }
    },
    
    // Check if item exists and is not expired
    has(key: string): boolean {
        return this.get(key) !== null;
    },
    
    // Get cache size (approximate)
    size(): number {
        cleanExpiredMemoryCache();
        return memoryCache.size;
    },
    
    // Clean up expired items
    cleanup(): void {
        cleanExpiredMemoryCache();
        cleanStorage();
    },
    
    // Get cache statistics
    stats(): {
        memorySize: number;
        storageSize: number;
        memoryKeys: string[];
        storageKeys: string[];
    } {
        cleanExpiredMemoryCache();
        
        let storageSize = 0;
        let storageKeys: string[] = [];
        
        try {
            const keys = Object.keys(localStorage);
            storageKeys = keys.filter(key => key.startsWith(STORAGE_PREFIX));
            storageSize = storageKeys.length;
        } catch (error) {
            console.warn('[Browser Cache] localStorage stats failed:', error);
        }
        
        return {
            memorySize: memoryCache.size,
            storageSize,
            memoryKeys: Array.from(memoryCache.keys()),
            storageKeys
        };
    }
};

// Cleanup expired items periodically
setInterval(() => {
    browserCache.cleanup();
}, 60 * 1000); // Every minute

// Cleanup on page unload to save memory
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        memoryCache.clear();
    });
}

// Helper function to clean localStorage
function cleanStorage(): void {
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(STORAGE_PREFIX)) {
                try {
                    const item = localStorage.getItem(key);
                    if (item) {
                        const parsed: CacheStore = JSON.parse(item);
                        if (isExpired(parsed)) {
                            localStorage.removeItem(key);
                        }
                    }
                } catch (error) {
                    // Remove corrupted items
                    localStorage.removeItem(key);
                }
            }
        });
    } catch (error) {
        console.warn('[Browser Cache] localStorage cleanup failed:', error);
    }
}

// Export types for TypeScript
export type { CacheStore };

// Export a singleton instance for easy usage
export default browserCache;
