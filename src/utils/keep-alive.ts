/**
 * Keep-Alive Utility
 * Pings the configured API `/health` periodically (visibility-aware, with backoff on failures).
 */

import { apiUrl } from '@/lib/api-config';

const PING_INTERVAL = 4 * 60 * 1000; // 4 minutes — Vercel goes cold after ~5 min
const MAX_BACKOFF = 20 * 60 * 1000; // 20 minutes max between pings on failure

let pingInterval: NodeJS.Timeout | null = null;
let consecutiveFailures = 0;
let isTabVisible = true;

/**
 * Ping the backend health endpoint — exported so pages can trigger an immediate warm-up.
 */
export async function ping() {
  if (!isTabVisible) return;

  const pingUrl = (url: string) => fetch(url, {
    method: 'GET', mode: 'cors', cache: 'no-cache',
    referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000),
  }).catch(() => {});

  try {
    await pingUrl(apiUrl('/health'));
    consecutiveFailures = 0;
  } catch {
    consecutiveFailures++;
  }
}

/**
 * Get the next ping interval based on failure count
 */
function getNextInterval(): number {
  if (consecutiveFailures === 0) return PING_INTERVAL;
  // Exponential backoff: 8m, 16m, 30m (capped)
  return Math.min(PING_INTERVAL * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF);
}

/**
 * Schedule the next ping with adaptive interval
 */
function scheduleNextPing() {
  if (pingInterval) clearTimeout(pingInterval);
  const interval = getNextInterval();
  pingInterval = setTimeout(async () => {
    await ping();
    scheduleNextPing();
  }, interval);
}

/**
 * Handle tab visibility changes
 */
function handleVisibilityChange() {
  isTabVisible = !document.hidden;
  if (isTabVisible && pingInterval) {
    // Tab became visible — ping immediately then resume schedule
    ping();
    scheduleNextPing();
  }
}

/**
 * Start the keep-alive service
 */
export function startKeepAlive() {
  if (pingInterval) return;

  // Ping immediately on startup
  ping();
  scheduleNextPing();

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', stopKeepAlive);
  }
}

/**
 * Stop the keep-alive service
 */
export function stopKeepAlive() {
  if (pingInterval) {
    clearTimeout(pingInterval);
    pingInterval = null;
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
}

/**
 * Check if keep-alive is running
 */
export function isKeepAliveRunning(): boolean {
  return pingInterval !== null;
}
