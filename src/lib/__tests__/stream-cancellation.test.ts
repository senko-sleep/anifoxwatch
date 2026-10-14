import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api-client';

vi.mock('../api-config', () => ({
  getApiConfig: () => ({ baseUrl: 'https://api.example.test', deployment: 'custom' }),
  getApiFallbackUrl: () => '',
  apiUrl: (path: string) => `https://api.example.test${path}`,
}));

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('stream request lifetime', () => {
  it('cancels origin work when the viewer switches episodes', async () => {
    let upstreamSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, options) => {
      upstreamSignal = options.signal;
      return new Promise((_resolve, reject) => upstreamSignal!.addEventListener('abort', () => reject(upstreamSignal!.reason), { once: true }));
    }));
    const controller = new AbortController();
    const pending = apiClient.getStreamingLinks('ep1', undefined, 'sub', 1, 21, undefined, false, [], controller.signal);
    const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await result;
    expect(upstreamSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeout active while a response body hangs after HTTP 200', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })),
    })));
    const pending = apiClient.getStreamingLinks('ep1', undefined, 'sub', 1, 21);
    const result = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(45_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('immediately cancels the cold-start retry delay', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const controller = new AbortController();
    const pending = apiClient.getStreamingLinks('ep1', undefined, 'sub', 1, 21, undefined, false, [], controller.signal);
    const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await result;
    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
