// Cloudflare Workers cache shim
// This file provides a compatible cache interface for Cloudflare Workers
// by using an in-memory cache instead of Redis

interface CacheStore {
    data: string;
    expiry: number;
}

const memoryCache = new Map<string, CacheStore>();
const CACHE_PREFIX = "aw_";
const DEFAULT_TTL = 300; // 5 minutes

// Cleanup function
function cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
        if (entry.expiry < now) {
            memoryCache.delete(key);
        }
    }
}

class CloudflareCache {
    static enabled = true; // Always enabled for CF Workers
    static DEFAULT_CACHE_EXPIRY_SECONDS = 300 as const;
    static CACHE_EXPIRY_HEADER_NAME = "Aniwatch-Cache-Expiry" as const;

    private static instance: CloudflareCache | null = null;
    private static cleanupScheduled = false;

    static getInstance() {
        if (!CloudflareCache.instance) {
            CloudflareCache.instance = new CloudflareCache();
        }
        return CloudflareCache.instance;
    }

    private ensureCleanup() {
        if (!CloudflareCache.cleanupScheduled && typeof setInterval !== 'undefined') {
            CloudflareCache.cleanupScheduled = true;
            setInterval(cleanupExpired, 5 * 60 * 1000);
        }
    }

    async get<T>(key: string): Promise<T | null> {
        this.ensureCleanup();
        const fullKey = CACHE_PREFIX + key;
        const entry = memoryCache.get(fullKey);

        if (!entry) return null;

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
        this.ensureCleanup();
        const fullKey = CACHE_PREFIX + key;
        memoryCache.set(fullKey, {
            data: JSON.stringify(data),
            expiry: Date.now() + ttlSeconds * 1000,
        });
    }

    async getOrSet<T>(
        dataGetter: () => Promise<T>,
        key: string,
        ttlSeconds: number = CloudflareCache.DEFAULT_CACHE_EXPIRY_SECONDS
    ): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached) return cached;

        const data = await dataGetter();
        await this.set(key, data, ttlSeconds);
        return data;
    }
}

export const cache = CloudflareCache.getInstance();
export const AniwatchAPICache = CloudflareCache;
