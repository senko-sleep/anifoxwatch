// @vitest-environment happy-dom
import React from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
const RECT = { left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450, x: 0, y: 0, toJSON: () => ({}) };
const EMPTY_RANGES = { length: 0, start: () => 0, end: () => 0 };
const src = 'https://example.com/ep1.m3u8';

const calls: string[] = [];
const lock = vi.fn(async () => { calls.push('lock'); });
const unlock = vi.fn(() => { calls.push('unlock'); });

function setMobile(mobile: boolean) {
  if (mobile) Object.defineProperty(window.navigator, 'userAgent', { get: () => ANDROID_UA, configurable: true });
  else delete (window.navigator as any).userAgent;
}

function setFullscreen(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
  document.dispatchEvent(new Event('fullscreenchange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.instances.length = 0;
  calls.length = 0;
  lock.mockClear();
  unlock.mockClear();
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT as DOMRect);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: vi.fn(async function (this: HTMLElement) { calls.push('fullscreen'); setFullscreen(this); }),
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: vi.fn(async () => setFullscreen(null)),
  });
  vi.stubGlobal('screen', { orientation: { lock, unlock } });
  setMobile(true);
});

afterEach(() => {
  cleanup();
  setMobile(false);
  Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function startedVideo(container: HTMLElement, { paused = false } = {}) {
  const video = container.querySelector('video')!;
  Object.defineProperties(video, {
    paused: { value: paused, configurable: true },
    seeking: { value: false, configurable: true },
    ended: { value: false, configurable: true },
    readyState: { value: 4, configurable: true },
    duration: { value: 1440, configurable: true },
    buffered: { value: { length: 1, start: () => 230, end: () => 260 }, configurable: true },
  });
  video.currentTime = 240;
  act(() => {
    video.dispatchEvent(new Event('durationchange'));
    video.dispatchEvent(new Event('timeupdate'));
  });
  return video;
}

const surface = (container: HTMLElement) => container.firstElementChild as HTMLElement;
const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

function swipe(el: HTMLElement, from: [number, number], moves: Array<[number, number]>) {
  act(() => { fireEvent.touchStart(el, touch(...from)); });
  for (const m of moves) act(() => { fireEvent.touchMove(el, touch(...m)); });
  act(() => { fireEvent.touchEnd(el, { touches: [] }); });
}

describe('mobile fullscreen orientation', () => {
  it('locks landscape only after fullscreen is active, and unlocks on exit', async () => {
    const { container } = render(<VideoPlayer src={src} />);
    startedVideo(container);

    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
    expect(calls[0]).toBe('fullscreen'); // lock before fullscreen is rejected by Chrome/Android
    expect(lock).toHaveBeenCalledWith('landscape');
    expect(unlock).not.toHaveBeenCalled();

    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
    expect(document.fullscreenElement).toBeNull();
    expect(unlock).toHaveBeenCalled();
  });

  it('re-applies the lock when fullscreen is entered some other way (e.g. system gesture)', () => {
    const { container } = render(<VideoPlayer src={src} />);
    act(() => setFullscreen(surface(container)));
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('leaves orientation alone on desktop', async () => {
    setMobile(false);
    const { container } = render(<VideoPlayer src={src} />);
    startedVideo(container);
    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
    expect(lock).not.toHaveBeenCalled();
  });

  it('PWA manifest does not pin the app to portrait', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(String(manifest.orientation ?? 'any')).not.toMatch(/portrait/);
  });
});

describe('CSS landscape fallback when the phone will not rotate', () => {
  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  const PORTRAIT = { w: 390, h: 844 };
  const setViewport = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true });
  };
  const screenRect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  const stageOf = (container: HTMLElement) => surface(container).firstElementChild as HTMLElement;

  beforeEach(() => {
    setViewport(PORTRAIT.w, PORTRAIT.h);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(screenRect(0, 0, PORTRAIT.w, PORTRAIT.h));
  });
  afterEach(() => setViewport(1024, 768));

  it('Android: lock accepted but screen still portrait -> stage rotated to fill the screen', async () => {
    const { container } = render(<VideoPlayer src={src} />);
    startedVideo(container);
    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
    expect(stageOf(container).style.transform).toBe('');

    act(() => vi.advanceTimersByTime(800));
    const stage = stageOf(container);
    expect(surface(container).dataset.pseudoLandscape).toBe('true');
    expect(stage.style.transform).toBe('rotate(90deg) translateY(-100%)');
    expect(stage.style.width).toBe(`${PORTRAIT.h}px`);
    expect(stage.style.height).toBe(`${PORTRAIT.w}px`);

    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); }); // exit
    expect(stageOf(container).style.transform).toBe('');
    expect(surface(container).dataset.pseudoLandscape).toBeUndefined();
  });

  it('Android: when the OS really rotates, no CSS rotation is applied', async () => {
    lock.mockImplementation(async () => { calls.push('lock'); setViewport(PORTRAIT.h, PORTRAIT.w); });
    const { container } = render(<VideoPlayer src={src} />);
    startedVideo(container);
    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
    act(() => vi.advanceTimersByTime(800));
    expect(stageOf(container).style.transform).toBe('');
  });

  it('iPhone: no element fullscreen -> CSS fullscreen, rotated to landscape; exit restores', async () => {
    Object.defineProperty(window.navigator, 'userAgent', { get: () => IPHONE_UA, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: undefined, configurable: true });
    lock.mockRejectedValue(new DOMException('not supported', 'NotSupportedError'));
    const { container } = render(<VideoPlayer src={src} />);
    startedVideo(container);

    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
    expect(surface(container).className).toMatch(/\bfixed\b/);
    act(() => vi.advanceTimersByTime(800));
    expect(stageOf(container).style.transform).toBe('rotate(90deg) translateY(-100%)');
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); }); // exit
    expect(surface(container).className).not.toMatch(/\bfixed\b/);
    expect(stageOf(container).style.transform).toBe('');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  async function enterPseudoLandscape(container: HTMLElement) {
    await act(async () => { fireEvent.keyDown(window, { key: 'f' }); });
    act(() => vi.advanceTimersByTime(800));
    expect(surface(container).dataset.pseudoLandscape).toBe('true');
  }

  it('rotated: a swipe along the landscape width (screen vertical) seeks', async () => {
    const { container, queryByText } = render(<VideoPlayer src={src} />);
    const video = startedVideo(container);
    video.volume = 0.6;
    await enterPseudoLandscape(container);
    const el = surface(container);

    act(() => { fireEvent.touchStart(el, touch(200, 100)); });
    act(() => { fireEvent.touchMove(el, touch(205, 180)); });
    act(() => { fireEvent.touchMove(el, touch(210, 500)); }); // +400px of an 844px-wide landscape stage
    expect(queryByText('Release to Seek')).not.toBeNull();
    act(() => { fireEvent.touchEnd(el, { touches: [] }); });
    expect(video.currentTime).toBeCloseTo(240 + (400 / 844) * 1440, 1);
    expect(video.volume).toBe(0.6);
  });

  it('rotated: a swipe along the landscape height on its right half changes volume', async () => {
    const { container, queryByText } = render(<VideoPlayer src={src} />);
    const video = startedVideo(container);
    video.volume = 1;
    await enterPseudoLandscape(container);
    const el = surface(container);

    // Landscape right half = lower part of the portrait screen; landscape "down" = screen leftwards
    act(() => { fireEvent.touchStart(el, touch(300, 700)); });
    act(() => { fireEvent.touchMove(el, touch(220, 700)); });
    act(() => { fireEvent.touchMove(el, touch(105, 700)); });
    expect(queryByText('Volume')).not.toBeNull();
    expect(video.volume).toBeLessThan(1);
    act(() => { fireEvent.touchEnd(el, { touches: [] }); });
  });

  it('rotated: tapping the progress bar seeks to the tapped landscape position', async () => {
    const { container } = render(<VideoPlayer src={src} />);
    const video = startedVideo(container);
    await enterPseudoLandscape(container);
    const bar = container.querySelector('.group\\/progress') as HTMLElement;
    // Rotated, the bar is a vertical strip on screen: 800px tall starting at y=22
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(screenRect(20, 22, 20, 800));

    act(() => { fireEvent.click(bar, { clientX: 30, clientY: 22 + 600 }); });
    expect(video.currentTime).toBeCloseTo(0.75 * 1440, 1);
  });
});

describe('mobile swipe gestures', () => {
  it('a horizontal swipe seeks once on release and never shows or changes volume', () => {
    const { container, queryByText } = render(<VideoPlayer src={src} />);
    const video = startedVideo(container);
    video.volume = 0.7;
    const el = surface(container);

    act(() => { fireEvent.touchStart(el, touch(100, 200)); });
    act(() => { fireEvent.touchMove(el, touch(180, 215)); }); // classify: seek
    act(() => { fireEvent.touchMove(el, touch(500, 230)); }); // +400px of 800 => +720s
    expect(queryByText('Release to Seek')).not.toBeNull();
    expect(video.currentTime).toBe(240); // preview only while dragging

    act(() => { fireEvent.touchEnd(el, { touches: [] }); });
    expect(video.currentTime).toBe(960);
    expect(mocks.instances[0].startLoad).toHaveBeenCalledWith(960);

    // Overlay fade-out must keep the seek label (it used to flip to "Volume 96000%")
    expect(queryByText('Volume')).toBeNull();
    expect(queryByText('Release to Seek')).not.toBeNull();
    act(() => vi.advanceTimersByTime(600));
    expect(queryByText('Release to Seek')).toBeNull();
    expect(queryByText('Volume')).toBeNull();
    expect(video.volume).toBe(0.7);
  });

  it('a mostly-horizontal drag with vertical drift on the right half is still a seek', () => {
    const { container, queryByText } = render(<VideoPlayer src={src} />);
    const video = startedVideo(container);
    video.volume = 0.5;
    const el = surface(container);
    act(() => { fireEvent.touchStart(el, touch(600, 200)); });
    act(() => { fireEvent.touchMove(el, touch(500, 270)); }); // dx=-100, dy=70
    expect(queryByText('Release to Seek')).not.toBeNull();
    expect(queryByText('Volume')).toBeNull();
    act(() => { fireEvent.touchEnd(el, { touches: [] }); });
    expect(video.volume).toBe(0.5);
  });

  it('vertical volume swipe is capped at 100% and 0%', () => {
    const { container, queryByText } = render(<VideoPlayer src={src} />);
    const video = startedVideo(container);
    const el = surface(container);

    act(() => { fireEvent.touchStart(el, touch(700, 440)); });
    act(() => { fireEvent.touchMove(el, touch(700, 370)); });
    act(() => { fireEvent.touchMove(el, touch(700, -800)); }); // far past the top
    expect(queryByText('100%')).not.toBeNull();
    expect(video.volume).toBeLessThanOrEqual(1);
    act(() => { fireEvent.touchEnd(el, { touches: [] }); });
    act(() => vi.advanceTimersByTime(600));

    swipe(el, [700, 10], [[700, 80], [700, 2000]]);
    expect(video.volume).toBe(0);
  });
});

describe('seeking to an unbuffered point', () => {
  it('loads the target while paused and retries until a frame is decodable', () => {
    const { container } = render(<VideoPlayer src={src} />);
    const video = startedVideo(container, { paused: true });
    const hls = mocks.instances[0];
    Object.defineProperties(video, {
      buffered: { value: EMPTY_RANGES, configurable: true },
      seeking: { value: true, configurable: true },
      readyState: { value: 1, configurable: true },
    });
    video.currentTime = 900;
    act(() => { video.dispatchEvent(new Event('seeking')); });

    act(() => vi.advanceTimersByTime(2_000));
    expect(hls.startLoad).toHaveBeenCalledWith(900);
    act(() => vi.advanceTimersByTime(6_000));
    expect(hls.recoverMediaError).toHaveBeenCalled();

    Object.defineProperties(video, {
      seeking: { value: false, configurable: true },
      readyState: { value: 4, configurable: true },
    });
    act(() => { video.dispatchEvent(new Event('seeked')); });
    hls.startLoad.mockClear();
    hls.recoverMediaError.mockClear();
    act(() => vi.advanceTimersByTime(10_000));
    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(hls.recoverMediaError).not.toHaveBeenCalled();
  });

  it('does not restart loading for a seek inside the buffer', () => {
    const { container } = render(<VideoPlayer src={src} />);
    const video = startedVideo(container);
    const hls = mocks.instances[0];
    hls.startLoad.mockClear();
    video.currentTime = 250;
    act(() => { video.dispatchEvent(new Event('seeking')); });
    act(() => vi.advanceTimersByTime(5_000));
    expect(hls.startLoad).not.toHaveBeenCalled();
  });
});

describe('picture-in-picture next episode', () => {
  it('keeps the same <video> element and loads the new episode into it', () => {
    const { container, rerender } = render(<VideoPlayer src={src} animeId="show" selectedEpisodeNum={1} />);
    const video = startedVideo(container);

    rerender(<VideoPlayer src="https://example.com/ep2.m3u8" animeId="show" selectedEpisodeNum={2} />);

    expect(container.querySelector('video')).toBe(video); // PiP window stays attached
    expect(mocks.instances).toHaveLength(2);
    expect(mocks.instances[0].destroy).toHaveBeenCalled();
    expect(mocks.instances[1].media).toBe(video);
    expect(mocks.instances[1].loadSource).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('ep2.m3u8')));
  });

  it("does not resume episode 2 at episode 1's saved position", () => {
    localStorage.setItem('video-position-show-1', '900');
    const { container, rerender } = render(<VideoPlayer src={src} animeId="show" selectedEpisodeNum={1} />);
    startedVideo(container);
    rerender(<VideoPlayer src="https://example.com/ep2.m3u8" animeId="show" selectedEpisodeNum={2} />);
    expect(mocks.instances[1].config.startPosition).toBe(-1);
  });
});
