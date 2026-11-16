/* ==========================================================================
   EvakWar Resident Mobile — Offline Service Worker
   Guarantees 100% Offline Access when Wi-Fi and Mobile Data are turned OFF.
   ========================================================================== */

const CACHE_NAME = 'evakwar-resident-offline-v3';
const TILE_CACHE_NAME = 'evakwar-resident-tiles-v1';

const STATIC_PRECACHE = [
  './',
  './index.html',
  './css/evakwar-styles.css',
  './css/phosphor.css',
  './css/Phosphor.woff2',
  './css/Phosphor.woff',
  './css/Phosphor.ttf',
  './css/maplibre-gl.css',
  './css/google-fonts.css',
  './js/maplibre-gl.js',
  './js/tailwind.min.js',
  './js/offline-data.js',
  './js/lora-mesh-client.js',
  './js/app.js',
  './images/logo.png',
  './images/brgy_logo.png',
  './images/hi_bust.png',
  './illustrations/sos.png',
  './illustrations/storm.svg',
  './illustrations/map.svg'
];

// 1x1 transparent PNG fallback tile for offline map gaps
const EMPTY_TILE_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 10, 73, 68, 65, 84,
  120, 156, 99, 96, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51,
  0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
]);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE).catch((err) => {
        console.warn('[SW install precache notice]:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME && k !== TILE_CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Map Tile Requests (Google Satellite, ESRI, Carto, OpenStreetMap)
  if (
    url.hostname.includes('google.com') ||
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.pathname.includes('/tile/') ||
    url.pathname.includes('/vt/')
  ) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (tileCache) => {
        const cached = await tileCache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) {
            tileCache.put(req, fresh.clone());
          }
          return fresh;
        } catch (_err) {
          // When Wi-Fi is OFF, return cached tile or empty tile (no error)
          return cached || new Response(EMPTY_TILE_PNG, {
            status: 200,
            headers: { 'Content-Type': 'image/png' }
          });
        }
      })
    );
    return;
  }

  // API calls & non-GET
  if (req.method !== 'GET' || url.pathname.startsWith('/api/lora/rx')) {
    return;
  }

  // App Shell & Static Assets: Cache-First with Network Fallback
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Background refresh if online
        fetch(req).then((fresh) => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(req, fresh));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(req).then((fresh) => {
        if (fresh && fresh.status === 200) {
          const copy = fresh.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return fresh;
      }).catch(async () => {
        // Completely offline navigation fallback
        if (req.mode === 'navigate') {
          return caches.match('./index.html') || caches.match('/resident-mobile/index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
