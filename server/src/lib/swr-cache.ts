/**
 * Stale-while-revalidate cache with request coalescing and optional disk persistence.
 *
 * # The problem this solves
 *
 * Every AniList request this process makes passes through a shared pace limiter
 * (`lib/anilist-pace`), which spaces them ~700ms apart and widens to 6s when AniList pushes
 * back. That is the right way to stay under a rate limit, but it is a *process-wide queue*, so
 * it must never sit on the path of a user request that could have been answered from memory.
 *
 * Measured on the live homepage, it did exactly that. Six shelves each needed AniList, and their
 * three uncached queries ran strictly one after another:
 *
 * ```text
 *   1432ms ->  6163ms  (4730ms)  /api/anilist/graphql
 *   7032ms ->  8478ms  (1446ms)  /api/anilist/graphql
 *   9340ms ->  9784ms  ( 444ms)  /api/anilist/graphql
 * ```
 *
 * Each began only once the previous had finished: 9.8s to a complete homepage, of which 8.4s was
 * queueing. The first five requests of that same page load had all finished by 548ms.
 *
 * The cache in front of it was "fresh, or block" with a 3 minute TTL, falling back to stale only
 * when AniList actually failed. So every visitor arriving more than 3 minutes after the last one
 * paid the full queue — and paid it again for each shelf.
 *
 * # What this does instead
 *
 * Three states rather than two:
 *
 * - **fresh** — inside `ttlMs`. Returned as-is.
 * - **stale** — past `ttlMs` but inside `maxAgeMs`. Returned *immediately*, and a refresh starts
 *   in the background. The visitor who happens to arrive first after expiry stops being the one
 *   who pays for it.
 * - **missing or expired** — past `maxAgeMs`, or never fetched. Only here does a caller wait.
 *
 * Trending shelves are worth a few minutes of staleness and are identical for every visitor;
 * nobody can tell that a row is four minutes old, and everybody can tell when it takes ten
 * seconds. Callers that genuinely cannot serve stale data pass `maxAgeMs: 0`, which collapses
 * this back to ordinary blocking behaviour.
 *
 * # Coalescing
 *
 * Concurrent callers for the same key share one in-flight fetch. Without it, N simultaneous
 * visitors to a cold homepage enqueue N identical AniList requests, and because the pace limiter
 * reserves its slots up front, the last of them waits N x gap. Sharing the fetch makes that cost
 * independent of how many people are watching.
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

interface Entry<T> {
    value: T;
    /** When the value was fetched, in epoch ms. */
    at: number;
}

export interface SwrOptions {
    /** How long a value counts as fresh. */
    ttlMs: number;
    /**
     * How long a value may still be served while it refreshes. Past this it is treated as
     * missing and the caller waits. Defaults to 20x the TTL, and 0 disables stale serving.
     */
    maxAgeMs?: number;
    /** Entries to hold before the oldest is dropped. */
    maxEntries?: number;
    /**
     * File to persist entries to, relative to the working directory. Without it the cache is
     * memory-only and starts empty after every restart — which on a host that stops the service
     * when idle means the first visitor back always pays full price.
     */
    persistPath?: string;
    /** How often to write the file, if persisting. Defaults to 60s. */
    persistIntervalMs?: number;
}

export interface SwrStats {
    /** Served from a fresh entry. */
    hit: number;
    /** Served from a stale entry while refreshing behind it. */
    stale: number;
    /** No usable entry: the caller waited. */
    miss: number;
    /** Joined an in-flight fetch rather than starting one. */
    coalesced: number;
    /** Background refreshes that failed; the stale value stayed in place. */
    refreshFailed: number;
    entries: number;
    /** Share of lookups answered without the caller waiting, 0..1. */
    hitRate: number;
}

export class SwrCache<T> {
    private readonly entries = new Map<string, Entry<T>>();
    private readonly inFlight = new Map<string, Promise<T>>();
    private readonly ttlMs: number;
    private readonly maxAgeMs: number;
    private readonly maxEntries: number;
    private readonly persistPath?: string;
    private persistTimer?: NodeJS.Timeout;
    private dirty = false;

    private counts = { hit: 0, stale: 0, miss: 0, coalesced: 0, refreshFailed: 0 };

    constructor(private readonly name: string, options: SwrOptions) {
        this.ttlMs = options.ttlMs;
        this.maxAgeMs = options.maxAgeMs ?? options.ttlMs * 20;
        this.maxEntries = options.maxEntries ?? 500;
        this.persistPath = options.persistPath;

        if (this.persistPath) {
            this.load();
            this.persistTimer = setInterval(
                () => this.flush(),
                options.persistIntervalMs ?? 60_000
            );
            // A cache is an optimisation; it must never be the reason the process stays alive.
            this.persistTimer.unref?.();
        }
    }

    /**
     * Resolve `key`, fetching only when there is nothing usable to serve.
     *
     * `fetcher` is called at most once per key at a time. A rejection is propagated to callers
     * that were waiting on it, but a rejected *background* refresh is swallowed: the stale value
     * it was meant to replace is still a better answer than an error.
     */
    async get(key: string, fetcher: () => Promise<T>): Promise<T> {
        return (await this.getWithState(key, fetcher)).value;
    }

    /**
     * As `get`, but also reports which state answered. Callers use it to label the response so
     * a slow page can be diagnosed from the outside, without reading the server's logs.
     */
    async getWithState(
        key: string,
        fetcher: () => Promise<T>
    ): Promise<{ value: T; state: 'HIT' | 'STALE' | 'MISS'; ageMs: number }> {
        const entry = this.entries.get(key);
        const age = entry ? Date.now() - entry.at : Infinity;

        if (entry && age < this.ttlMs) {
            this.counts.hit++;
            return { value: entry.value, state: 'HIT', ageMs: age };
        }

        if (entry && age < this.maxAgeMs) {
            this.counts.stale++;
            // Not awaited: this is the whole point. Errors are handled inside.
            void this.refresh(key, fetcher);
            return { value: entry.value, state: 'STALE', ageMs: age };
        }

        this.counts.miss++;
        return { value: await this.refresh(key, fetcher), state: 'MISS', ageMs: 0 };
    }

    /** Start a fetch for `key`, or join the one already running. */
    private refresh(key: string, fetcher: () => Promise<T>): Promise<T> {
        const existing = this.inFlight.get(key);
        if (existing) {
            this.counts.coalesced++;
            return existing;
        }

        const pending = fetcher()
            .then((value) => {
                this.set(key, value);
                return value;
            })
            .catch((error: unknown) => {
                // A background refresh has no caller to report to, and the stale entry it failed
                // to replace is still being served, so this is a warning and not an error.
                const stale = this.entries.get(key);
                if (stale) {
                    this.counts.refreshFailed++;
                    logger.warn(
                        `[${this.name}] refresh failed for ${key.slice(0, 60)}; keeping value ` +
                        `${Math.round((Date.now() - stale.at) / 1000)}s old: ${(error as Error)?.message}`,
                        undefined,
                        'CACHE'
                    );
                    return stale.value;
                }
                throw error;
            })
            .finally(() => {
                this.inFlight.delete(key);
            });

        this.inFlight.set(key, pending);
        return pending;
    }

    set(key: string, value: T): void {
        if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
            // Map preserves insertion order, so the first key is the least recently written.
            const oldest = this.entries.keys().next().value;
            if (oldest !== undefined) this.entries.delete(oldest);
        }
        this.entries.set(key, { value, at: Date.now() });
        this.dirty = true;
    }

    /** The cached value regardless of age, without triggering a fetch. */
    peek(key: string): T | undefined {
        return this.entries.get(key)?.value;
    }

    stats(): SwrStats {
        const { hit, stale, miss, coalesced, refreshFailed } = this.counts;
        const lookups = hit + stale + miss;
        return {
            hit,
            stale,
            miss,
            coalesced,
            refreshFailed,
            entries: this.entries.size,
            // Stale counts as a hit here: the question this number answers is "how often did
            // somebody have to wait", and a stale hit is served without waiting.
            hitRate: lookups === 0 ? 0 : Number(((hit + stale) / lookups).toFixed(3)),
        };
    }

    // ── Persistence ────────────────────────────────────────────────────────────
    //
    // Entries carry their original timestamp across a restart, so a value written before the
    // process stopped is still correctly judged fresh or stale when it comes back — rather than
    // looking brand new and hiding a refresh that is genuinely due.

    private load(): void {
        if (!this.persistPath) return;
        try {
            const file = path.resolve(process.cwd(), this.persistPath);
            if (!fs.existsSync(file)) return;

            const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
                entries: [string, Entry<T>][];
            };
            const now = Date.now();
            let loaded = 0;
            for (const [key, entry] of raw.entries ?? []) {
                // Anything already past maxAge would be discarded on first read anyway.
                if (now - entry.at < this.maxAgeMs) {
                    this.entries.set(key, entry);
                    loaded++;
                }
            }
            logger.info(`[${this.name}] restored ${loaded} cached entries from disk`, undefined, 'CACHE');
        } catch (error) {
            // A corrupt or unreadable cache file is not a reason to fail startup.
            logger.warn(`[${this.name}] could not restore cache: ${(error as Error).message}`, undefined, 'CACHE');
        }
    }

    flush(): void {
        if (!this.persistPath || !this.dirty) return;
        try {
            const file = path.resolve(process.cwd(), this.persistPath);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            // Written to a temporary file and renamed, so a process that stops mid-write leaves
            // the previous good file rather than a truncated one.
            const tmp = `${file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify({ entries: [...this.entries.entries()] }));
            fs.renameSync(tmp, file);
            this.dirty = false;
        } catch (error) {
            logger.warn(`[${this.name}] could not persist cache: ${(error as Error).message}`, undefined, 'CACHE');
        }
    }

    /** Stop persisting and write once more. For shutdown and tests. */
    stop(): void {
        if (this.persistTimer) clearInterval(this.persistTimer);
        this.flush();
    }
}
