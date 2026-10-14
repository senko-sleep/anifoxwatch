import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ExtractorUnavailableError, RemoteStreamExtractor } from './remote-extractor.js';

// A stand-in extractor whose answers each test scripts.
let replies: Array<{ status: number; body: unknown; delayMs?: number }> = [];
let seen: Array<{ path: string; auth?: string; body: any }> = [];
let server: Server;
let base = '';

beforeAll(async () => {
    server = createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
            seen.push({ path: req.url ?? '', auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
            const reply = replies.shift() ?? { status: 500, body: { error: 'no scripted reply' } };
            setTimeout(() => {
                res.writeHead(reply.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(reply.body));
            }, reply.delayMs ?? 0);
        });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
beforeEach(() => { replies = []; seen = []; vi.useRealTimers(); });

const ok = { success: true, streams: [{ url: 'https://cdn.example/a.m3u8', quality: 'auto', type: 'hls' }], subtitles: [] };

describe('RemoteStreamExtractor', () => {
    it('sends the bearer token and returns the result', async () => {
        const remote = new RemoteStreamExtractor(base, 'secret-token');
        replies = [{ status: 200, body: ok }];
        const result = await remote.extractFromEmbed('https://embed.example/e/1', 5_000);
        expect(result.success).toBe(true);
        expect(seen[0]).toMatchObject({ path: '/v1/extract-embed', auth: 'Bearer secret-token', body: { url: 'https://embed.example/e/1', timeoutMs: 5_000 } });
    });

    it('retries a transient 503 once', async () => {
        const remote = new RemoteStreamExtractor(base, 't');
        replies = [{ status: 503, body: {} }, { status: 200, body: ok }];
        expect((await remote.extractFromEmbed('https://embed.example/e/2', 5_000)).success).toBe(true);
        expect(seen).toHaveLength(2);
    });

    it('opens the circuit after repeated outages and then fails without calling', async () => {
        const remote = new RemoteStreamExtractor(base, 't');
        replies = Array.from({ length: 6 }, () => ({ status: 503, body: {} }));
        for (let i = 0; i < 3; i++) expect((await remote.extractFromEmbed('https://embed.example/e/3', 3_000)).success).toBe(false);
        const calls = seen.length;
        const started = Date.now();
        await expect(remote.fetchJsonInBrowser('https://api.example/x')).rejects.toBeInstanceOf(ExtractorUnavailableError);
        expect(seen.length).toBe(calls);                 // no request made while open
        expect(Date.now() - started).toBeLessThan(50);   // and no time spent
        expect(remote.status().breakerOpen).toBe(true);
    });

    it('closes the circuit again once the service answers', async () => {
        const remote = new RemoteStreamExtractor(base, 't');
        replies = Array.from({ length: 6 }, () => ({ status: 503, body: {} }));
        for (let i = 0; i < 3; i++) await remote.extractFromEmbed('https://embed.example/e/4', 3_000);
        expect(remote.status().breakerOpen).toBe(true);
        (remote as any).openUntil = Date.now() - 1;      // backoff elapsed
        replies = [{ status: 200, body: ok }];
        expect((await remote.extractFromEmbed('https://embed.example/e/4', 3_000)).success).toBe(true);
        expect(remote.status()).toMatchObject({ breakerOpen: false, consecutiveFailures: 0 });
    });

    it('does not count a failed extraction (422) or a rejected target (400) as an outage', async () => {
        const remote = new RemoteStreamExtractor(base, 't');
        replies = [
            ...Array.from({ length: 4 }, () => ({ status: 422, body: { error: 'Cloudflare challenge' } })),
            { status: 400, body: { error: 'private host' } },
        ];
        for (let i = 0; i < 4; i++) await expect(remote.fetchJsonInBrowser('https://api.example/x')).rejects.toThrow('Cloudflare challenge');
        await expect(remote.fetchJsonInBrowser('http://169.254.169.254/')).rejects.toThrow('private host');
        expect(seen).toHaveLength(5);                    // no retries
        expect(remote.status()).toMatchObject({ breakerOpen: false, consecutiveFailures: 0 });
    });

    it('gives up at its deadline and when the caller aborts', async () => {
        const remote = new RemoteStreamExtractor(base, 't', 0);
        replies = [{ status: 200, body: ok, delayMs: 2_000 }];
        const started = Date.now();
        await expect(remote.fetchJsonInBrowser('https://api.example/slow', { timeoutMs: 300 })).rejects.toThrow();
        expect(Date.now() - started).toBeLessThan(1_500);

        replies = [{ status: 200, body: ok, delayMs: 2_000 }];
        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error('user left')), 100);
        await expect(remote.extractFromEmbed('https://embed.example/e/5', 5_000, false, false, controller.signal)).rejects.toThrow();
    });

    it('refuses to hand out browser contexts', async () => {
        await expect(new RemoteStreamExtractor(base, 't').newContext()).rejects.toBeInstanceOf(ExtractorUnavailableError);
    });
});
