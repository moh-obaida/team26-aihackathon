// Jeran service worker: caches the app shell only, so the installed app opens instantly and can show a
// clear offline screen. It never touches /api/ (private, per-user, must always be fresh), never caches
// error pages, and never caches anything marked no-store/private.
// __BUILD__ is replaced at build time, so every deploy ships a new worker and old caches are purged.
const CACHE = 'jeran-__BUILD__';
const SHELL = ['/', '/manifest.webmanifest', '/logo-wordmark.png', '/icon-192.png', '/apple-touch-icon.png'];

const cacheable = (r) => r.ok && r.type === 'basic' && !/no-store|private/i.test(r.headers.get('cache-control') || '');
const keep = (req, r) => { if (cacheable(r)) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; };

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // API, other origins and anything that is not a plain GET go straight to the network, uncached.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Page loads (including deep links): always try the network first so a new deploy is picked up;
  // the cached shell is only a fallback. Every route serves the same index.html, so one entry is enough.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { if (cacheable(r)) keep('/', r); return r; }).catch(() => caches.match('/')));
    return;
  }

  // Hashed build files never change: cache-first.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => keep(req, r))));
    return;
  }

  // Icons, logo, manifest: network-first so a rebrand is not stuck behind an old copy; cache is the offline fallback.
  e.respondWith(fetch(req).then((r) => keep(req, r)).catch(() => caches.match(req)));
});
