/**
 * Resilient Fetch Client for Cloudflare Workers
 *
 * Drop-in replacement for raw `fetch()` that adds:
 *  - AbortController-based hard timeout (no hanging subrequests)
 *  - Automatic retries with exponential backoff + random jitter
 *  - Retries only on network errors and 5xx server errors (not 4xx)
 *  - Zero Node.js dependencies — pure Web APIs
 *
 * Usage:
 *   import { resilientFetch } from '../lib/fetch-client.js';
 *
 *   const res = await resilientFetch('https://graphql.anilist.co', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ query, variables }),
 *     timeoutMs: 8000,
 *     retries: 3,
 *   });
 */

export interface ResilientFetchOptions extends RequestInit {
  /**
   * Hard wall-clock timeout per attempt in milliseconds.
   * The AbortController fires if the upstream has not responded within this window.
   * @default 8000
   */
  timeoutMs?: number;

  /**
   * Total number of attempts (1 = no retry).
   * @default 3
   */
  retries?: number;

  /**
   * Base delay between retries in milliseconds.
   * Actual delay = baseMs * 2^(attempt-1) + random jitter (0–50 ms).
   * @default 300
   */
  retryBaseMs?: number;

  /**
   * Optional label for log messages (e.g. "AniList search").
   */
  context?: string;
}

/**
 * Performs a fetch with timeout enforcement and automatic retry.
 *
 * @throws {Error} after all retries are exhausted or on unretryable errors
 */
export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 8000,
    retries = 3,
    retryBaseMs = 300,
    context = url,
    ...fetchInit
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });

      clearTimeout(timerId);

      // Client errors (4xx) are never retried — the caller must handle them.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error (5xx) — treat as retryable
      lastError = new Error(
        `[resilientFetch] ${context}: HTTP ${response.status} ${response.statusText}`
      );
      console.warn(
        `[resilientFetch] attempt ${attempt}/${retries} server error ${response.status} for "${context}"`
      );
    } catch (err: any) {
      clearTimeout(timerId);

      const isAbort = err?.name === 'AbortError';
      const message = isAbort
        ? `timed out after ${timeoutMs}ms`
        : (err?.message ?? String(err));

      lastError = new Error(`[resilientFetch] ${context}: ${message}`);
      console.warn(
        `[resilientFetch] attempt ${attempt}/${retries} ${isAbort ? 'timeout' : 'error'} for "${context}": ${message}`
      );

      // Abort errors are retryable; propagate hard non-fetch errors immediately
      if (!isAbort && err?.name !== 'TypeError') {
        throw lastError;
      }
    }

    // Don't sleep after the last attempt
    if (attempt < retries) {
      const backoff = retryBaseMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 50;
      await new Promise((res) => setTimeout(res, backoff + jitter));
    }
  }

  throw lastError ?? new Error(`[resilientFetch] ${context}: all ${retries} attempts failed`);
}

/**
 * Convenience: POST JSON body and return the parsed response JSON.
 * Throws if the HTTP status is not ok (after retries).
 */
export async function fetchJson<T = unknown>(
  url: string,
  body: unknown,
  options: Omit<ResilientFetchOptions, 'body' | 'method'> = {}
): Promise<T> {
  const response = await resilientFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
    ...options,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `[fetchJson] HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Convenience: GET JSON and return parsed response.
 * Throws if the HTTP status is not ok (after retries).
 */
export async function getJson<T = unknown>(
  url: string,
  options: Omit<ResilientFetchOptions, 'body' | 'method'> = {}
): Promise<T> {
  const response = await resilientFetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `[getJson] HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`
    );
  }

  return response.json() as Promise<T>;
}
