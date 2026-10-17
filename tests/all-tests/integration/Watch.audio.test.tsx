// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Watch from '@/pages/Watch';
import { rememberAudioPreference } from '@/lib/audio-preference';
import { WatchHistory } from '@/lib/watch-history';

vi.mock('@/components/player/VideoPlayer', () => ({
  VideoPlayer: (props: { src: string; audioType?: string }) => (
    <video data-testid="player-video" data-src={props.src} data-audio={props.audioType} />
  ),
}));

const ANIME = 'anilist-189046';
const jsonResp = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});
let streamCategories: string[] = [];

beforeEach(() => {
  localStorage.clear();
  streamCategories = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (global.fetch as any) = vi.fn(async (url: string) => {
    const u = String(url || '');
    if (u.includes('/api/anime?')) {
      return jsonResp({ id: ANIME, title: 'Test Anime', image: '', type: 'TV', status: 'Ongoing', episodes: 2, dubCount: 2, genres: [] });
    }
    if (u.includes('/api/anime/episodes')) {
      return jsonResp({ episodes: [1, 2].map((n) => ({ id: `ep${n}`, number: n, title: `Episode ${n}`, hasSub: true, hasDub: true })) });
    }
    if (u.includes('/api/stream/servers/')) {
      return jsonResp({ servers: [{ name: 's-sub', url: 'https://example.com', type: 'sub' }, { name: 's-dub', url: 'https://example.com', type: 'dub' }] });
    }
    if (u.includes('/api/stream/watch')) {
      const category = new URL(u, 'http://x').searchParams.get('category') || 'sub';
      streamCategories.push(category);
      return jsonResp({
        sources: [{ url: `https://example.com/${category}.m3u8`, quality: '720p', isM3U8: true, category }],
        subtitles: [],
        source: 'test',
        dubFallback: false,
      });
    }
    return jsonResp({}, false, 404);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWatch(path = `/watch/anime/${ANIME}?ep=1`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/watch/anime/:animeId" element={<Watch />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const playing = async () => (await screen.findByTestId('player-video', {}, { timeout: 10_000 })) as HTMLElement;

describe('Watch remembers the language per anime', () => {
  it('starts in SUB when nothing is remembered', async () => {
    renderWatch();
    expect((await playing()).dataset.src).toContain('sub.m3u8');
    expect(streamCategories).not.toContain('dub');
  }, 30_000);

  it('reopens in DUB after DUB was chosen for this anime (no ?lang= in the link)', async () => {
    rememberAudioPreference(ANIME, 'dub');
    renderWatch();
    const video = await playing();
    await waitFor(() => expect(video.dataset.src).toContain('dub.m3u8'));
    expect(video.dataset.audio).toBe('dub');
  }, 30_000);

  it('uses the language recorded in watch history', async () => {
    WatchHistory.save({ id: ANIME, title: 'Test Anime', image: '' } as any, '1', 1, 300, 1440, undefined, false, 'dub');
    renderWatch();
    await waitFor(async () => expect((await playing()).dataset.src).toContain('dub.m3u8'));
  }, 30_000);

  it('choosing DUB in the UI is remembered the next time the anime is opened', async () => {
    const first = renderWatch();
    await playing();
    const dubButton = screen.getAllByRole('button').find((b) => /^\s*dub\s*$/i.test(b.textContent || ''));
    expect(dubButton).toBeDefined();
    await act(async () => { fireEvent.click(dubButton!); });
    await waitFor(async () => expect((await playing()).dataset.src).toContain('dub.m3u8'));
    first.unmount();

    renderWatch(); // e.g. opened again from search — no ?lang=
    await waitFor(async () => expect((await playing()).dataset.src).toContain('dub.m3u8'));
  }, 30_000);

  it('an explicit ?lang=sub link still wins', async () => {
    rememberAudioPreference(ANIME, 'dub');
    renderWatch(`/watch/anime/${ANIME}?ep=1&lang=sub`);
    expect((await playing()).dataset.src).toContain('sub.m3u8');
  }, 30_000);
});
