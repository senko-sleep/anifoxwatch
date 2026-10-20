import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FrameStore,
  coarseToFine,
  inspectAnnexB,
  keyframeUrl,
  loadSegments,
  parseMediaPlaylist,
  readFirstVideoFrame,
} from '../seek-thumbnails';

// ── Synthetic MPEG-TS ───────────────────────────────────────────────────────

const VIDEO_PID = 256;
const AUDIO_PID = 257;
const PMT_PID = 4096;

function packet(pid: number, pusi: boolean, payload: number[]): Uint8Array {
  const p = new Uint8Array(188).fill(0xff);
  p[0] = 0x47;
  p[1] = (pusi ? 0x40 : 0) | ((pid >> 8) & 0x1f);
  p[2] = pid & 0xff;
  const room = 184;
  if (payload.length >= room) {
    p[3] = 0x10;
    p.set(payload.slice(0, room), 4);
  } else {
    // Adaptation field stuffing so the payload ends the packet.
    const afLen = room - payload.length - 1;
    p[3] = 0x30;
    p[4] = afLen;
    if (afLen > 0) p[5] = 0x00;
    p.set(payload, 5 + afLen);
  }
  return p;
}

const pat = () => packet(0, true, [0, 0x00, 0xb0, 13, 0, 1, 0xc1, 0, 0, 0, 1, 0xe0 | (PMT_PID >> 8), PMT_PID & 0xff, 0, 0, 0, 0]);
const pmt = () => packet(PMT_PID, true, [
  0, 0x02, 0xb0, 23, 0, 1, 0xc1, 0, 0, 0xe1, 0x00, 0xf0, 0,
  0x0f, 0xe0 | (AUDIO_PID >> 8), AUDIO_PID & 0xff, 0xf0, 0,
  0x1b, 0xe0 | (VIDEO_PID >> 8), VIDEO_PID & 0xff, 0xf0, 0,
  0, 0, 0, 0,
]);

const SPS = [0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1f, 0xac, 0xd9];
const PPS = [0, 0, 0, 1, 0x68, 0xeb, 0xe3];
const IDR = [0, 0, 0, 1, 0x65, ...Array.from({ length: 400 }, (_, i) => i & 0x7f)];

function pes(es: number[]): number[] {
  return [0, 0, 1, 0xe0, 0, 0, 0x80, 0x80, 5, 0x21, 0, 1, 0, 1, ...es];
}

function chunks(bytes: number[], size: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

function segment(): Uint8Array {
  const first = chunks(pes([...SPS, ...PPS, ...IDR]), 184);
  const parts = [
    pat(), pmt(),
    packet(AUDIO_PID, true, [0, 0, 1, 0xc0, 0, 0, 0x80, 0, 0]),
    ...first.map((c, i) => packet(VIDEO_PID, i === 0, c)),
    packet(VIDEO_PID, true, pes([0, 0, 0, 1, 0x41, 1, 2, 3])),
    ...Array.from({ length: 50 }, () => packet(AUDIO_PID, false, [1, 2, 3])),
  ];
  const out = new Uint8Array(parts.length * 188);
  parts.forEach((p, i) => out.set(p, i * 188));
  return out;
}

/** A body delivered in small pieces that records whether it was cancelled early. */
function streamed(bytes: Uint8Array, piece = 500) {
  let sent = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(sent, sent + piece));
      sent += piece;
    },
    cancel() { cancelled = true; },
  });
  return { response: new Response(body), stats: () => ({ sent, cancelled }) };
}

afterEach(() => vi.unstubAllGlobals());

describe('readFirstVideoFrame', () => {
  it('returns the first access unit and cancels the rest of the download', async () => {
    const seg = segment();
    const { response, stats } = streamed(seg);
    vi.stubGlobal('fetch', vi.fn(async () => response));

    const au = await readFirstVideoFrame('https://x/seg.ts', new AbortController().signal);

    expect(Array.from(au)).toEqual([...SPS, ...PPS, ...IDR]);
    expect(stats().cancelled).toBe(true);
    expect(stats().sent).toBeLessThan(seg.length);
    expect(inspectAnnexB(au)).toEqual({ codec: 'avc1.64001f', hasIdr: true });
  });

  it('finds the sync byte behind a disguise header', async () => {
    const seg = segment();
    const disguised = new Uint8Array(seg.length + 120);
    disguised.set([0x89, 0x50, 0x4e, 0x47]);
    disguised.set(seg, 120);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(disguised)));

    const au = await readFirstVideoFrame('https://x/seg.ts', new AbortController().signal);
    expect(inspectAnnexB(au).hasIdr).toBe(true);
  });

  it('rejects data that is not a transport stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(200_000).fill(7))));
    await expect(readFirstVideoFrame('https://x/seg.mp4', new AbortController().signal)).rejects.toThrow('not MPEG-TS');
  });
});

describe('playlists', () => {
  it('parses segment start times and resolves relative URIs', () => {
    const segs = parseMediaPlaylist(
      '#EXTM3U\n#EXTINF:15.97,\nseg0.ts\n#EXTINF:7.96,\nhttps://cdn/seg1.ts\n#EXT-X-ENDLIST\n',
      'https://api/x/index.m3u8'
    );
    expect(segs).toEqual([
      { start: 0, duration: 15.97, url: 'https://api/x/seg0.ts' },
      { start: 15.97, duration: 7.96, url: 'https://cdn/seg1.ts' },
    ]);
  });

  it('declines encrypted and fMP4 playlists', () => {
    expect(parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXTINF:4,\na.ts\n', 'https://a/')).toBeNull();
    expect(parseMediaPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\na.m4s\n', 'https://a/')).toBeNull();
    expect(parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:4,\na.ts\n', 'https://a/')).toHaveLength(1);
  });

  it('follows the lowest-bandwidth variant of a master playlist', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('master.m3u8')) {
        return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\nhigh.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=600000\nlow.m3u8\n');
      }
      return new Response('#EXTM3U\n#EXTINF:10,\nlow0.ts\n');
    });
    vi.stubGlobal('fetch', fetchMock);

    const segs = await loadSegments('https://a/master.m3u8', new AbortController().signal);
    expect(fetchMock).toHaveBeenLastCalledWith('https://a/low.m3u8', expect.anything());
    expect(segs?.[0].url).toBe('https://a/low0.ts');
  });
});

describe('coarseToFine', () => {
  it('visits every index once, spreading out first', () => {
    const order = coarseToFine(10);
    expect(order.slice(0, 3)).toEqual([0, 8, 4]);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('FrameStore', () => {
  const bmp = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

  it('answers with the nearest frame on either side', () => {
    const store = new FrameStore();
    expect(store.nearest(30)).toBeNull();
    store.add(10, bmp());
    store.add(100, bmp());
    expect(store.nearest(0)?.time).toBe(10);
    expect(store.nearest(50)?.time).toBe(10);
    expect(store.nearest(60)?.time).toBe(100);
    expect(store.nearest(5000)?.time).toBe(100);
  });

  it('replaces and releases a frame in the same bucket', () => {
    const store = new FrameStore();
    const old = bmp();
    store.add(10, old);
    store.add(10.5, bmp());
    expect(old.close).toHaveBeenCalled();
    expect(store.size).toBe(1);
  });
});

describe('keyframeUrl', () => {
  it('asks only our proxy to cut, once', () => {
    const proxied = 'https://api/api/stream/proxy?url=x&k=s';
    expect(keyframeUrl(proxied)).toBe(`${proxied}&kf=1`);
    expect(keyframeUrl(`${proxied}&kf=1`)).toBe(`${proxied}&kf=1`);
    expect(keyframeUrl('https://cdn/seg.ts')).toBe('https://cdn/seg.ts');
  });
});
