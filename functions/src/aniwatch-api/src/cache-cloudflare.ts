interface CacheEntry {
    data: string;
    expiry: number;
}

const CACHE_PREFIX = "aw_cache_";
const DEFAULT_TTL = 300; // 5 minutes

// Simple in-memory cache for Cloudflare Workers (up to 128MB)
const memoryCache = new Map<string, CacheEntry>();

// Cleanup expired entries periodically
function cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
        if (entry.expiry < now) {
            memoryCache.delete(key);
        }
    }
}

export class CloudflareAPICache {
    private static instance: CloudflareAPICache | null = null;

    static DEFAULT_CACHE_EXPIRY_SECONDS = 300 as const;
    static CACHE_EXPIRY_HEADER_NAME = "Aniwatch-Cache-Expiry" as const;

    static {
        // Cleanup every 5 minutes
        setInterval(cleanupExpired, 5 * 60 * 1000);
    }

    static getInstance() {
        if (!CloudflareAPICache.instance) {
            CloudflareAPICache.instance = new CloudflareAPICache();
        }
        return CloudflareAPICache.instance;
    }

    async get<T>(key: string): Promise<T | null> {
        const fullKey = CACHE_PREFIX + key;
        const entry = memoryCache.get(fullKey);

        if (!entry) {
            return null;
        }

        if (entry.expiry < Date.now()) {
            memoryCache.delete(fullKey);
            return null;
        }

        try {
            return JSON.parse(entry.data) as T;
        } catch {
            return null;
        }
    }

    async set<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
        const fullKey = CACHE_PREFIX + key;
        memoryCache.set(fullKey, {
            data: JSON.stringify(data),
            expiry: Date.now() + ttlSeconds * 1000,
        });
    }

    async getOrSet<T>(
        dataGetter: () => Promise<T>,
        key: string,
        ttlSeconds: number = CloudflareAPICache.DEFAULT_CACHE_EXPIRY_SECONDS
    ): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached) {
            return cached;
        }

        const data = await dataGetter();
        await this.set(key, data, ttlSeconds);
        return data;
    }
}

export const cloudflareCache = CloudflareAPICache.getInstance();
