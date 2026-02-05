/**
 * Keep-Alive Utility
 * Pings the backend periodically to prevent Render free tier from spinning down
 */

const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

let pingInterval: NodeJS.Timeout | null = null;

/**
 * Ping the backend health endpoint
 */
async function ping() {
  try {
    // Use HEAD request to minimize bandwidth
    await fetch(`${API_BASE_URL}/health`, { 
      method: 'HEAD',
      cache: 'no-cache'
    });
    console.log('[Keep-Alive] Backend pinged successfully');
  } catch (error) {
    // Silently fail - backend might be starting up
    console.warn('[Keep-Alive] Ping failed (backend may be starting)');
  }
}

/**
 * Start the keep-alive service
 * Pings backend every 10 minutes to prevent cold starts
 */
export function startKeepAlive() {
  // Don't start if already running
  if (pingInterval) {
    return;
  }

  console.log('[Keep-Alive] Starting backend keep-alive service');
  
  // Ping immediately on startup
  ping();

  // Then ping every 10 minutes
  pingInterval = setInterval(ping, PING_INTERVAL);

  // Cleanup on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', stopKeepAlive);
  }
}

/**
 * Stop the keep-alive service
 */
export function stopKeepAlive() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
    console.log('[Keep-Alive] Stopped backend keep-alive service');
  }
}

/**
 * Check if keep-alive is running
 */
export function isKeepAliveRunning(): boolean {
  return pingInterval !== null;
}
