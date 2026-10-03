import { describe, expect, it } from 'vitest';
import { streamExtractor } from './stream-extractor.js';

describe('browser JSON queue cancellation', () => {
    it('cancels a queued waiter promptly and lets the next request run after the active one', async () => {
        const extractor = streamExtractor as any;
        const original = extractor.fetchJsonInBrowserPage;
        const calls: string[] = [];
        let finishFirst!: () => void;
        extractor.fetchJsonInBrowserPage = async (url: string) => {
            calls.push(url);
            if (url === 'first') await new Promise<void>(resolve => { finishFirst = resolve; });
            return url;
        };

        try {
            const first = extractor.fetchJsonInBrowser('first');
            await Promise.resolve();
            await Promise.resolve();
            const controller = new AbortController();
            const second = extractor.fetchJsonInBrowser('second', { signal: controller.signal });
            controller.abort(new Error('test cancellation'));
            await expect(second).rejects.toThrow('test cancellation');

            const third = extractor.fetchJsonInBrowser('third');
            finishFirst();
            await expect(first).resolves.toBe('first');
            await expect(third).resolves.toBe('third');
            expect(calls).toEqual(['first', 'third']);
        } finally {
            extractor.fetchJsonInBrowserPage = original;
        }
    });
});
