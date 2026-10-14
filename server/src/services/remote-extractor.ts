/**
 * The API's side of browser extraction when Chromium runs elsewhere (the Cloud Run extractor,
 * see src/extractor-service.ts). Same surface as the local StreamExtractor, so sources do not
 * know where the browser is.
 *
 * Built to fail fast: a browser that cannot be reached must cost a source its few seconds,
 * not the whole resolver budget, so the browser-free providers still get their turn.
 *  - every call has a deadline (the caller's budget plus room for a cold start);
 *  - transient failures (network, 429, 5xx) are retried once with backoff, budget permitting;
 *  - consecutive failures open a circuit, during which calls fail instantly, backing off
 *    30s → 1m → 2m … 10m, and the first call after that probes whether it is back.
 * Requests carry a bearer token; it lives in the environment, never in the repository.
 */
import { logger } from '../utils/logger.js';
import type { ExtractionResult } from './stream-extractor.js';

const COLD_START_ALLOWANCE_MS = Number(process.env.EXTRACTOR_COLD_START_MS) || 12_000;
const FAILURES_TO_OPEN = 3;
const BREAKER_BASE_MS = 30_000;
const BREAKER_MAX_MS = 10 * 60_000;

export class ExtractorUnavailableError extends Error {
    constructor(message: string) { super(message); this.name = 'ExtractorUnavailableError'; }
}

export class RemoteStreamExtractor {
    readonly mode = 'remote' as const;
    private failures = 0;
    private openUntil = 0;
    private readonly stats = { calls: 0, failures: 0, rejectedOpen: 0, lastError: '' };

    constructor(private readonly baseUrl: string, private readonly token: string, private readonly coldStartMs = COLD_START_ALLOWANCE_MS) {}

    private breakerOpen(): boolean {
        return this.failures >= FAILURES_TO_OPEN && Date.now() < this.openUntil;
    }

    private recordFailure(error: string): void {
        this.failures++;
        this.stats.failures++;
        this.stats.lastError = error;
        if (this.failures >= FAILURES_TO_OPEN) {
            const backoff = Math.min(BREAKER_BASE_MS * 2 ** (this.failures - FAILURES_TO_OPEN), BREAKER_MAX_MS);
            this.openUntil = Date.now() + backoff;
            logger.warn(`[RemoteExtractor] ${this.failures} failures (${error}); failing fast for ${Math.round(backoff / 1000)}s`);
        }
    }

    private async call<T>(path: string, body: unknown, budgetMs: number, signal?: AbortSignal): Promise<T> {
        if (this.breakerOpen()) {
            this.stats.rejectedOpen++;
            throw new ExtractorUnavailableError(`Browser extractor unavailable (retrying in ${Math.round((this.openUntil - Date.now()) / 1000)}s)`);
        }
        this.stats.calls++;
        const deadline = Date.now() + budgetMs + this.coldStartMs;
        for (let attempt = 0; ; attempt++) {
            signal?.throwIfAborted();
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                this.recordFailure('deadline');
                throw new ExtractorUnavailableError('Browser extractor deadline exceeded');
            }
            const timeout = AbortSignal.timeout(remaining);
            let retryable = false;
            let failure = '';
            try {
                const res = await fetch(new URL(path, this.baseUrl), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
                    body: JSON.stringify(body),
                    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
                });
                if (res.ok) {
                    this.failures = 0;
                    return (await res.json()) as T;
                }
                failure = `HTTP ${res.status}`;
                if (res.status === 422) {
                    // The extraction itself failed (the site, not the service): no retry, no circuit.
                    this.failures = 0;
                    const { error } = await res.json().catch(() => ({ error: 'extraction failed' }));
                    throw new Error(error);
                }
                if (res.status === 400) {
                    // A target the service will not fetch (private host, bad URL): our input, not its health.
                    const { error } = await res.json().catch(() => ({ error: 'rejected' }));
                    throw new Error(`Browser extractor rejected the request: ${error}`);
                }
                // 401/403 mean the token or IAM is misconfigured: retrying will not help, and
                // they count toward the circuit so a broken deploy fails fast instead of slowly.
                retryable = res.status === 429 || res.status >= 500;
                if (!retryable) {
                    const detail = await res.text().catch(() => '');
                    this.recordFailure(failure);
                    throw new ExtractorUnavailableError(`Browser extractor refused the request (${failure}) ${detail.slice(0, 120)}`);
                }
                await res.body?.cancel().catch(() => {});
            } catch (error) {
                if (error instanceof ExtractorUnavailableError) throw error;
                if (signal?.aborted) throw error;            // the caller gave up, not the extractor
                // fetch() reports network failure as TypeError and the deadline as TimeoutError;
                // anything else was thrown above for a 400/422 answer and passes through as is.
                if (!(error instanceof TypeError) && (error as Error).name !== 'TimeoutError') throw error;
                failure = (error as Error).name === 'TimeoutError' ? 'timeout' : (error as Error).message;
                retryable = failure !== 'timeout';
            }
            const backoff = 500 * 2 ** attempt;
            if (!retryable || attempt >= 1 || deadline - Date.now() < backoff + 2_000) {
                this.recordFailure(failure);
                throw new ExtractorUnavailableError(`Browser extractor failed: ${failure}`);
            }
            await new Promise((r) => setTimeout(r, backoff));
        }
    }

    async extractFromEmbed(embedUrl: string, timeoutMs?: number, verifyPlayback = false, bypassCache = false, signal?: AbortSignal): Promise<ExtractionResult> {
        const budget = timeoutMs ?? 20_000;
        try {
            return await this.call<ExtractionResult>('/v1/extract-embed', { url: embedUrl, timeoutMs: budget, verifyPlayback, bypassCache }, budget, signal);
        } catch (error) {
            if (signal?.aborted) throw error;
            // The local extractor reports failure in the result rather than throwing; so does this.
            return { success: false, streams: [], subtitles: [], error: (error as Error).message };
        }
    }

    async fetchJsonInBrowser<T>(url: string, options: { timeoutMs?: number; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<T> {
        const budget = options.timeoutMs ?? 20_000;
        const { value } = await this.call<{ value: T }>('/v1/fetch-json', { url, timeoutMs: budget, headers: options.headers }, budget, options.signal);
        return value;
    }

    /** Runs one of a browser-only source's methods (Anichi) where the browser is. */
    async runSource<T>(source: string, method: string, args: unknown[], timeoutMs = 25_000, signal?: AbortSignal): Promise<T> {
        const { value } = await this.call<{ value: T }>('/v1/source', { source, method, args, timeoutMs }, timeoutMs, signal);
        return value;
    }

    /** Asks the service to start a browser and report its version — for diagnostics only. */
    async probe(): Promise<{ ok: boolean; ms: number; version?: string; error?: string }> {
        const started = Date.now();
        try {
            const result = await this.call<{ ok: boolean; version?: string; error?: string }>('/v1/probe', {}, 30_000);
            return { ...result, ms: Date.now() - started };
        } catch (error) {
            return { ok: false, ms: Date.now() - started, error: (error as Error).message };
        }
    }

    /** Never warms the remote browser: an idle Cloud Run instance should scale to zero. */
    async warmBrowser(): Promise<void> {}

    async newContext(): Promise<never> {
        throw new ExtractorUnavailableError('Browser contexts are not available when extraction is remote');
    }

    async close(): Promise<void> {}

    status() {
        return { mode: this.mode, url: new URL(this.baseUrl).origin, breakerOpen: this.breakerOpen(), consecutiveFailures: this.failures, ...this.stats };
    }
}

/** Browser extraction switched off (no Chromium here and no extractor configured). */
export class DisabledStreamExtractor {
    readonly mode = 'off' as const;
    private fail(): never { throw new ExtractorUnavailableError('Browser extraction is disabled on this host'); }
    async extractFromEmbed(): Promise<ExtractionResult> {
        return { success: false, streams: [], subtitles: [], error: 'Browser extraction is disabled on this host' };
    }
    async fetchJsonInBrowser<T>(): Promise<T> { return this.fail(); }
    async runSource<T>(): Promise<T> { return this.fail(); }
    async probe() { return { ok: false, ms: 0, error: 'Browser extraction is disabled on this host' }; }
    async warmBrowser(): Promise<void> {}
    async newContext(): Promise<never> { return this.fail(); }
    async close(): Promise<void> {}
    status() { return { mode: this.mode }; }
}
