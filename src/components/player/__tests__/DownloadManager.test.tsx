// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { unzipSync } from 'fflate';
import { DownloadManager } from '../DownloadManager';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getEpisodeServers: vi.fn().mockResolvedValue([{ name: 'Mock server', type: 'sub' }]),
    getStreamingLinks: vi.fn().mockResolvedValue({
      sources: [{ url: 'https://cdn.example.test/episode.mp4', isM3U8: false }],
    }),
    getProxyUrl: (url: string) => `/api/stream/proxy?url=${encodeURIComponent(url)}`,
  },
}));

describe('DownloadManager downloads', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads a ZIP from resolved episode video bytes', async () => {
    const videoBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 2, 3]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(videoBytes.length) } });
      return new Response(videoBytes, { status: 200, headers: { 'content-type': 'video/mp4' } });
    }));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:episode-zip');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <DownloadManager
        animeTitle="Test Anime"
        animeId="test-anime"
        episodes={[{ id: 'episode-1', number: 1, title: 'Episode 1', hasSub: true, hasDub: false }]}
      />
    );

    fireEvent.click(screen.getByText('Download Manager'));
    fireEvent.click(screen.getByRole('button', { name: /Resolve Streams/ }));
    const zipButton = await screen.findByRole('button', { name: /Download ZIP/ }, { timeout: 5_000 });
    await waitFor(() => expect((zipButton as HTMLButtonElement).disabled).toBe(false), { timeout: 6_000 });
    fireEvent.click(zipButton);

    await waitFor(() => expect(click).toHaveBeenCalled(), { timeout: 5_000 });
    const zipBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(zipBlob.type).toBe('application/zip');
    const archive = unzipSync(new Uint8Array(await zipBlob.arrayBuffer()));
    expect(archive['Test Anime/Episode 01.mp4']).toEqual(videoBytes);
  }, 15_000);
});
