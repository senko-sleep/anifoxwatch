import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const streaming = { getStreamingLinks: vi.fn() };

vi.mock('../services/source-manager.js', () => ({ sourceManager: streaming }));
vi.mock('../services/hentai-index.js', () => ({ isBlockedEpisodeId: vi.fn(() => false) }));
vi.mock('../utils/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), streamingSuccess: vi.fn(), streamingFailed: vi.fn() },
}));
vi.mock('../services/stream-extractor.js', () => ({ streamExtractor: { probe: vi.fn(), extractFromEmbed: vi.fn() } }));

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
});
