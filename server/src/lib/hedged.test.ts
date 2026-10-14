import { describe, expect, it } from 'vitest';
import { hedged } from './hedged.js';
import { isPublicHttpUrl } from './public-url.js';

const after = <T>(ms: number, value: T, fail = false) => (signal: AbortSignal) => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => (fail ? reject(new Error(String(value))) : resolve(value)), ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

describe('hedged', () => {
    it('runs only the preferred task when it answers within the hedge delay', async () => {
        let started = 0;
        const counted = <T>(task: (s: AbortSignal) => Promise<T>) => (s: AbortSignal) => { started++; return task(s); };
        await expect(hedged([counted(after(10, 'a')), counted(after(1, 'b'))], 100)).resolves.toBe('a');
        expect(started).toBe(1);
    });

    it('starts the next task immediately when the preferred one fails', async () => {
        const t0 = Date.now();
        await expect(hedged([after(5, 'x', true), after(5, 'b')], 10_000)).resolves.toBe('b');
        expect(Date.now() - t0).toBeLessThan(1_000);
    });

    it('hedges a slow task after the delay and takes the first success', async () => {
        await expect(hedged([after(2_000, 'slow'), after(5, 'fast')], 20)).resolves.toBe('fast');
    });

    it('aborts the losers once a task wins', async () => {
        let aborted = false;
        const loser = (signal: AbortSignal) => new Promise<string>((_, reject) =>
            signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true }));
        await hedged([loser, after(5, 'win')], 5);
        expect(aborted).toBe(true);
    });

    it('rejects when every task fails, and when the parent aborts', async () => {
        await expect(hedged([after(1, 'a', true), after(1, 'b', true)], 5)).rejects.toThrow('All hedged tasks failed');
        const parent = new AbortController();
        const pending = hedged([after(1_000, 'a')], 5, parent.signal);
        parent.abort(new Error('gone'));
        await expect(pending).rejects.toThrow('gone');
    });
});

describe('isPublicHttpUrl', () => {
    it('accepts rotating public CDN hosts', () => {
        expect(isPublicHttpUrl('https://px.dpopdrop89.store/cdn/abc')).toBe(true);
        expect(isPublicHttpUrl('http://ru-ri-cdn3.echovideo.to/cdn/abc')).toBe(true);
        expect(isPublicHttpUrl('https://8.8.8.8/x')).toBe(true);
    });

    it('rejects loopback, private, metadata and non-web addresses', () => {
        for (const url of ['http://127.0.0.1:3001/health', 'http://localhost/', 'http://10.1.2.3/', 'http://192.168.0.1/',
            'http://172.16.5.5/', 'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/', 'http://[::1]/',
            'http://2130706433/', 'http://0x7f.1/', 'file:///etc/passwd', 'http://user:pw@example.com/', 'http://svc.internal/']) {
            expect(isPublicHttpUrl(url), url).toBe(false);
        }
    });

    it('can require https', () => {
        expect(isPublicHttpUrl('http://cdn.example/a', true)).toBe(false);
        expect(isPublicHttpUrl('https://cdn.example/a', true)).toBe(true);
    });
});
