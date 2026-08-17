/**
 * Render.com / cold-start server keep-alive utility.
 *
 * Render free tier spins down containers after ~15 minutes of inactivity.
 * A cold-start wakeup takes 30–60 seconds, during which browser `fetch` calls
 * fail with `TypeError: Failed to fetch` (no TCP connection established at all).
 *
 * This module solves the problem two ways:
 *
 * 1. **Keep-alive pinger** — calls `/health` on the backend every 10 minutes
 *    while the user has the tab open, preventing the container from sleeping.
 *
 * 2. **Wake-up helper** — when a fetch fails with `Failed to fetch` / `ERR_CONNECTION_REFUSED`
 *    (classic cold-start symptoms), `wakeAndRetry` hits `/health` first and waits
 *    for the server to respond (up to 90 s) before retrying the original request.
 */

import { buildApiUrl, getApiConfig } from './api-config';

const PING_INTERVAL_MS  = 10 * 60 * 1000; // 10 min — well under Render's 15-min sleep threshold
const WAKE_POLL_MS      = 3_000;           // poll /health every 3 s while waking
const WAKE_TIMEOUT_MS   = 90_000;          // max time to wait for container to wake
const WAKE_FETCH_TIMEOUT = 6_000;          // individual health-check fetch timeout

let pingTimer: ReturnType<typeof setInterval> | null = null;
let isWaking = false;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function healthUrl(): string {
    const base = getApiConfig().baseUrl.replace(/\/$/, '');
    if (!base) return '/health'; // local dev — same-origin proxy
    return `${base}/health`;
}

async function pingHealth(): Promise<boolean> {
    try {
        const resp = await fetch(healthUrl(), {
            method: 'GET',
            signal: AbortSignal.timeout(WAKE_FETCH_TIMEOUT),
        });
        return resp.ok;
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start the keep-alive pinger. Safe to call multiple times — only one timer runs.
 * Call once from your app root (e.g. main.tsx) on production.
 */
export function startServerKeepAlive(): void {
    if (typeof window === 'undefined') return;

    // Only for production deployments pointing at an external API host.
    const cfg = getApiConfig();
    if (!cfg.baseUrl || cfg.baseUrl.startsWith('/')) return;

    if (pingTimer !== null) return; // already running

    // Ping once immediately to wake the server if it just spun down on page load.
    pingHealth().then(ok => {
        if (!ok) {
            console.log('[KeepAlive] Initial ping failed — server may be starting up...');
        }
    });

    pingTimer = setInterval(async () => {
        const ok = await pingHealth();
        if (!ok) {
            console.warn('[KeepAlive] Health ping failed — server may have spun down.');
        }
    }, PING_INTERVAL_MS);

    // Stop pinging when the tab is hidden to save quota; restart when visible.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (pingTimer !== null) {
                clearInterval(pingTimer);
                pingTimer = null;
            }
        } else {
            // Tab became visible — wake immediately and restart pinger.
            pingHealth();
            if (pingTimer === null) {
                pingTimer = setInterval(pingHealth, PING_INTERVAL_MS);
            }
        }
    });
}

/**
 * Returns true if `error` looks like a cold-start / unreachable server error,
 * i.e., `TypeError: Failed to fetch` or network-level failures.
 */
export function isColdStartError(error: unknown): boolean {
    if (!(error instanceof TypeError)) return false;
    const msg = error.message.toLowerCase();
    return (
        msg.includes('failed to fetch') ||
        msg.includes('network request failed') ||
        msg.includes('networkerror') ||
        msg.includes('load failed') // Safari
    );
}

/**
 * Wait for the backend container to come online (up to `WAKE_TIMEOUT_MS`),
 * then execute `fn()` and return the result.
 *
 * Use this as a fallback wrapper around API calls that might fail due to
 * cold-starts:
 *
 * ```ts
 * const data = await wakeAndRetry(() => apiClient.getStreamingLinks(...))
 *   .catch(e => { ... });
 * ```
 */
export async function wakeAndRetry<T>(fn: () => Promise<T>): Promise<T> {
    if (isWaking) {
        // Another call is already waiting for the server — just queue behind it.
        await waitForServer();
        return fn();
    }

    isWaking = true;
    console.log('[KeepAlive] Server appears to be cold — waiting for it to wake up...');

    try {
        await waitForServer();
    } finally {
        isWaking = false;
    }

    return fn();
}

async function waitForServer(): Promise<void> {
    const deadline = Date.now() + WAKE_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const ok = await pingHealth();
        if (ok) {
            console.log('[KeepAlive] Server is up — retrying request.');
            return;
        }
        await delay(WAKE_POLL_MS);
    }
    throw new Error(`Server did not wake within ${WAKE_TIMEOUT_MS / 1000}s`);
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
