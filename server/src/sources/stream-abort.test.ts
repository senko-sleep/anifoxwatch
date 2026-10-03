import { describe, expect, it, vi } from 'vitest';
import { AnichiSource } from './anichi-source.js';
import { YomiSource } from './yomi-source.js';

describe('stream source cancellation', () => {
    it('aborts losing Yomi HTTP extraction requests when another host wins', async () => {
        const source = new YomiSource();
        const signals: AbortSignal[] = [];
        (source as any).client.get = vi.fn((url: string, options: { signal: AbortSignal }) => {
            signals.push(options.signal);
            if (url.includes('vidnest.fun')) {
                return Promise.resolve({ data: 'file: "https://cdn.example/master.m3u8"' });
            }
            return new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            });
        });

        const result = await source.getStreamingLinks('anilist-195516', undefined, 'sub', {
            timeout: 500, signal: new AbortController().signal,
        });

        expect(result.sources[0]?.url).toBe('https://cdn.example/master.m3u8');
        expect(signals).toHaveLength(2);
        expect(signals[1].aborted).toBe(true);
    });

    it('closes Anichi browser resources when the resolver aborts', async () => {
        const source = new AnichiSource() as any;
        const browser = { close: vi.fn(async () => undefined) };
        const controller = new AbortController();
        const unbind = source.bindBrowserAbort(browser, controller.signal);

        controller.abort();
        await Promise.resolve();

        expect(browser.close).toHaveBeenCalledOnce();
        unbind();
    });
});
