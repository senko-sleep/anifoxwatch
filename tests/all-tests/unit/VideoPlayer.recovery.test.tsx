import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from '@/components/player/VideoPlayer';

const mocks = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock('hls.js', () => {
  class Hls {
    static isSupported = () => true;
    static Events = { MANIFEST_PARSED: 'manifest', LEVEL_SWITCHED: 'level', ERROR: 'error', FRAG_LOADED: 'frag' };
    static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' };
    static ErrorDetails = {};
    handlers = new Map<string, Function>();
    destroy = vi.fn();
    startLoad = vi.fn();
    stopLoad = vi.fn();
    recoverMediaError = vi.fn();
    loadSource = vi.fn();
    media: HTMLVideoElement | null = null;
    levels: any[] = [];
    constructor(public config: any) { mocks.instances.push(this); }
    attachMedia(v: HTMLVideoElement) { this.media = v; }
    on(event: string, fn: Function) { this.handlers.set(event, fn); }
  }
  return { default: Hls };
});
vi.mock('@/components/player/VideoPreview', () => ({ VideoPreview: React.forwardRef(() => null) }));
vi.mock('@/lib/hls-post-loader', () => ({ PostProxyLoader: class {} }));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.instances.length = 0;
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const src = 'https://example.com/episode.m3u8';
function startedVideo(container: HTMLElement) {
  const video = container.querySelector('video')!;
  Object.defineProperties(video, {
    paused: { value: false, configurable: true },
    seeking: { value: false, configurable: true },
    ended: { value: false, configurable: true },
    readyState: { value: 4, configurable: true },
    duration: { value: 1440, configurable: true },
  });
  video.currentTime = 240;
  act(() => video.dispatchEvent(new Event('timeupdate')));
  return video;
}

describe('VideoPlayer media recovery', () => {
  it('recreates a destroyed HLS instance after fresh resolution returns the same URL and restores progress', () => {
    const { container, rerender } = render(<VideoPlayer src={src} animeId="test" selectedEpisodeNum={1} />);
    const video = startedVideo(container);
    act(() => video.dispatchEvent(new Event('pause')));
    const original = mocks.instances[0];
    original.destroy();
    rerender(<VideoPlayer src={src} animeId="test" selectedEpisodeNum={1} reloadToken={1} />);
    expect(mocks.instances).toHaveLength(2);
    expect(original.destroy).toHaveBeenCalled();
    expect(mocks.instances[1].config.startPosition).toBe(240);
  });

  it.each([false, true])('fails over after a persistent empty buffer (seeking=%s)', seeking => {
    const onError = vi.fn();
    const { container } = render(<VideoPlayer src={src} onError={onError} />);
    const video = startedVideo(container);
    Object.defineProperties(video, {
      readyState: { value: 1, configurable: true },
      seeking: { value: seeking, configurable: true },
    });
    act(() => vi.advanceTimersByTime(21_000));
    expect(onError).toHaveBeenCalledExactlyOnceWith('stall_timeout_error');
    expect(mocks.instances[0].startLoad).toHaveBeenCalledWith(240);
  });

  it('keeps a deliberate pause free of startup and stall failover', () => {
    const onError = vi.fn();
    const { container } = render(<VideoPlayer src={src} onError={onError} />);
    const video = startedVideo(container);
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    act(() => vi.advanceTimersByTime(60_000));
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not fail over when the browser blocks autoplay', async () => {
    const onError = vi.fn();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    render(<VideoPlayer src={src} onError={onError} />);
    await act(async () => {
      mocks.instances[0].handlers.get('manifest')?.('manifest', { levels: [] });
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not count recovery nudges as resumed playback or jump over a distant buffer gap', () => {
    const onError = vi.fn();
    const { container } = render(<VideoPlayer src={src} onError={onError} />);
    const video = startedVideo(container);
    Object.defineProperty(video, 'buffered', {
      configurable: true,
      value: { length: 1, start: () => 600, end: () => 620 },
    });
    act(() => vi.advanceTimersByTime(20_000));
    expect(onError).toHaveBeenCalledExactlyOnceWith('stall_timeout_error');
    expect(video.currentTime).toBeLessThan(242);
  });

  it('keeps playing through nonfatal fragment timeouts while buffered, then fails over with a depleted buffer', () => {
    const onError = vi.fn();
    const { container } = render(<VideoPlayer src={src} onError={onError} />);
    const video = startedVideo(container);
    let bufferEnd = 270;
    Object.defineProperty(video, 'buffered', {
      configurable: true,
      value: { length: 1, start: () => 230, end: () => bufferEnd },
    });
    const timeout = () => mocks.instances[0].handlers.get('error')?.('error', {
      type: 'network', details: 'fragLoadTimeOut', fatal: false,
    });
    act(() => { timeout(); timeout(); timeout(); });
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.instances[0].destroy).not.toHaveBeenCalled();
    bufferEnd = 241;
    act(() => { timeout(); timeout(); });
    expect(onError).toHaveBeenCalledExactlyOnceWith('frag_load_error');
  });
});
