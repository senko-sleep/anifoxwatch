import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveProviders, sameTitle, type StreamProvider } from './stream-resolver.js';
import { probeMedia } from './playable-stream.js';

const ts = Buffer.alloc(188 * 3);
ts[0] = ts[188] = ts[376] = 0x47;
let base: string;
const http = createServer((req, res) => {
    if (req.url === '/forbidden.m3u8') { res.writeHead(403).end(); return; }
    if (req.url === '/missing.m3u8') { res.writeHead(404).end(); return; }
    if (req.url === '/server-error.m3u8') { res.writeHead(500).end(); return; }
    if (req.url === '/empty.m3u8') { res.end('#EXTM3U\n'); return; }
    if (req.url === '/fake.mp4') { res.end('<html>Error</html>'); return; }
    if (req.url === '/master.m3u8') { res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmedia.m3u8'); return; }
    if (req.url === '/media.m3u8') { res.end('#EXTM3U\n#EXTINF:10,\nsegment.html\n#EXT-X-ENDLIST'); return; }
    if (req.url === '/segment.html' && req.headers.referer === 'https://player.example/') {
        res.setHeader('Content-Type', 'text/html'); res.end(ts); return;
    }
    res.writeHead(403).end();
});
beforeAll(async () => {
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(() => { http.close(); });
const data = (path: string) => ({ sources: [{ url: `${base}${path}`, quality: 'auto' as const, isM3U8: true }],
    subtitles: [], headers: { Referer: 'https://player.example/' } });
const provider = (name: string, overrides: Partial<StreamProvider> = {}): StreamProvider => ({
    name, search: vi.fn(async () => ({ results: [{ id: `${name}-own-id`, title: 'Example Season 3' }] })),
    getEpisodes: vi.fn(async () => [{ id: `${name}-internal-999`, number: 2 }]),
    getStreamingLinks: vi.fn(async () => data('/master.m3u8')), ...overrides,
} as unknown as StreamProvider);
const request = { episodeId: 'Primary-111&eps=2', nativeProvider: 'Primary', episodeNum: 2,
    titles: ['Example Season 3'], category: 'sub' as const, timeoutMs: 500 };

describe('provider fallback and identity', () => {
    it('rejects wrong seasons', () => {
        expect(sameTitle('Example Season 3', 'Example Season 2')).toBe(false);
        expect(sameTitle('SPY×FAMILY Season 3', 'Spy x Family Season 3')).toBe(true);
    });
    it('falls through exceptions, empty, forbidden, and invalid media using native episode mappings', async () => {
        const good = provider('Other');
        const result = await resolveProviders([
            provider('Primary', { getStreamingLinks: async () => { throw new Error('offline'); } }),
            provider('Empty', { getStreamingLinks: async () => ({ sources: [], subtitles: [] }) }),
            provider('Forbidden', { getStreamingLinks: async () => data('/forbidden.m3u8') }),
            provider('Invalid', { getStreamingLinks: async () => data('/fake.mp4') }), good,
        ], request);
        expect(result.source).toBe('Other');
        expect(good.getStreamingLinks).toHaveBeenCalledWith('Other-internal-999', undefined, 'sub', expect.anything());
        expect(result.sources).toHaveLength(1);
    });
    it('falls through 403, 404, 500, invalid media, and an unreachable provider', async () => {
        const healthy = provider('HealthyAfterFailures');
        const result = await resolveProviders([
            provider('Forbidden403', { getStreamingLinks: async () => data('/forbidden.m3u8') }),
            provider('Missing404', { getStreamingLinks: async () => data('/missing.m3u8') }),
            provider('ServerError500', { getStreamingLinks: async () => data('/server-error.m3u8') }),
            provider('InvalidHTML', { getStreamingLinks: async () => data('/fake.mp4') }),
            provider('Unreachable', { getStreamingLinks: async () => data('http://127.0.0.1:1/dead.m3u8') }),
            healthy,
        ], request);
        expect(result.source).toBe('HealthyAfterFailures');
        expect(result.sources).toHaveLength(1);
    });
    it('does not clamp a missing episode to the last episode', async () => {
        const missing = provider('Missing', { getEpisodes: async () => [{ id: 'last', number: 1 }] as any });
        const result = await resolveProviders([missing], request);
        expect(result.sources).toEqual([]);
        expect(missing.getStreamingLinks).not.toHaveBeenCalled();
        expect(result.attempts?.[0].error).toContain('Cannot map episode 2');
    });
    it('bounds a hung provider without losing the working provider', async () => {
        const result = await resolveProviders([
            provider('Hung', { getStreamingLinks: () => new Promise(() => {}) }), provider('Healthy'),
        ], request);
        expect(result.source).toBe('Healthy');
        const exhausted = await resolveProviders([provider('Hung', { getStreamingLinks: () => new Promise(() => {}) })], { ...request, timeoutMs: 30 });
        expect(exhausted.attempts?.[0].status).toBe('timeout');
    });
    it('aborts provider I/O when its deadline expires', async () => {
        let signal: AbortSignal | undefined;
        const hung = provider('SignalAwareHung', {
            getStreamingLinks: (_id, _server, _category, options) => {
                signal = options?.signal;
                return new Promise(() => {});
            },
        });
        await resolveProviders([hung], { ...request, timeoutMs: 100 });
        expect(signal?.aborted).toBe(true);
    });
    it('caps cross-provider timeouts while preserving a separately bounded native budget', async () => {
        let fallbackTimeout: number | undefined;
        const native = provider('Native', { getStreamingLinks: async () => ({ sources: [], subtitles: [] }) });
        const fallback = provider('Fallback', {
            getStreamingLinks: async (_id, _server, _category, options) => {
                fallbackTimeout = options?.timeout;
                return data('/master.m3u8');
            },
        });

        const result = await resolveProviders([native, fallback], {
            ...request, nativeProvider: 'Native', timeoutMs: 50_000,
        });

        expect(result.source).toBe('Fallback');
        expect(fallbackTimeout).toBe(9_000);
    });
    it('opens a provider circuit after repeated invalid streams and skips provider work during cooldown', async () => {
        const unstable = provider('CircuitUnstable', { getStreamingLinks: vi.fn(async () => data('/missing.m3u8')) });
        let now = Date.now();
        const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
        try {
            for (let i = 0; i < 3; i++) await resolveProviders([unstable], request);
            const blocked = await resolveProviders([unstable], request);
            expect(blocked.sources).toEqual([]);
            expect(blocked.attempts?.[0].status).toBe('circuit_open');
            expect(unstable.getStreamingLinks).toHaveBeenCalledTimes(6);

            now += 60_001;
            vi.mocked(unstable.getStreamingLinks!).mockImplementation(async () => data('/master.m3u8'));
            const recovered = await resolveProviders([unstable], request);
            expect(recovered.source).toBe('CircuitUnstable');
        } finally { nowSpy.mockRestore(); }
    });
    it('does not hold healthy providers behind a hung ReAnime request', async () => {
        const started: string[] = [];
        const hungReAnime = provider('ReAnime', {
            acceptsAniListId: true,
            getStreamingLinks: () => { started.push('ReAnime'); return new Promise(() => {}); },
        });
        const healthy = provider('Healthy', {
            search: async () => {
                started.push('Healthy');
                return { results: [{ id: 'healthy-id', title: 'Example Season 3', image: '', type: 'TV',
                    status: 'Ongoing', episodes: 2, genres: [] }], totalPages: 1,
                    currentPage: 1, hasNextPage: false, source: 'Healthy' };
            },
        });

        const result = await resolveProviders([hungReAnime, healthy], {
            ...request, anilistId: 123, timeoutMs: 500,
        });

        expect(result.source).toBe('Healthy');
        expect(started).toContain('Healthy');
    });
    it('aborts losing providers as soon as a browser-backed provider wins', async () => {
        let loserSignal: AbortSignal | undefined;
        const winner = provider('Aniwaves', { acceptsAniListId: true });
        const loser = provider('Anichi', {
            getStreamingLinks: (_id, _server, _category, options) => {
                loserSignal = options?.signal;
                return new Promise(() => {});
            },
        });

        const result = await resolveProviders([winner, loser], { ...request, anilistId: 123, timeoutMs: 5000 });

        expect(result.source).toBe('Aniwaves');
        expect(loserSignal?.aborted).toBe(true);
    });
    it('tries the episode ID native provider before unrelated browser-backed searches', async () => {
        const started: string[] = [];
        const slowReAnime = provider('ReAnime', {
            acceptsAniListId: true,
            getStreamingLinks: vi.fn(() => { started.push('ReAnime'); return new Promise(() => {}); }),
        });
        const nativeAniwaves = provider('Aniwaves', {
            getStreamingLinks: vi.fn(() => { started.push('Aniwaves'); return Promise.resolve(data('/master.m3u8')); }),
        });

        const result = await resolveProviders([slowReAnime, nativeAniwaves], {
            ...request,
            episodeId: 'aniwaves-75790&eps=1',
            nativeProvider: 'Aniwaves',
            timeoutMs: 5000,
        });

        expect(result.source).toBe('Aniwaves');
        expect(started).toEqual(['Aniwaves']);
        expect(nativeAniwaves.getStreamingLinks).toHaveBeenCalledWith(
            'aniwaves-75790&eps=1', undefined, 'sub', expect.objectContaining({ episodeNum: 2 })
        );
    });
    it('prefers the ReAnime iframe for dub and does not start the native provider', async () => {
        const started: string[] = [];
        const reAnime = provider('ReAnime', {
            acceptsAniListId: true,
            getStreamingLinks: vi.fn(() => {
                started.push('ReAnime');
                return Promise.resolve({
                    sources: [{ url: 'https://flixcloud.cc/e/episode?v=1', isEmbed: true, isM3U8: false, quality: 'auto' }],
                    subtitles: [],
                });
            }),
        });
        const nativeAniwaves = provider('Aniwaves', {
            getStreamingLinks: vi.fn(() => { started.push('Aniwaves'); return Promise.resolve(data('/master.m3u8')); }),
        });

        const result = await resolveProviders([nativeAniwaves, reAnime], {
            ...request,
            episodeId: 'aniwaves-82570&eps=14',
            episodeNum: 14,
            nativeProvider: 'Aniwaves',
            anilistId: 189046,
            category: 'dub',
        });

        expect(result.source).toBe('ReAnime');
        expect(result.sources[0]).toMatchObject({ isEmbed: true });
        expect(started).toEqual(['ReAnime']);
    });
    it('falls back to the native provider when the dub iframe is unavailable', async () => {
        const started: string[] = [];
        const reAnime = provider('ReAnime', {
            acceptsAniListId: true,
            getStreamingLinks: vi.fn(() => { started.push('ReAnime'); return Promise.resolve({ sources: [], subtitles: [] }); }),
        });
        const nativeAniwaves = provider('Aniwaves', {
            getStreamingLinks: vi.fn(() => { started.push('Aniwaves'); return Promise.resolve(data('/master.m3u8')); }),
        });

        const result = await resolveProviders([nativeAniwaves, reAnime], {
            ...request,
            episodeId: 'aniwaves-82570&eps=14',
            episodeNum: 14,
            nativeProvider: 'Aniwaves',
            anilistId: 189046,
            category: 'dub',
        });

        expect(result.source).toBe('Aniwaves');
        // Empty results get one cache-bypassing retry before provider fallback.
        expect(started).toEqual(['ReAnime', 'ReAnime', 'Aniwaves']);
    });
    it('does not start browser-backed providers when a direct provider succeeds', async () => {
        const browserProvider = provider('Aniwaves');
        const directProvider = provider('Yomi');

        const result = await resolveProviders([browserProvider, directProvider], request);

        expect(result.source).toBe('Yomi');
        expect(browserProvider.getStreamingLinks).not.toHaveBeenCalled();
    });
    it('uses canonical IDs only for providers that explicitly support them', async () => {
        const canonical = provider('Canonical', { acceptsAniListId: true });
        await resolveProviders([canonical], { ...request, anilistId: 123456 });
        expect(canonical.search).not.toHaveBeenCalled();
        expect(canonical.getStreamingLinks).toHaveBeenCalledWith('anilist-123456', undefined, 'sub', expect.objectContaining({ episodeNum: 2 }));
    });
    it('checks the media playlist and bytes with the required headers', async () => {
        await expect(probeMedia(`${base}/master.m3u8`, { referer: 'https://player.example/' }, AbortSignal.timeout(2000))).resolves.toBeUndefined();
        await expect(probeMedia(`${base}/master.m3u8`, {}, AbortSignal.timeout(2000))).rejects.toThrow();
        await expect(probeMedia(`${base}/empty.m3u8`, {}, AbortSignal.timeout(2000))).rejects.toThrow('no media');
    });
});
