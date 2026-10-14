import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

// The real service, started as Cloud Run starts it. Nothing here gets far enough to need
// Chromium: every request below is refused before a browser would start.
const TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const PORT = 18000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${PORT}`;
let service: ChildProcess;

function start(env: Record<string, string>): ChildProcess {
    return spawn(process.execPath, ['--import', 'tsx', 'src/extractor-service.ts'], {
        env: { ...process.env, PORT: String(PORT), ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

beforeAll(async () => {
    service = start({ EXTRACTOR_TOKEN: TOKEN });
    for (let i = 0; i < 100; i++) {
        if (await fetch(`${base}/healthz`).then((r) => r.ok, () => false)) return;
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('extractor service did not start');
}, 30_000);
afterAll(() => { service?.kill(); });

const post = (path: string, body: unknown, token: string | null = TOKEN) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
});

describe('extractor service', () => {
    it('refuses to start without a strong token', async () => {
        const weak = start({ EXTRACTOR_TOKEN: 'short' });
        const [code] = await once(weak, 'exit');
        expect(code).toBe(1);
    }, 30_000);

    it('answers /healthz without a token and without a browser', async () => {
        const res = await fetch(`${base}/healthz`);
        expect(res.status).toBe(200);
        const stats = await (await fetch(`${base}/v1/stats`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
        expect(stats.browser).toMatchObject({ browserOpen: false, launches: 0 });
    });

    it('rejects missing and wrong tokens', async () => {
        expect((await post('/v1/extract-embed', { url: 'https://example.com' }, null)).status).toBe(401);
        expect((await post('/v1/extract-embed', { url: 'https://example.com' }, `${TOKEN}x`)).status).toBe(401);
        expect((await fetch(`${base}/v1/stats`)).status).toBe(401);
    });

    it.each([
        'http://169.254.169.254/computeMetadata/v1/',
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://localhost:8080/',
        'http://127.0.0.1/',
        'http://10.0.0.5/',
        'http://192.168.1.1/',
        'http://[::1]/',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'not a url',
    ])('refuses to fetch %s', async (url) => {
        const res = await post('/v1/fetch-json', { url });
        expect(res.status).toBe(400);
    });

    it('only runs allow-listed source methods', async () => {
        expect((await post('/v1/source', { source: 'Anichi', method: 'constructor', args: [] })).status).toBe(400);
        expect((await post('/v1/source', { source: 'Aniwaves', method: 'search', args: ['x', null] })).status).toBe(400);
    });

    it('never launched a browser for any of that', async () => {
        const stats = await (await fetch(`${base}/v1/stats`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
        expect(stats.browser.launches).toBe(0);
        expect(stats.unauthorized).toBeGreaterThanOrEqual(3);
        expect(stats.rejectedUrls).toBeGreaterThanOrEqual(10);
    });
});
