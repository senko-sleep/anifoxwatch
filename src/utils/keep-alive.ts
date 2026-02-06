/**
 * Keep-Alive Utility
 * Pings the backend periodically to prevent Render free tier from spinning down.
 * Uses Page Visibility API to pause pings when tab is hidden and resume when visible.
 * Implements exponential backoff on consecutive failures to avoid wasting bandwidth.
 */

const PING_INTERVAL = 8 * 60 * 1000; // 8 minutes (under Render's 15-min spin-down)
const MAX_BACKOFF = 30 * 60 * 1000; // 30 minutes max between pings on failure
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

let pingInterval: NodeJS.Timeout | null = null;
let consecutiveFailures = 0;
let isTabVisible = true;

/**
 * Ping the backend health endpoint
 */
async function ping() {
  // Skip pings when tab is hidden to save bandwidth
  if (!isTabVisible) return;

  try {
    await fetch(`${API_BASE_URL}/health`, { 
      method: 'HEAD',
      cache: 'no-cache',
      signal: AbortSignal.timeout(10000)
    });
    consecutiveFailures = 0;
  } catch {
    consecutiveFailures++;
    if (consecutiveFailures > 5) {
      console.warn('[Keep-Alive] Multiple failures, backing off');
    }
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
