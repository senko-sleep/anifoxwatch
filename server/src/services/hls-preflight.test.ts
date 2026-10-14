import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { preflightHls } from './hls-preflight.js';

const ts = Buffer.alloc(188 * 3);
ts[0] = ts[188] = ts[376] = 0x47;
let base: string;
const requests: string[] = [];
const upstream = createServer((req, res) => {
    const path = req.url || '';
    requests.push(path);
    if (path === '/master.m3u8') { res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nhealthy.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nbroken.m3u8'); return; }
    if (path === '/audio-master.m3u8') { res.end('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="broken.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100,AUDIO="a"\nhealthy.m3u8'); return; }
    if (path.endsWith('.m3u8')) {
        const broken = path.includes('broken');
        res.end('#EXTM3U\n' + Array.from({ length: 100 }, (_, i) => `#EXTINF:10,\n/${broken ? 'bad' : 'good'}-${i}.ts`).join('\n'));
        return;
    }
    if (path === '/bad-12.ts') { res.writeHead(403).end(); return; }
    res.end(ts);
});
beforeAll(async () => {
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});
afterAll(() => { upstream.closeAllConnections(); upstream.close(); });

describe('HLS continuity preflight', () => {
    it('rejects a backend whose first media fragment works but a later fragment is denied', async () => {
        await expect(preflightHls(`${base}/broken.m3u8`, {}, AbortSignal.timeout(2000))).rejects.toThrow('403');
    });
    it('rejects a broken top rendition even when another rendition is healthy', async () => {
        await expect(preflightHls(`${base}/master.m3u8`, {}, AbortSignal.timeout(2000))).rejects.toThrow('403');
    });
    it('validates separately advertised audio media too', async () => {
        await expect(preflightHls(`${base}/audio-master.m3u8`, {}, AbortSignal.timeout(2000))).rejects.toThrow('403');
    });
    it('accepts real media across later playback and seek samples', async () => {
        await expect(preflightHls(`${base}/healthy.m3u8`, {}, AbortSignal.timeout(2000))).resolves.toBeUndefined();
        expect(requests).toContain('/good-36.ts');
        expect(requests).toContain('/good-90.ts');
    });
});
