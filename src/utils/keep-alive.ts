/**
 * Keep-Alive Utility
 * Pings the configured API `/api/health` periodically (visibility-aware, with backoff on failures).
 */

import { apiUrl } from '@/lib/api-config';

// Render free tier sleeps after 15 min of inactivity — ping every 8 min to prevent that.
// Do NOT use exponential backoff: if the server is sleeping on first ping, backing off
// means it stays asleep and the next real request still cold-starts.
const PING_INTERVAL = 8 * 60 * 1000; // 8 minutes — well under Render's 15-min sleep
const RETRY_WHEN_DOWN_MS = 20_000;   // 20 s retry when server is unreachable (waking up)

let pingInterval: NodeJS.Timeout | null = null;
let consecutiveFailures = 0;
let isTabVisible = true;

/**
 * Ping the backend health endpoint — exported so pages can trigger an immediate warm-up.
 */
export async function ping(): Promise<boolean> {
  if (!isTabVisible) return false;

  try {
    const resp = await fetch(apiUrl('/api/health'), {
      method: 'GET', mode: 'cors', cache: 'no-cache',
      referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000),
    });
    consecutiveFailures = 0;
    return resp.ok;
  } catch {
    consecutiveFailures++;
    return false;
  }
}

/**
 * Schedule the next ping. When the server is down/waking, retry quickly so
 * we detect when it comes back online. Once online, use the normal long interval.
 */
function scheduleNextPing() {
  if (pingInterval) clearTimeout(pingInterval);
  // If the server was recently unreachable, retry sooner (it may be waking up).
  const interval = consecutiveFailures > 0 ? RETRY_WHEN_DOWN_MS : PING_INTERVAL;
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

  // Ping immediately on startup — wakes the server before the user navigates to watch page.
  ping().then(ok => {
    if (!ok) {
      console.log('[KeepAlive] Initial ping failed — server may be cold-starting. Retrying...');
    }
  });
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
