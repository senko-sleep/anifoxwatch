import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { buildEpisodeZip, fetchEpisodeVideo } from '../episode-zip';

describe('buildEpisodeZip', () => {
  it('stores episodes in a named folder with stable episode filenames', async () => {
    const episodeOne = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/test-files/demon-slayer-ep1-segment.mp4')).subarray(0, 64 * 1024));
    const episodeTwo = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 4, 5, 6, 7]);
    const blob = buildEpisodeZip('My: Anime?', [
      { number: 2, data: episodeTwo },
      { number: 1, data: episodeOne },
    ]);

    expect(blob.type).toBe('application/zip');
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(archive)).toEqual([
      'My Anime/Episode 01.mp4',
      'My Anime/Episode 02.mp4',
    ]);
    expect(archive['My Anime/Episode 01.mp4']).toEqual(episodeOne);
    expect(archive['My Anime/Episode 02.mp4']).toEqual(episodeTwo);
    expect(new TextDecoder().decode(archive['My Anime/Episode 01.mp4'].slice(4, 8))).toBe('ftyp');
  });

  it('fetches video bytes and packages them into the episode folder', async () => {
    const fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/test-files/demon-slayer-ep1-segment.mp4')).subarray(0, 64 * 1024));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(fixture, { status: 200, headers: { 'content-type': 'video/mp4' } });
    try {
      const bytes = await fetchEpisodeVideo('/api/stream/proxy?url=fixture');
      const blob = buildEpisodeZip('Demon Slayer', [{ number: 1, data: bytes }]);
      const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      expect(archive['Demon Slayer/Episode 01.mp4']).toEqual(fixture);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects error pages so they cannot be packaged as MP4 files', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('<html>provider error</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    try {
      await expect(fetchEpisodeVideo('/api/stream/proxy?url=fixture')).rejects.toThrow('did not return a video file');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
