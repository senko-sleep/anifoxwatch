/**
 * Seek-bar storyboard built from the stream itself.
 *
 * Every HLS segment opens with a keyframe (SPS + PPS + IDR). Reading just that
 * frame — the first ~15% of a segment — and decoding it with WebCodecs gives a
 * thumbnail for a fraction of the segment's bytes, after which the download is
 * cancelled. Segments are swept coarse-to-fine in the background, and a hover
 * jumps the queue, so the bar fills with real frames quickly and the preview
 * can always paint the nearest one immediately.
 */

export interface Segment {
  start: number;
  duration: number;
  url: string;
}

export interface ThumbFrame {
  time: number;
  bitmap: ImageBitmap;
}

export const THUMB_W = 256;
export const THUMB_H = 144;
/** Frames are bucketed this finely; a later frame in the same bucket replaces nothing. */
const BUCKET_S = 2;
/** Give up on a segment whose first frame has not finished by this many bytes. */
const MAX_KEYFRAME_BYTES = 1_500_000;
/** Background sweep runs one segment at a time; a hover may add a second. */
const CONCURRENCY = 2;
const SWEEP_CONCURRENCY = 1;
/** Sweep size when the server sends whole segments rather than cutting them at the first frame. */
const UNCUT_SWEEP_LIMIT = 24;
/** After this many failures with no success, the stream is treated as unsupported. */
const FAILS_BEFORE_UNSUPPORTED = 3;

// ── Playlist ────────────────────────────────────────────────────────────────

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`playlist HTTP ${res.status}`);
  return res.text();
}

/**
 * Resolves a master or media playlist to its segments, taking the lowest-bandwidth
 * variant. Returns null for streams this path cannot read (encrypted, fMP4).
 */
export async function loadSegments(src: string, signal: AbortSignal): Promise<Segment[] | null> {
  let url = src;
  let text = await fetchText(url, signal);

  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split(/\r?\n/);
    let best: { bw: number; uri: string } | null = null;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
      const bw = Number(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? Infinity);
      const uri = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith('#'))?.trim();
      if (uri && (!best || bw < best.bw)) best = { bw, uri };
    }
    if (!best) return null;
    url = new URL(best.uri, url).href;
    text = await fetchText(url, signal);
  }

  return parseMediaPlaylist(text, url);
}

export function parseMediaPlaylist(text: string, baseUrl: string): Segment[] | null {
  if (/#EXT-X-KEY:(?![^\n]*METHOD=NONE)/.test(text) || text.includes('#EXT-X-MAP')) return null;
  const segments: Segment[] = [];
  let start = 0;
  let pending: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      pending = parseFloat(line.slice(8));
    } else if (line && !line.startsWith('#') && pending !== null) {
      segments.push({ start, duration: pending, url: new URL(line, baseUrl).href });
      start += pending;
      pending = null;
    }
  }
  return segments.length ? segments : null;
}

// ── MPEG-TS: first video access unit ────────────────────────────────────────

const TS = 188;

function findSync(b: Uint8Array): number {
  for (let o = 0; o + TS * 2 < b.length; o++) {
    if (b[o] === 0x47 && b[o + TS] === 0x47 && b[o + TS * 2] === 0x47) return o;
  }
  return -1;
}

/**
 * Asks the media proxy to cut a segment at the end of its first frame (`kf=1`, see
 * media-proxy/src/keyframe.rs). Hosts that ignore it send the whole segment.
 */
export const keyframeUrl = (url: string) =>
  url.includes('/api/stream/proxy?') ? `${url}${url.includes('&kf=1') ? '' : '&kf=1'}` : url;

export interface FirstFrame {
  data: Uint8Array;
  /** The server cut the segment for us, so a full sweep is cheap. */
  cut: boolean;
}

/**
 * Streams a TS segment until its first H.264 video PES is complete, then cancels.
 * Returns the Annex B bytes of that access unit.
 */
export async function readFirstVideoFrame(url: string, signal: AbortSignal): Promise<Uint8Array> {
  return (await readFirstFrame(url, signal)).data;
}

export async function readFirstFrame(url: string, signal: AbortSignal): Promise<FirstFrame> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`segment HTTP ${res.status}`);
  const cut = res.headers.has('x-keyframe-cut');
  const reader = res.body.getReader();

  let buf = new Uint8Array(0);
  let pos = -1; // first packet boundary, once synced
  let pmtPid = -1;
  let videoPid = -1;
  const pes: Uint8Array[] = [];
  let collecting = false;
  let done = false;

  const append = (chunk: Uint8Array) => {
    const next = new Uint8Array(buf.length + chunk.length);
    next.set(buf);
    next.set(chunk, buf.length);
    buf = next;
  };

  try {
    while (!done) {
      const { value, done: ended } = await reader.read();
      if (value) append(value);
      if (pos < 0) {
        pos = findSync(buf);
        if (pos < 0) {
          if (ended || buf.length > 64 * 1024) throw new Error('not MPEG-TS');
          continue;
        }
      }

      for (; pos + TS <= buf.length && !done; pos += TS) {
        if (buf[pos] !== 0x47) throw new Error('TS desync');
        const pusi = (buf[pos + 1] & 0x40) !== 0;
        const pid = ((buf[pos + 1] & 0x1f) << 8) | buf[pos + 2];
        const afc = (buf[pos + 3] >> 4) & 3;
        if (!(afc & 1)) continue; // no payload
        let p = pos + 4;
        if (afc & 2) p += 1 + buf[p];
        if (p >= pos + TS) continue;

        if (pid === 0 && pusi) {
          p += 1 + buf[p]; // pointer field
          pmtPid = ((buf[p + 10] & 0x1f) << 8) | buf[p + 11];
        } else if (pid === pmtPid && pusi && videoPid < 0) {
          p += 1 + buf[p];
          const sectionLen = ((buf[p + 1] & 0x0f) << 8) | buf[p + 2];
          const progInfoLen = ((buf[p + 10] & 0x0f) << 8) | buf[p + 11];
          const end = Math.min(p + 3 + sectionLen - 4, pos + TS);
          for (let q = p + 12 + progInfoLen; q + 5 <= end; ) {
            const streamType = buf[q];
            const esPid = ((buf[q + 1] & 0x1f) << 8) | buf[q + 2];
            const infoLen = ((buf[q + 3] & 0x0f) << 8) | buf[q + 4];
            if (streamType === 0x1b) { videoPid = esPid; break; }
            if (streamType === 0x24) throw new Error('HEVC not supported');
            q += 5 + infoLen;
          }
        } else if (pid === videoPid) {
          if (pusi) {
            if (collecting) { done = true; break; }
            collecting = true;
          }
          if (collecting) pes.push(buf.subarray(p, pos + TS));
        }
      }

      if (ended) done = true;
      if (!done && pos > MAX_KEYFRAME_BYTES) throw new Error('keyframe too large');
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!pes.length) throw new Error('no video PES');
  const total = pes.reduce((n, c) => n + c.length, 0);
  const packet = new Uint8Array(total);
  let off = 0;
  for (const c of pes) { packet.set(c, off); off += c.length; }
  if (packet[0] !== 0 || packet[1] !== 0 || packet[2] !== 1) throw new Error('bad PES start');
  return { data: packet.subarray(9 + packet[8]), cut };
}

/** NAL unit types and the codec string, read from Annex B bytes. */
export function inspectAnnexB(data: Uint8Array): { codec: string | null; hasIdr: boolean } {
  let codec: string | null = null;
  let hasIdr = false;
  for (let i = 0; i + 4 < data.length; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 1) continue;
    const type = data[i + 3] & 0x1f;
    if (type === 5) hasIdr = true;
    if (type === 7 && !codec && i + 6 < data.length) {
      const hex = (n: number) => n.toString(16).padStart(2, '0');
      codec = `avc1.${hex(data[i + 4])}${hex(data[i + 5])}${hex(data[i + 6])}`;
    }
    i += 3;
  }
  return { codec, hasIdr };
}

async function decodeKeyframe(data: Uint8Array): Promise<ImageBitmap> {
  const { codec, hasIdr } = inspectAnnexB(data);
  if (!codec || !hasIdr) throw new Error('segment does not open on a keyframe');

  return new Promise<ImageBitmap>((resolve, reject) => {
    let settled = false;
    const decoder = new VideoDecoder({
      output: (frame) => {
        if (settled) { frame.close(); return; }
        settled = true;
        createImageBitmap(frame, { resizeWidth: THUMB_W, resizeHeight: THUMB_H, resizeQuality: 'medium' })
          .then(resolve, reject)
          .finally(() => { frame.close(); try { decoder.close(); } catch { /* closed */ } });
      },
      error: (e) => { if (!settled) { settled = true; reject(e); } },
    });
    // No `description`: the decoder then expects Annex B, which is what TS carries.
    decoder.configure({ codec, optimizeForLatency: true });
    decoder.decode(new EncodedVideoChunk({ type: 'key', timestamp: 0, data }));
    decoder.flush().catch((e) => { if (!settled) { settled = true; reject(e); } });
  });
}

export const canBuildStoryboard = () =>
  typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined' && typeof createImageBitmap !== 'undefined';

/** 0, n/2, n/4, 3n/4, ... so coverage is even at every point of the sweep. */
export function coarseToFine(n: number): number[] {
  const order: number[] = [];
  const seen = new Uint8Array(n);
  let step = 1;
  while (step < n) step *= 2;
  for (; step >= 1; step /= 2) {
    for (let i = 0; i < n; i += step) {
      if (!seen[i]) { seen[i] = 1; order.push(i); }
    }
  }
  return order;
}

// ── Frame store ─────────────────────────────────────────────────────────────

/** Bitmaps keyed by time bucket; looked up by nearest time. */
export class FrameStore {
  private frames = new Map<number, ThumbFrame>();
  private maxBucket = 0;

  add(time: number, bitmap: ImageBitmap): void {
    const key = Math.floor(time / BUCKET_S);
    const old = this.frames.get(key);
    if (old) old.bitmap.close();
    this.frames.set(key, { time, bitmap });
    if (key > this.maxBucket) this.maxBucket = key;
  }

  has(time: number): boolean {
    return this.frames.has(Math.floor(time / BUCKET_S));
  }

  get size(): number {
    return this.frames.size;
  }

  nearest(time: number): ThumbFrame | null {
    if (!this.frames.size) return null;
    const key = Math.floor(Math.max(0, time) / BUCKET_S);
    for (let d = 0; d <= Math.max(key, this.maxBucket - key) + 1; d++) {
      const before = this.frames.get(key - d);
      const after = d ? this.frames.get(key + d) : undefined;
      if (before && after) {
        return Math.abs(before.time - time) <= Math.abs(after.time - time) ? before : after;
      }
      if (before || after) return (before || after)!;
    }
    return null;
  }

  clear(): void {
    for (const f of this.frames.values()) f.bitmap.close();
    this.frames.clear();
    this.maxBucket = 0;
  }
}

// ── Storyboard builder ──────────────────────────────────────────────────────

export interface StoryboardOptions {
  /** Called whenever a new frame lands. */
  onFrame: () => void;
  /** Called once if the stream turns out to be unreadable on this path. */
  onUnsupported: () => void;
  /** Background sweep cap; on-demand requests are never capped. 0 disables the sweep. */
  sweepLimit: number;
}

export class StoryboardBuilder {
  private abort = new AbortController();
  private segments: Segment[] = [];
  private queue: number[] = [];
  private done = new Set<number>();
  private inFlight = new Set<number>();
  private workers = 0;
  private sweepStarted = false;
  private successes = 0;
  private failures = 0;
  private paused = false;
  private sweepLimit: number;
  private sweepSet = new Set<number>();
  private checkedCut = false;
  /** Segments a hover asked for; never dropped from the queue. */
  private requested = new Set<number>();
  private ready: Promise<void>;
  unsupported = false;

  constructor(src: string, private store: FrameStore, private opts: StoryboardOptions) {
    this.sweepLimit = opts.sweepLimit;
    this.ready = loadSegments(src, this.abort.signal)
      .then((segments) => {
        if (!segments) return this.giveUp();
        this.segments = segments;
        this.pump();
      })
      .catch(() => this.giveUp());
  }

  private giveUp() {
    if (this.unsupported || this.abort.signal.aborted) return;
    this.unsupported = true;
    this.queue = [];
    this.opts.onUnsupported();
  }

  private indexAt(time: number): number {
    const s = this.segments;
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid].start <= time) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /** Puts the segment holding `time` at the front of the queue. */
  async request(time: number): Promise<void> {
    await this.ready;
    if (this.unsupported || !this.segments.length) return;
    const i = this.indexAt(time);
    if (this.done.has(i) || this.inFlight.has(i)) return;
    this.requested.add(i);
    this.queue = [i, ...this.queue.filter((q) => q !== i)];
    this.pump(true);
  }

  startSweep(): void {
    if (this.sweepStarted) return;
    this.sweepStarted = true;
    void this.ready.then(() => {
      if (this.unsupported) return;
      const order = coarseToFine(this.segments.length).slice(0, this.sweepLimit);
      const queued = new Set(this.queue);
      for (const i of order) this.sweepSet.add(i);
      this.queue.push(...order.filter((i) => !queued.has(i)));
      this.pump();
    });
  }

  /** While paused, only on-demand requests run (e.g. the main video is buffering). */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.pump();
  }

  private pump(urgent = false): void {
    if (this.unsupported || this.abort.signal.aborted) return;
    const limit = this.paused && !urgent ? 0 : this.paused ? 1 : CONCURRENCY;
    while (this.workers < limit && this.queue.length) {
      // The sweep alone stays at one segment at a time; only a hover gets the second slot.
      if (this.workers >= SWEEP_CONCURRENCY && !urgent && !this.requested.has(this.queue[0])) break;
      const i = this.queue.shift()!;
      if (this.done.has(i) || this.inFlight.has(i)) continue;
      this.workers++;
      this.inFlight.add(i);
      void this.build(i).finally(() => {
        this.workers--;
        this.inFlight.delete(i);
        this.pump();
      });
    }
  }

  private async build(i: number): Promise<void> {
    const seg = this.segments[i];
    try {
      const { data, cut } = await readFirstFrame(keyframeUrl(seg.url), this.abort.signal);
      if (!this.checkedCut) {
        this.checkedCut = true;
        if (!cut) this.limitSweep(UNCUT_SWEEP_LIMIT);
      }
      const bitmap = await decodeKeyframe(data);
      if (this.abort.signal.aborted) { bitmap.close(); return; }
      this.done.add(i);
      this.successes++;
      this.store.add(seg.start, bitmap);
      this.opts.onFrame();
    } catch {
      if (this.abort.signal.aborted) return;
      this.done.add(i); // do not retry a bad segment forever
      this.failures++;
      if (!this.successes && this.failures >= FAILS_BEFORE_UNSUPPORTED) this.giveUp();
    }
  }

  /** Keeps only the coarsest `n` sweep entries; hover requests are untouched. */
  private limitSweep(n: number): void {
    if (n >= this.sweepLimit) return;
    this.sweepLimit = n;
    const keep = new Set(coarseToFine(this.segments.length).slice(0, n));
    for (const i of [...this.sweepSet]) if (!keep.has(i)) this.sweepSet.delete(i);
    this.queue = this.queue.filter((i) => keep.has(i) || this.requested.has(i));
  }

  destroy(): void {
    this.abort.abort();
    this.queue = [];
  }
}
