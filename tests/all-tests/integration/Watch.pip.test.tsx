// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Watch from '@/pages/Watch';

// Stand-in player: Watch's job is to keep ONE player instance (one <video>) alive
// across the episode change while PiP is open, so count mounts/unmounts.
const player = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
vi.mock('@/components/player/VideoPlayer', async () => {
  const React = await import('react');
  return {
    VideoPlayer: (props: { src: string; selectedEpisodeNum?: number; onNextEpisode?: () => void }) => {
      React.useEffect(() => {
        player.mounts++;
        return () => { player.unmounts++; };
      }, []);
      return (
        <div>
          <video data-testid="player-video" data-src={props.src} data-ep={props.selectedEpisodeNum} />
          <button onClick={() => props.onNextEpisode?.()}>next-episode</button>
        </div>
      );
    },
  };
});

const jsonResp = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});
const streamFor = (ep: number) => ({
  sources: [{ url: `https://example.com/ep${ep}.m3u8`, quality: '720p', isM3U8: true }],
  subtitles: [],
  source: 'test',
  dubFallback: false,
});

let releaseEp2: () => void;

beforeEach(() => {
  player.mounts = 0;
  player.unmounts = 0;
  const ep2Gate = new Promise<void>((resolve) => { releaseEp2 = resolve; });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (global.fetch as any) = vi.fn(async (url: string) => {
    const u = String(url || '');
    if (u.includes('/api/anime?')) {
      return jsonResp({ id: 'test-id', title: 'Test Anime', image: 'https://example.com/i.jpg', type: 'TV', status: 'Ongoing', episodes: 12, dubCount: 0, genres: [] });
    }
    if (u.includes('/api/anime/episodes')) {
      return jsonResp({ episodes: [1, 2, 3].map((n) => ({ id: `ep${n}`, number: n, title: `Episode ${n}`, hasSub: true, hasDub: false })) });
    }
    if (u.includes('/api/stream/servers/')) {
      return jsonResp({ servers: [{ name: 'neko_senko_1', url: 'https://example.com', type: 'sub' }] });
    }
    if (u.includes('/api/stream/watch')) {
      const ep = Number(new URL(u, 'http://x').searchParams.get('ep_num') || 1);
      if (ep === 2) {
        await ep2Gate; // next episode is still resolving
        return jsonResp(streamFor(2));
      }
      return jsonResp(streamFor(ep));
    }
    return jsonResp({}, false, 404);
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(document, 'pictureInPictureElement', { value: null, configurable: true });
  vi.restoreAllMocks();
});

function renderWatch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/watch/anime/anilist-189046?ep=1']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/watch/anime/:animeId" element={<Watch />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function enterPiP(video: HTMLElement) {
  Object.defineProperty(document, 'pictureInPictureElement', { value: video, configurable: true });
  await act(async () => { video.dispatchEvent(new Event('enterpictureinpicture', { bubbles: true })); });
}

describe('Watch: picture-in-picture next episode', () => {
  it('keeps the same mini player through resolution and switches it to the next episode', async () => {
    renderWatch();
    const video = await screen.findByTestId('player-video', {}, { timeout: 10_000 });
    expect(video.dataset.src).toContain('ep1.m3u8');
    await enterPiP(video);

    fireEvent.click(screen.getByText('next-episode'));

    // While episode 2 resolves, the PiP video must stay in the DOM (removing it closes PiP)
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText('Finding a source…')).toBeNull();
    expect(document.contains(video)).toBe(true);
    expect(player.unmounts).toBe(0);

    await act(async () => { releaseEp2(); });
    await waitFor(() => expect(screen.getByTestId('player-video').dataset.src).toContain('ep2.m3u8'), { timeout: 10_000 });
    expect(screen.getByTestId('player-video')).toBe(video);
    expect(video.dataset.ep).toBe('2');
    expect(player.mounts).toBe(1);
    expect(player.unmounts).toBe(0);
  }, 30_000);

  it('without PiP, the next episode still gets a fresh player', async () => {
    renderWatch();
    const video = await screen.findByTestId('player-video', {}, { timeout: 10_000 });

    fireEvent.click(screen.getByText('next-episode'));
    await screen.findByText('Finding a source…', {}, { timeout: 5_000 });
    expect(document.contains(video)).toBe(false);

    await act(async () => { releaseEp2(); });
    const next = await screen.findByTestId('player-video', {}, { timeout: 10_000 });
    await waitFor(() => expect(next.dataset.src).toContain('ep2.m3u8'));
    expect(next).not.toBe(video);
    expect(player.mounts).toBe(2);
  }, 30_000);
});
