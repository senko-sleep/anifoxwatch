import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryCache } from './memory-cache.js';

afterEach(() => { vi.useRealTimers(); });

describe('bounded metadata cache', () => {
    it('retains recently read entries while evicting the least recently used', () => {
        const cache = new MemoryCache<number>(60_000, 2);
        cache.set('one', 1);
        cache.set('two', 2);
        expect(cache.get('one')).toBe(1);
        cache.set('three', 3);
        expect(cache.size).toBe(2);
        expect(cache.get('two')).toBeNull();
        expect(cache.get('one')).toBe(1);
    });

    it('releases expired entries before evicting a still-valid value', () => {
        vi.useFakeTimers();
        const cache = new MemoryCache<number>(60_000, 2);
        cache.set('valid', 1);
        cache.set('expired', 2, 10);
        vi.advanceTimersByTime(10);
        cache.set('new', 3);
        expect(cache.get('valid')).toBe(1);
        expect(cache.get('expired')).toBeNull();
        expect(cache.size).toBe(2);
    });

    it('does not grow when overwriting a full cache and respects immediate expiry', () => {
        const cache = new MemoryCache<number>(60_000, 1);
        cache.set('same', 1);
        cache.set('same', 2);
        expect(cache.get('same')).toBe(2);
        expect(cache.size).toBe(1);
        cache.set('zero', 0, 0);
        expect(cache.get('zero')).toBeNull();
    });
});
