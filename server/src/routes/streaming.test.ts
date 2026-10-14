import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const streaming = { getStreamingLinks: vi.fn() };

vi.mock('../services/source-manager.js', () => ({ sourceManager: streaming }));
vi.mock('../services/hentai-index.js', () => ({ isBlockedEpisodeId: vi.fn(() => false) }));
vi.mock('../utils/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), streamingSuccess: vi.fn(), streamingFailed: vi.fn() },
}));
vi.mock('../services/stream-extractor.js', () => ({ streamExtractor: { probe: vi.fn(), extractFromEmbed: vi.fn() } }));

// These tests stand up their own upstreams on loopback, which production refuses to proxy.
process.env.PROXY_ALLOW_PRIVATE_HOSTS = '1';
const { default: router } = await import('./streaming.js');

let base = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

beforeAll(async () => {
    server = express().use('/api/stream', router).listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
    server?.close();
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('stream failure semantics', () => {
    it('cancels a stalled segment origin when the player abandons its request', async () => {
        let sawRequest!: () => void;
        let sawClose!: () => void;
        const requested = new Promise<void>(resolve => { sawRequest = resolve; });
        const closed = new Promise<void>(resolve => { sawClose = resolve; });
        const upstream = createServer((_req, response) => {
            sawRequest();
            response.once('close', sawClose);
            // A CDN that never sends headers must not outlive a seeking player.
        });
        await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
        const target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/stall.ts`;
        const controller = new AbortController();
        const pending = fetch(`${base}/api/stream/proxy?url=${encodeURIComponent(target)}`, { signal: controller.signal })
            .catch(() => undefined);
        try {
            await requested;
            controller.abort();
            await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('Origin was not cancelled')), 1000))]);
            await pending;
        } finally {
            upstream.closeAllConnections();
            upstream.close();
        }
    });
    it('reports resolver exhaustion as a retryable 503, not a missing episode', async () => {
        streaming.getStreamingLinks.mockResolvedValue({ sources: [], subtitles: [] });

        const response = await fetch(`${base}/api/stream/watch/aniwaves-82540?eps=1&ep_num=1`);
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
            error: 'No streaming sources found',
            code: 'NO_STREAMING_SOURCES',
            retryable: true,
            episodeId: 'aniwaves-82540&eps=1',
        });
    });
    it('uses a shared bounded budget for dub resolution and sub fallback', async () => {
        streaming.getStreamingLinks.mockImplementation(async (_id, _server, category) => category === 'dub'
            ? { sources: [], subtitles: [] }
            : { sources: [{ url: 'https://media.example/video.mp4', quality: 'auto', isM3U8: false,
                probeVerified: true }], subtitles: [], source: 'Fallback' });

        const response = await fetch(`${base}/api/stream/watch/aniwaves-82540?eps=1&ep_num=1&category=dub&proxy=false`);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ dubFallback: true, category: 'sub', source: 'Fallback' });
        expect(streaming.getStreamingLinks).toHaveBeenCalledTimes(2);
        const [dubCall, subCall] = streaming.getStreamingLinks.mock.calls;
        expect(dubCall[9]).toBe(25_000);
        expect(subCall[9]).toBeGreaterThan(0);
        expect(subCall[9]).toBeLessThanOrEqual(12_000);
        expect(dubCall[8]).toBe(subCall[8]);
    });
});
