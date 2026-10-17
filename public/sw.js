// v5: drops shells cached by v4, which could hold a pre-deploy index.html.
const STATIC_CACHE = 'anistream-static-v5';
const DYNAMIC_CACHE = 'anistream-dynamic-v5';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      // 'reload' bypasses the HTTP cache so the precache never stores a stale shell
      .then((cache) => cache.addAll(STATIC_ASSETS.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET, same-origin requests
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls — they have their own caching and need live data
  if (url.pathname.startsWith('/api/')) return;

  // Never intercept stream/video content
  if (/\.(m3u8|mp4|ts|mpd|webm)(\?|$)/i.test(url.pathname)) return;

  // Static assets (JS, CSS, fonts, images): cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // HTML / navigation: network-first so users always get the latest app shell
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(req, STATIC_CACHE));
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, DYNAMIC_CACHE));
});

function isStaticAsset(url) {
  return (
    url.pathname.includes('/assets/') ||
    /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?|$)/i.test(url.pathname)
  );
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    // 'no-cache' revalidates with the server instead of trusting the HTTP cache:
    // Firebase serves SPA routes (incl. the installed app's start_url "/") with
    // max-age=3600, which kept the app on the previous deploy for up to an hour.
    const res = await fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  // Kick off background refresh — must not throw
  fetch(req)
    .then((res) => { if (res.ok) cache.put(req, res.clone()); })
    .catch(() => {});

  return cached || fetch(req).catch(() => new Response('Offline', { status: 503 }));
}
