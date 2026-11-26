/* ==========================================================================
   Evacwar Progressive Web App (PWA) Service Worker
   Version: Evacwar-static-v2
   Safe, non-invasive caching strategy with strict safety rules for emergency data.
   ========================================================================== */

const CACHE_NAME = 'Evacwar-static-v128';

// 1x1 transparent PNG buffer for graceful offline tile fallback without 408 console errors
const EMPTY_TILE_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 10, 73, 68, 65, 84,
  120, 156, 99, 96, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51,
  0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
]);

function createEmptyTileResponse() {
  return new Response(EMPTY_TILE_PNG, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

// Detect local development environment
const isLocalhost = Boolean(
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname === '[::1]'
);

// Core static app shell assets pre-cached upon installation
const PRECACHE_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-16x16.png',
  '/favicon.ico',
  '/images/logo.png',
  '/images/brgy_logo.png',
  '/images/hi_bust.png',
  '/illustrations/sos.png',
  '/illustrations/QR Code-pana.svg',
  '/illustrations/map.svg',
  '/illustrations/storm.svg',
  '/css/google-fonts.css',
  '/css/phosphor.css',
  '/css/Phosphor.woff2',
  '/css/Phosphor.woff',
  '/css/Phosphor.ttf',
  '/css/styles.css',
  '/css/maplibre-gl.css',
  '/css/leaflet.css',
  '/css/images/marker-icon.png',
  '/css/images/marker-icon-2x.png',
  '/css/images/marker-shadow.png',
  '/js/tailwind.min.js',
  '/js/maplibre-gl.js',
  '/js/leaflet.js',
  '/js/dexie.min.js',
  '/js/evacwar-db.js',
  '/js/evakwar-db.js',
  '/js/html5-qrcode.min.js',
  '/js/i18n.js',
  '/js/ui.js',
  '/js/weatherLocation.js',
  '/js/offline-queue.js',
  '/js/maps.js',
  '/js/pwa.js',
  '/js/push-notifications.js',
  '/js/lora-mesh-client.js',
  '/js/offline-data.js',
  '/js/capacitor-resident-bridge.js'
];

// Patterns that must NEVER be cached or intercepted (Network Only / Live APIs)
// Note: Non-GET requests (e.g. POST /api/offline/sync) are already protected by request.method !== 'GET'.
const NETWORK_ONLY_PATTERNS = [
  /\/health/i,
  /\.apk/i,
  /\/download/i,
  /\/get-app/i,
  /\/app-update/i,
  /\/api\//i,
  /\/socket\.io\//i,
  /\/auth\//i,
  /\/login/i,
  /\/register/i,
  /\/logout/i,
  /open-meteo\.com/i,
  /windy\.com/i,
  /youtube\.com/i,
  /youtu\.be/i,
  /pagasa\.dost\.gov\.ph/i,
  /iprogsms/i,
  /maps\.googleapis\.com\/maps\/api\/js/i,
  /ggpht\.com/i,
  /googleusercontent\.com/i
];

/* --------------------------------------------------------------------------
   1. INSTALL: Pre-cache core offline shell & static assets
   -------------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn('[PWA SW] Pre-cache skipped asset:', url, err.message);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

/* --------------------------------------------------------------------------
   2. ACTIVATE: Clean up outdated cache versions, migrate cached pages, and claim clients
   -------------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys();
      const currentCache = await caches.open(CACHE_NAME);

      for (const name of cacheNames) {
        if (name !== CACHE_NAME && name.startsWith('Evacwar-')) {
          try {
            await caches.delete(name);
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('[PWA SW] Activate error:', e);
    }
    await self.clients.claim();
  })());
});

/* --------------------------------------------------------------------------
   3. MESSAGE: Safe update handling without interrupting active users
   -------------------------------------------------------------------------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'LOGOUT') {
    caches.open(CACHE_NAME).then((cache) => {
      cache.keys().then((requests) => {
        requests.forEach((req) => {
          const u = new URL(req.url);
          if (
            u.pathname.startsWith('/admin') ||
            u.pathname.startsWith('/staff') ||
            u.pathname.startsWith('/resident') ||
            u.pathname.includes('settings') ||
            u.pathname.includes('profile')
          ) {
            cache.delete(req);
          }
        });
      });
    }).catch(() => {});
  }
});

/* --------------------------------------------------------------------------
   4. FETCH: Strategy Selection
      - Non-GET: Network Only (Never intercept POST / PUT / DELETE)
      - Auth / Logout / Session: Network Only (Never intercept /logout, /login, /register, /auth/*)
      - Health checks: Network Only (Never cache /health)
      - HTML Navigation: Network First online (cache fresh HTML), Cache fallback offline
      - Sensitive/Live/Emergency non-navigation: Network Only (Never cache SOS, SMS, alerts)
      - Static & UI Library Assets: Network-First when online, Cache-First when offline
   -------------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // STRICT RULE 1: Never intercept non-GET requests (e.g. SOS dispatch, SMS sends, login POSTs)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // STRICT RULE 2: Exclude authentication, session, logout, health, and network-only APIs
  // /logout must ALWAYS hit the Express server directly to destroy session and redirect to /login.
  // Never intercept, cache, or return offline shells for /logout or auth routes.
  const isAuthOrSessionRoute = (
    url.pathname === '/logout' ||
    url.pathname === '/login' ||
    url.pathname === '/register' ||
    url.pathname === '/health' ||
    url.pathname.startsWith('/auth')
  );

  if (isAuthOrSessionRoute) {
    return; // Pass through untouched to Express server!
  }

  const isNetworkOnly = NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(request.url));
  if (isNetworkOnly) {
    return; // Pass through untouched to Express server!
  }

  // STRATEGY A: HTML Page Navigation
  // - Online: Fetch live from server, cache the real HTML page on success.
  // - Offline: Return the real cached HTML of the visited page.
  // - Preserve the EXACT SAME EXISTING PAGES and UI offline. Never redirect to separate offline shells.
  const isNavigation = request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));
  if (isNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      // Helper function: locate cached page matching the requested URL
      const serveOfflinePage = async (req, u) => {
        try {
          // 1. Direct match on pathname, request, or full URL across ALL caches
          let cachedPage = await caches.match(u.pathname, { ignoreSearch: true });
          if (!cachedPage) {
            cachedPage = await caches.match(req, { ignoreSearch: true });
          }
          if (!cachedPage) {
            cachedPage = await caches.match(req.url, { ignoreSearch: true });
          }

          // 2. Strict per-route alias matching (ONLY match aliases of the SAME page, NEVER fallback to dashboard for other pages)
          if (!cachedPage && u.pathname) {
            // Staff route aliases
            if (u.pathname.startsWith('/staff/qr') || u.pathname.startsWith('/staff/scan')) {
              cachedPage = (await caches.match('/staff/qr', { ignoreSearch: true })) ||
                (await caches.match('/staff/scan', { ignoreSearch: true }));
            } else if (u.pathname.startsWith('/staff/map') || u.pathname.startsWith('/staff/evacuation') || u.pathname.startsWith('/staff/rescue') || u.pathname.startsWith('/staff/sos')) {
              cachedPage = (await caches.match('/staff/map', { ignoreSearch: true })) ||
                (await caches.match('/staff/evacuation', { ignoreSearch: true }));
            } else if (u.pathname.startsWith('/staff/reports') || u.pathname.startsWith('/staff/evacuees') || u.pathname.startsWith('/staff/masterlist') || u.pathname.startsWith('/staff/ec-board') || u.pathname.startsWith('/staff/board') || u.pathname.startsWith('/staff/ec')) {
              cachedPage = (await caches.match('/staff/reports', { ignoreSearch: true })) ||
                (await caches.match('/staff/evacuees', { ignoreSearch: true })) ||
                (await caches.match('/staff/masterlist', { ignoreSearch: true }));
            } else if (u.pathname.startsWith('/staff/profile') || u.pathname.startsWith('/staff/settings')) {
              cachedPage = (await caches.match('/staff/profile', { ignoreSearch: true })) ||
                (await caches.match('/staff/settings', { ignoreSearch: true }));
            } else if (u.pathname.startsWith('/staff/typhoon')) {
              cachedPage = await caches.match('/staff/typhoon', { ignoreSearch: true });
            } else if (u.pathname === '/staff' || u.pathname === '/staff/' || u.pathname.startsWith('/staff/dashboard') || u.pathname.startsWith('/staff/site') || u.pathname.startsWith('/staff/evacuation-center')) {
              cachedPage = (await caches.match('/staff/dashboard', { ignoreSearch: true })) ||
                (await caches.match('/staff', { ignoreSearch: true }));
            }
            // Rescuer route aliases
            else if (u.pathname.startsWith('/rescuer/map') || u.pathname.startsWith('/rescuer/radar') || u.pathname.startsWith('/rescuer/rescue')) {
              cachedPage = (await caches.match('/rescuer/map', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/radar', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/rescue', { ignoreSearch: true })) ||
                (await caches.match(u.pathname, { ignoreSearch: true }));
            } else if (u.pathname.startsWith('/rescuer/reports') || u.pathname.startsWith('/rescuer/sos')) {
              cachedPage = (await caches.match('/rescuer/reports', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/sos', { ignoreSearch: true })) ||
                (await caches.match(u.pathname, { ignoreSearch: true }));
            } else if (u.pathname.startsWith('/rescuer/profile') || u.pathname.startsWith('/rescuer/settings')) {
              cachedPage = (await caches.match('/rescuer/profile', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/settings', { ignoreSearch: true })) ||
                (await caches.match(u.pathname, { ignoreSearch: true }));
            } else if (u.pathname.startsWith('/rescuer/typhoon') || u.pathname.startsWith('/rescuer/weather')) {
              cachedPage = (await caches.match('/rescuer/typhoon', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/weather', { ignoreSearch: true })) ||
                (await caches.match(u.pathname, { ignoreSearch: true }));
            } else if (u.pathname === '/rescuer' || u.pathname === '/rescuer/' || u.pathname.startsWith('/rescuer/dashboard')) {
              cachedPage = (await caches.match('/rescuer/dashboard', { ignoreSearch: true })) ||
                (await caches.match('/rescuer', { ignoreSearch: true })) ||
                (await caches.match(u.pathname, { ignoreSearch: true }));
            }
            // Resident route aliases
            else if (u.pathname.startsWith('/resident/qr')) {
              cachedPage = await caches.match('/resident/qr', { ignoreSearch: true });
            } else if (u.pathname.startsWith('/resident/sos')) {
              cachedPage = await caches.match('/resident/sos', { ignoreSearch: true });
            } else if (u.pathname.startsWith('/resident/typhoon')) {
              cachedPage = await caches.match('/resident/typhoon', { ignoreSearch: true });
            } else if (u.pathname.startsWith('/resident/profile') || u.pathname.startsWith('/resident/settings')) {
              cachedPage = (await caches.match('/resident/profile', { ignoreSearch: true })) ||
                (await caches.match('/resident/settings', { ignoreSearch: true }));
            } else if (u.pathname.startsWith('/resident/evacuation')) {
              cachedPage = (await caches.match('/resident/evacuation', { ignoreSearch: true })) ||
                (await caches.match('/resident/evacuation/', { ignoreSearch: true }));
            } else if (u.pathname === '/resident' || u.pathname === '/resident/' || u.pathname.startsWith('/resident/dashboard')) {
              cachedPage = (await caches.match('/resident/dashboard', { ignoreSearch: true })) ||
                (await caches.match('/resident', { ignoreSearch: true }));
            }
            // Admin route aliases
            else if (u.pathname.startsWith('/admin')) {
              cachedPage = (await caches.match(u.pathname, { ignoreSearch: true })) ||
                (await caches.match('/admin', { ignoreSearch: true })) ||
                (await caches.match('/admin/dashboard', { ignoreSearch: true }));
            }
            // Generic shortcut aliases offline (/map, /reports, /profile, /qr)
            else if (u.pathname === '/map') {
              cachedPage = (await caches.match('/staff/map', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/map', { ignoreSearch: true })) ||
                (await caches.match('/resident/evacuation', { ignoreSearch: true }));
            } else if (u.pathname === '/reports') {
              cachedPage = (await caches.match('/staff/reports', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/reports', { ignoreSearch: true }));
            } else if (u.pathname === '/profile' || u.pathname === '/settings') {
              cachedPage = (await caches.match('/staff/profile', { ignoreSearch: true })) ||
                (await caches.match('/resident/profile', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/profile', { ignoreSearch: true }));
            } else if (u.pathname === '/qr' || u.pathname === '/scan') {
              cachedPage = (await caches.match('/staff/qr', { ignoreSearch: true })) ||
                (await caches.match('/resident/qr', { ignoreSearch: true }));
            }
            // Root launch offline - check all active portals
            else if (u.pathname === '/' || u.pathname === '') {
              cachedPage = (await caches.match('/', { ignoreSearch: true })) ||
                (await caches.match('/resident', { ignoreSearch: true })) ||
                (await caches.match('/resident/qr', { ignoreSearch: true })) ||
                (await caches.match('/resident/dashboard', { ignoreSearch: true })) ||
                (await caches.match('/staff', { ignoreSearch: true })) ||
                (await caches.match('/staff/dashboard', { ignoreSearch: true })) ||
                (await caches.match('/staff/qr', { ignoreSearch: true })) ||
                (await caches.match('/rescuer', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/dashboard', { ignoreSearch: true })) ||
                (await caches.match('/rescuer/map', { ignoreSearch: true })) ||
                (await caches.match('/admin', { ignoreSearch: true })) ||
                (await caches.match('/admin/dashboard', { ignoreSearch: true })) ||
                (await caches.match('/admin/reports', { ignoreSearch: true })) ||
                (await caches.match('/offline.html', { ignoreSearch: true }));
            }
          }

          if (cachedPage && cachedPage.ok) {
            return cachedPage;
          }
        } catch (matchErr) {
          console.warn('[PWA SW] Cache match error in serveOfflinePage:', matchErr);
        }

        // 3. Dedicated contextual offline page fallback if this specific page hasn't been cached yet
        let pageLabel = 'Evacwar';
        let actionBtnText = 'View Evacuation QR Code';
        let actionBtnUrl = '/resident/qr';

        if (u.pathname.startsWith('/admin')) {
          pageLabel = 'Admin Portal';
          actionBtnText = 'Go to Admin Dashboard';
          actionBtnUrl = '/admin';
        } else if (u.pathname.startsWith('/staff/map')) {
          pageLabel = 'Staff Map';
          actionBtnText = 'Go to Staff Dashboard';
          actionBtnUrl = '/staff';
        } else if (u.pathname.startsWith('/staff/reports')) {
          pageLabel = 'Reports & Masterlist';
          actionBtnText = 'Go to Staff Dashboard';
          actionBtnUrl = '/staff';
        } else if (u.pathname.startsWith('/staff/profile') || u.pathname.startsWith('/staff/settings')) {
          pageLabel = 'Staff Profile';
          actionBtnText = 'Go to Staff Dashboard';
          actionBtnUrl = '/staff';
        } else if (u.pathname.startsWith('/staff/qr') || u.pathname.startsWith('/staff/scan')) {
          pageLabel = 'QR Scanner';
          actionBtnText = 'Go to Staff Dashboard';
          actionBtnUrl = '/staff';
        } else if (u.pathname.startsWith('/staff')) {
          pageLabel = 'Staff Portal';
          actionBtnText = 'Open QR Scanner';
          actionBtnUrl = '/staff/qr';
        } else if (u.pathname.startsWith('/resident/qr')) {
          pageLabel = 'Evacuation QR';
          actionBtnText = 'Go to Resident Dashboard';
          actionBtnUrl = '/resident';
        } else if (u.pathname.startsWith('/resident/sos')) {
          pageLabel = 'Emergency SOS';
          actionBtnText = 'View Evacuation QR Code';
          actionBtnUrl = '/resident/qr';
        } else if (u.pathname.startsWith('/resident/evacuation') || u.pathname.startsWith('/resident/map')) {
          pageLabel = 'Evacuation Map';
          actionBtnText = 'View Evacuation QR Code';
          actionBtnUrl = '/resident/qr';
        } else if (u.pathname.startsWith('/resident')) {
          pageLabel = 'Resident Portal';
          actionBtnText = 'View Evacuation QR Code';
          actionBtnUrl = '/resident/qr';
        } else if (u.pathname.startsWith('/rescuer/map') || u.pathname.startsWith('/rescuer/radar') || u.pathname.startsWith('/rescuer/rescue')) {
          pageLabel = 'Rescuer Tactical Map';
          actionBtnText = 'Go to Rescuer Dashboard';
          actionBtnUrl = '/rescuer';
        } else if (u.pathname.startsWith('/rescuer/reports') || u.pathname.startsWith('/rescuer/sos')) {
          pageLabel = 'Rescuer Reports';
          actionBtnText = 'Go to Rescuer Dashboard';
          actionBtnUrl = '/rescuer';
        } else if (u.pathname.startsWith('/rescuer/typhoon') || u.pathname.startsWith('/rescuer/weather')) {
          pageLabel = 'Weather Radar';
          actionBtnText = 'Go to Rescuer Dashboard';
          actionBtnUrl = '/rescuer';
        } else if (u.pathname.startsWith('/rescuer/profile') || u.pathname.startsWith('/rescuer/settings')) {
          pageLabel = 'Rescuer Profile';
          actionBtnText = 'Go to Rescuer Dashboard';
          actionBtnUrl = '/rescuer';
        } else if (u.pathname.startsWith('/rescuer')) {
          pageLabel = 'Rescuer Portal';
          actionBtnText = 'Go to Rescuer Dashboard';
          actionBtnUrl = '/rescuer';
        } else if (u.pathname === '/' || u.pathname === '') {
          pageLabel = 'Evacwar';
          actionBtnText = 'Reload App';
          actionBtnUrl = '/';
        }

        return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
  <title>${pageLabel} · Offline - Evacwar</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; text-align: center; }
    .card { max-width: 26rem; width: 100%; padding: 2rem; border-radius: 1.5rem; background: #1e293b; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .icon { width: 3.5rem; height: 3.5rem; margin: 0 auto 1rem; border-radius: 1rem; background: rgba(245,158,11,0.15); color: #fbbf24; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: 900; }
    h1 { font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem; letter-spacing: -0.025em; }
    p { font-size: 0.8125rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1.5rem; }
    .btn-wrap { display: flex; flex-direction: column; gap: 0.625rem; }
    .btn-retry { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 0.75rem 1.25rem; border-radius: 0.75rem; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700; font-size: 0.8125rem; border: none; cursor: pointer; transition: all 0.15s; }
    .btn-retry:hover { background: #1d4ed8; }
    .btn-retry:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-row { display: flex; gap: 0.5rem; }
    .btn-primary { flex: 1; display: inline-flex; align-items: center; justify-content: center; padding: 0.625rem 1rem; border-radius: 0.75rem; background: #3b82f6; color: #fff; text-decoration: none; font-weight: 700; font-size: 0.75rem; border: none; cursor: pointer; transition: background 0.15s; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { flex: 1; display: inline-flex; align-items: center; justify-content: center; padding: 0.625rem 1rem; border-radius: 0.75rem; background: #334155; color: #cbd5e1; text-decoration: none; font-weight: 700; font-size: 0.75rem; border: none; cursor: pointer; transition: background 0.15s; }
    .btn-secondary:hover { background: #475569; }
    .hotlines { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.08); text-align: left; }
    .hotlines-title { font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.5rem; }
    .hotline-btn { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.625rem; padding: 0.5rem 0.75rem; color: #e2e8f0; text-decoration: none; font-size: 0.75rem; font-weight: 600; margin-bottom: 0.375rem; }
    .hotline-btn:hover { background: rgba(255,255,255,0.08); }
    .hotline-btn span.num { color: #38bdf8; font-family: monospace; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">!</div>
    <h1>${pageLabel} Offline</h1>
    <p>
      Slow internet or offline mode detected. Reconnect to download live data, or tap Reconnect below.
    </p>
    <div class="btn-wrap">
      <button id="swRetryBtn" onclick="trySwReconnect()" class="btn-retry">
        <span id="swRetryText">Try Reconnecting</span>
      </button>
      <div class="btn-row">
        <a href="${actionBtnUrl}" class="btn-primary">
          ${actionBtnText}
        </a>
        <button onclick="window.history.length > 1 ? window.history.back() : window.location.href='${actionBtnUrl}'" class="btn-secondary">
          Go Back
        </button>
      </div>
    </div>
    <div class="hotlines">
      <div class="hotlines-title">Emergency Hotlines (Cellular Call)</div>
      <a href="tel:911" class="hotline-btn">
        <span>🚨 National Emergency</span>
        <span class="num">911</span>
      </a>
      <a href="tel:09123456789" class="hotline-btn">
        <span>🏢 Baao MDRRMO Hotline</span>
        <span class="num">Call</span>
      </a>
    </div>
  </div>
  <script>
    let isChecking = false;
    async function trySwReconnect() {
      if (isChecking) return;
      isChecking = true;
      const btn = document.getElementById('swRetryBtn');
      const txt = document.getElementById('swRetryText');
      if (txt) txt.textContent = 'Checking connection...';
      if (btn) btn.disabled = true;
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        if (res && res.ok) {
          if (txt) txt.textContent = 'Connected! Reloading...';
          setTimeout(() => window.location.reload(), 300);
          return;
        }
      } catch (_) {}
      if (txt) txt.textContent = 'Still Offline - Tap to Retry';
      setTimeout(() => { if (btn) btn.disabled = false; isChecking = false; }, 1500);
    }
    window.addEventListener('online', () => window.location.reload());
  </script>
</body>
</html>`, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      };

      // 1. If browser reports completely offline, serve cached page immediately
      if (!self.navigator.onLine) {
        return await serveOfflinePage(request, url);
      }

      // 2. Check if we already have a cached copy of this page
      const cachedResponse = await (async () => {
        try {
          return (await cache.match(url.pathname, { ignoreSearch: true })) ||
                 (await cache.match(request, { ignoreSearch: true })) ||
                 (await cache.match(url.href, { ignoreSearch: true }));
        } catch (_) { return null; }
      })();

      // 3. Fast-Network with Cache-Fallback Strategy:
      // If cached copy exists: race network against 3500ms timeout. If network is slow (>3.5s), return cache immediately!
      // If no cached copy exists: give network up to 20000ms so slow mobile connections don't abort prematurely.
      try {
        const fetchNetwork = async (timeoutMs) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const netRes = await fetch(request, { signal: controller.signal });
            clearTimeout(timeoutId);
            return netRes;
          } catch (err) {
            clearTimeout(timeoutId);
            throw err;
          }
        };

        if (cachedResponse) {
          // Page is cached: Race network fetch (3500ms) with instant cached fallback for slow internet
          const networkPromise = fetchNetwork(20000).then(async (netRes) => {
            // Background update to cache
            if (netRes && netRes.ok) {
              const contentType = (netRes.headers.get('content-type') || '').toLowerCase();
              if (contentType.includes('text/html')) {
                const bodyText = await netRes.clone().text();
                if (!bodyText.includes('DATABASE_UNAVAILABLE') && !bodyText.includes('"error":"DATABASE_UNAVAILABLE"')) {
                  const cleanHeaders = new Headers();
                  cleanHeaders.set('Content-Type', 'text/html; charset=utf-8');
                  const resToCache = new Response(bodyText, { status: 200, statusText: 'OK', headers: cleanHeaders });
                  cache.put(request, resToCache.clone()).catch(() => { });
                  cache.put(url.pathname, resToCache.clone()).catch(() => { });
                  cache.put(url.href, resToCache.clone()).catch(() => { });
                  if (url.pathname.startsWith('/resident') || url.pathname.startsWith('/staff') || url.pathname.startsWith('/rescuer') || url.pathname.startsWith('/admin')) {
                    cache.put('/', resToCache.clone()).catch(() => { });
                  }
                }
              }
            }
            return netRes;
          }).catch(() => null);

          const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('SLOW_TIMEOUT'), 3500));
          const fastest = await Promise.race([networkPromise, timeoutPromise]);

          if (fastest && fastest !== 'SLOW_TIMEOUT') {
            if (fastest.type === 'opaqueredirect' || (fastest.status >= 300 && fastest.status < 400) || fastest.status === 401 || fastest.status === 403) {
              return fastest;
            }
            if (fastest.ok) {
              return fastest;
            }
          }

          // Slow connection (>3.5s) or network error: Serve cached copy immediately!
          return cachedResponse;
        }

        // Page not yet in cache: give network 20000ms to complete
        const networkResponse = await fetchNetwork(20000);

        // Handle HTTP redirects from server (e.g. 302 redirect by Express)
        if (
          networkResponse.type === 'opaqueredirect' ||
          (networkResponse.status >= 300 && networkResponse.status < 400)
        ) {
          return networkResponse;
        }

        // 2. If unauthenticated / unauthorized on protected route, return server response directly
        if (networkResponse.status === 401 || networkResponse.status === 403) {
          return networkResponse;
        }

        if (networkResponse && networkResponse.ok) {
          const contentType = (networkResponse.headers.get('content-type') || '').toLowerCase();

          // Server returned HTML: ensure body does not contain a raw database error
          if (contentType.includes('text/html')) {
            const cloned = networkResponse.clone();
            const bodyText = await cloned.text();

            if (bodyText.includes('DATABASE_UNAVAILABLE') || bodyText.includes('"error":"DATABASE_UNAVAILABLE"')) {
              console.warn('[PWA SW] Server returned DATABASE_UNAVAILABLE in HTML navigation. Serving offline fallback.');
              return await serveOfflinePage(request, url);
            }

            const resToReturn = new Response(bodyText, {
              status: networkResponse.status,
              statusText: networkResponse.statusText,
              headers: networkResponse.headers
            });

            // Cache portal pages with sanitized headers (NO Vary or no-store headers) for 100% reliable offline Cache API matches
            const cleanHeaders = new Headers();
            cleanHeaders.set('Content-Type', 'text/html; charset=utf-8');
            const resToCache = new Response(bodyText, {
              status: 200,
              statusText: 'OK',
              headers: cleanHeaders
            });

            cache.put(request, resToCache.clone()).catch(() => { });
            cache.put(url.pathname, resToCache.clone()).catch(() => { });
            cache.put(url.href, resToCache.clone()).catch(() => { });

            // Store active portal to root / so PWA home-screen offline launch always works
            if (url.pathname.startsWith('/resident') || url.pathname.startsWith('/staff') || url.pathname.startsWith('/rescuer') || url.pathname.startsWith('/admin')) {
              cache.put('/', resToCache.clone()).catch(() => { });
            }

            if (url.pathname.startsWith('/resident/qr')) {
              cache.put('/resident/qr', resToCache.clone()).catch(() => { });
              cache.put('/resident/scan', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/resident/sos')) {
              cache.put('/resident/sos', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/resident/evacuation')) {
              cache.put('/resident/evacuation', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/resident/profile')) {
              cache.put('/resident/profile', resToCache.clone()).catch(() => { });
              cache.put('/resident/settings', resToCache.clone()).catch(() => { });
            }
            if (url.pathname === '/resident' || url.pathname === '/resident/') {
              cache.put('/resident', resToCache.clone()).catch(() => { });
              cache.put('/resident/dashboard', resToCache.clone()).catch(() => { });
            }

            // When ANY resident view is visited online, automatically warm all sibling resident views into cache
            if (url.pathname.startsWith('/resident')) {
              const siblingResidentPages = ['/resident', '/resident/qr', '/resident/evacuation', '/resident/sos', '/resident/profile'];
              siblingResidentPages.forEach(p => {
                if (p !== url.pathname) {
                  fetch(p, { credentials: 'same-origin', headers: { 'Accept': 'text/html' } })
                    .then(async (siblingRes) => {
                      if (siblingRes && siblingRes.ok && (siblingRes.headers.get('content-type') || '').includes('text/html')) {
                        const siblingBody = await siblingRes.text();
                        const siblingHeaders = new Headers();
                        siblingHeaders.set('Content-Type', 'text/html; charset=utf-8');
                        const siblingCacheRes = new Response(siblingBody, { status: 200, statusText: 'OK', headers: siblingHeaders });
                        cache.put(p, siblingCacheRes.clone()).catch(() => { });
                        cache.put(new URL(p, self.location.origin).href, siblingCacheRes.clone()).catch(() => { });
                        if (p === '/resident') cache.put('/resident/dashboard', siblingCacheRes.clone()).catch(() => { });
                        if (p === '/resident/qr') cache.put('/resident/scan', siblingCacheRes.clone()).catch(() => { });
                      }
                    }).catch(() => { });
                }
              });
            }

            // When ANY admin view is visited online, automatically warm all sibling admin views into cache
            if (url.pathname.startsWith('/admin')) {
              const siblingAdminPages = ['/admin', '/admin/evacuation', '/admin/broadcast', '/admin/chat', '/admin/residents', '/admin/staff', '/admin/reports'];
              siblingAdminPages.forEach(p => {
                if (p !== url.pathname) {
                  fetch(p, { credentials: 'same-origin', headers: { 'Accept': 'text/html' } })
                    .then(async (siblingRes) => {
                      if (siblingRes && siblingRes.ok && (siblingRes.headers.get('content-type') || '').includes('text/html')) {
                        const siblingBody = await siblingRes.text();
                        const siblingHeaders = new Headers();
                        siblingHeaders.set('Content-Type', 'text/html; charset=utf-8');
                        const siblingCacheRes = new Response(siblingBody, { status: 200, statusText: 'OK', headers: siblingHeaders });
                        cache.put(p, siblingCacheRes.clone()).catch(() => { });
                        cache.put(new URL(p, self.location.origin).href, siblingCacheRes.clone()).catch(() => { });
                        if (p === '/admin') cache.put('/admin/dashboard', siblingCacheRes.clone()).catch(() => { });
                      }
                    }).catch(() => { });
                }
              });
            }

            if (url.pathname.startsWith('/staff/qr') || url.pathname.startsWith('/staff/scan')) {
              cache.put('/staff/qr', resToCache.clone()).catch(() => { });
              cache.put('/staff/scan', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/staff/map')) {
              cache.put('/staff/map', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/staff/reports')) {
              cache.put('/staff/reports', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/staff/profile')) {
              cache.put('/staff/profile', resToCache.clone()).catch(() => { });
              cache.put('/staff/settings', resToCache.clone()).catch(() => { });
            }

            // When ANY staff view is visited online, automatically warm all sibling staff views into cache
            if (url.pathname.startsWith('/staff')) {
              const siblingStaffPages = ['/staff', '/staff/qr', '/staff/map', '/staff/reports', '/staff/profile'];
              siblingStaffPages.forEach(p => {
                if (p !== url.pathname) {
                  fetch(p, { credentials: 'same-origin', headers: { 'Accept': 'text/html' } })
                    .then(async (siblingRes) => {
                      if (siblingRes && siblingRes.ok && (siblingRes.headers.get('content-type') || '').includes('text/html')) {
                        const siblingBody = await siblingRes.text();
                        const siblingHeaders = new Headers();
                        siblingHeaders.set('Content-Type', 'text/html; charset=utf-8');
                        const siblingCacheRes = new Response(siblingBody, { status: 200, statusText: 'OK', headers: siblingHeaders });
                        cache.put(p, siblingCacheRes.clone()).catch(() => { });
                        cache.put(new URL(p, self.location.origin).href, siblingCacheRes.clone()).catch(() => { });
                        if (p === '/staff/qr') cache.put('/staff/scan', siblingCacheRes.clone()).catch(() => { });
                        if (p === '/staff/profile') cache.put('/staff/settings', siblingCacheRes.clone()).catch(() => { });
                      }
                    }).catch(() => { });
                }
              });
            }

            if (url.pathname.startsWith('/rescuer/map')) {
              cache.put('/rescuer/map', resToCache.clone()).catch(() => { });
              cache.put('/rescuer/radar', resToCache.clone()).catch(() => { });
              cache.put('/rescuer/rescue', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/rescuer/reports') || url.pathname.startsWith('/rescuer/sos')) {
              cache.put('/rescuer/reports', resToCache.clone()).catch(() => { });
              cache.put('/rescuer/sos', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/rescuer/profile') || url.pathname.startsWith('/rescuer/settings')) {
              cache.put('/rescuer/profile', resToCache.clone()).catch(() => { });
              cache.put('/rescuer/settings', resToCache.clone()).catch(() => { });
            }
            if (url.pathname.startsWith('/rescuer/typhoon') || url.pathname.startsWith('/rescuer/weather')) {
              cache.put('/rescuer/typhoon', resToCache.clone()).catch(() => { });
              cache.put('/rescuer/weather', resToCache.clone()).catch(() => { });
            }
            if (url.pathname === '/rescuer' || url.pathname === '/rescuer/' || url.pathname.startsWith('/rescuer/dashboard')) {
              cache.put('/rescuer', resToCache.clone()).catch(() => { });
              cache.put('/rescuer/dashboard', resToCache.clone()).catch(() => { });
            }

            // When ANY rescuer view is visited online, automatically warm all sibling rescuer views into cache
            if (url.pathname.startsWith('/rescuer')) {
              const siblingRescuerPages = ['/rescuer', '/rescuer/map', '/rescuer/reports', '/rescuer/typhoon', '/rescuer/profile'];
              siblingRescuerPages.forEach(p => {
                if (p !== url.pathname) {
                  fetch(p, { credentials: 'same-origin', headers: { 'Accept': 'text/html' } })
                    .then(async (siblingRes) => {
                      if (siblingRes && siblingRes.ok && (siblingRes.headers.get('content-type') || '').includes('text/html')) {
                        const siblingBody = await siblingRes.text();
                        const siblingHeaders = new Headers();
                        siblingHeaders.set('Content-Type', 'text/html; charset=utf-8');
                        const siblingCacheRes = new Response(siblingBody, { status: 200, statusText: 'OK', headers: siblingHeaders });
                        cache.put(p, siblingCacheRes.clone()).catch(() => { });
                        cache.put(new URL(p, self.location.origin).href, siblingCacheRes.clone()).catch(() => { });
                        if (p === '/rescuer') cache.put('/rescuer/dashboard', siblingCacheRes.clone()).catch(() => { });
                        if (p === '/rescuer/map') {
                          cache.put('/rescuer/radar', siblingCacheRes.clone()).catch(() => { });
                          cache.put('/rescuer/rescue', siblingCacheRes.clone()).catch(() => { });
                        }
                        if (p === '/rescuer/reports') cache.put('/rescuer/sos', siblingCacheRes.clone()).catch(() => { });
                        if (p === '/rescuer/typhoon') cache.put('/rescuer/weather', siblingCacheRes.clone()).catch(() => { });
                        if (p === '/rescuer/profile') cache.put('/rescuer/settings', siblingCacheRes.clone()).catch(() => { });
                      }
                    }).catch(() => { });
                }
              });
            }

            return resToReturn;
          }

          // Server returned non-HTML during page navigation (e.g. JSON error object)
          console.warn('[PWA SW] Non-HTML response received during page navigation. Serving offline page fallback.');
          return await serveOfflinePage(request, url);
        }

        // Server returned 500, 502, 503, 504: fall back to cached page
        console.warn('[PWA SW] Server returned error status', networkResponse.status, 'for navigation. Serving cached page.');
        return await serveOfflinePage(request, url);

      } catch (fetchErr) {
        // Network timeout, DNS error, or offline
        return await serveOfflinePage(request, url);
      }
    })());
    return;
  }

  // STRATEGY B: Static Assets & Essential UI CDN Resources (CSS, JS, Fonts, Icons, Images)
  const isLocalStaticAsset = (
    request.url.startsWith(self.location.origin) && (
      url.pathname.startsWith('/css/') ||
      url.pathname.startsWith('/js/') ||
      url.pathname.startsWith('/images/') ||
      url.pathname.startsWith('/illustrations/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.startsWith('/sounds/') ||
      url.pathname.startsWith('/socket.io/') ||
      /\.(?:css|js|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|eot|json)$/i.test(url.pathname)
    )
  );

  // STRATEGY B1: GIS Map Tiles (Google Maps VT, ArcGIS, OpenStreetMap, Carto, AWS Terrarium DEM) - Cache-First for instant tile loads & offline use
  const isDemTile = request.url.includes('elevation-tiles-prod');
  const isMapTile = (
    isDemTile ||
    request.url.includes('mt0.google.com/vt') ||
    request.url.includes('mt1.google.com/vt') ||
    request.url.includes('mt2.google.com/vt') ||
    request.url.includes('mt3.google.com/vt') ||
    request.url.includes('server.arcgisonline.com') ||
    request.url.includes('services.arcgisonline.com') ||
    request.url.includes('tile.openstreetmap.org') ||
    request.url.includes('cartocdn.com') ||
    request.url.includes('tile.openstreetmap.fr')
  );

  if (isMapTile) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: false });
      if (cached) {
        const cl = Number(cached.headers.get('content-length') || 0);
        // Never serve 1x1 empty tiles (68 bytes) or ArcGIS "Map data not yet available" white placeholder tiles (2521 bytes)
        if (cl === 68 || cl === 2521) {
          cache.delete(request).catch(() => {});
        } else {
          return cached;
        }
      }
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const cl = Number(networkResponse.headers.get('content-length') || 0);
          // If ArcGIS returns the 2521-byte "Map data not yet available" white tile, return 404 so MapLibre overzooms crisp z=17 tiles
          if (cl === 2521) {
            return new Response('', { status: 404, statusText: 'Tile Unavailable', headers: { 'Cache-Control': 'no-store' } });
          }
          cache.put(request, networkResponse.clone()).catch(() => { });
        }
        return networkResponse;
      } catch (err) {
        // Offline & uncached at this exact zoom: return 404 so MapLibre retains and overzooms cached parent tiles instead of blanking out
        return new Response('', { status: 404, statusText: 'Offline Tile Unavailable', headers: { 'Cache-Control': 'no-store' } });
      }
    })());
    return;
  }

  const isExternalUiAsset = (
    request.url.includes('cdn.tailwindcss.com') ||
    request.url.includes('unpkg.com/@phosphor-icons') ||
    request.url.includes('fonts.googleapis.com') ||
    request.url.includes('fonts.gstatic.com') ||
    request.url.includes('api.qrserver.com')
  );

  if (isLocalStaticAsset || isExternalUiAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      // If Tailwind CDN is requested, serve the precached local copy directly
      if (request.url.includes('cdn.tailwindcss.com')) {
        const localTailwind = await cache.match('/js/tailwind.min.js');
        if (localTailwind) return localTailwind;
        try {
          const networkLocal = await fetch('/js/tailwind.min.js');
          if (networkLocal && networkLocal.status === 200) {
            cache.put('/js/tailwind.min.js', networkLocal.clone()).catch(() => {});
            return networkLocal;
          }
        } catch (_) {}
      }

      // If Phosphor Icons CDN is requested, serve the precached local copy directly
      if (request.url.includes('unpkg.com/@phosphor-icons')) {
        const localPhosphor = await cache.match('/css/phosphor.css');
        if (localPhosphor) return localPhosphor;
        try {
          const networkLocal = await fetch('/css/phosphor.css');
          if (networkLocal && networkLocal.status === 200) {
            cache.put('/css/phosphor.css', networkLocal.clone()).catch(() => {});
            return networkLocal;
          }
        } catch (_) {}
      }

      // ONLINE: Network-First for CSS/JS/Assets to ensure updates are immediately visible
      if (self.navigator.onLine) {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque' || networkResponse.type === 'basic')) {
            // Guard: never cache HTML error pages under a CSS/JS URL
            const ct = (networkResponse.headers.get('content-type') || '').toLowerCase();
            const isCodeAsset = /\.(?:css|js)$/i.test(url.pathname);
            if (!isCodeAsset || !ct.includes('text/html')) {
              cache.put(request, networkResponse.clone()).catch(() => { });
            }
          }
          return networkResponse;
        } catch (netErr) {
          // Network failed: fall back to cache
          const cached = await cache.match(request, { ignoreSearch: true });
          if (cached) return cached;
          if (isExternalUiAsset) {
            // Gracefully handle external CDN failures or CSP blocks without rejecting the fetch promise,
            // allowing the document's local fallback scripts and styles to take effect cleanly.
            if (request.url.includes('cdn.tailwindcss.com')) {
              const localTailwind = await cache.match('/js/tailwind.min.js');
              if (localTailwind) return localTailwind;
            }
            const isCss = request.destination === 'style' || url.pathname.endsWith('.css');
            const contentType = isCss ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
            return new Response('/* Fallback to Local Asset */', {
              status: 200,
              headers: { 'Content-Type': contentType }
            });
          }
          throw netErr;
        }
      }

      // OFFLINE: Cache-First
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) {
        return cached;
      }

      // If offline and Tailwind or Phosphor CDN is requested without a direct match, serve the local copies
      if (request.url.includes('cdn.tailwindcss.com')) {
        const localTailwind = await cache.match('/js/tailwind.min.js');
        if (localTailwind) return localTailwind;
      }
      if (request.url.includes('unpkg.com/@phosphor-icons')) {
        const localPhosphor = await cache.match('/css/phosphor.css');
        if (localPhosphor) return localPhosphor;
      }

      // Fallback network fetch if somehow accessible
      try {
        return await fetch(request);
      } catch (err) {
        if (isExternalUiAsset) {
          const isCss = request.destination === 'style' || url.pathname.endsWith('.css');
          const contentType = isCss ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
          return new Response('/* Offline Asset Fallback */', {
            status: 200,
            headers: { 'Content-Type': contentType }
          });
        }
        if (url.pathname.endsWith('.ico') || url.pathname.includes('favicon')) {
          const cachedFavicon = await caches.match('/icons/favicon-32x32.png');
          if (cachedFavicon) return cachedFavicon;
          return new Response('', { status: 204, statusText: 'No Content' });
        }
        return new Response('', { status: 408, statusText: 'Offline Asset Unavailable' });
      }
    })());
    return;
  }

  // Default fallback for any other GET requests: Network with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'basic')) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request, { ignoreSearch: true, ignoreVary: true }))
  );
});

/* --------------------------------------------------------------------------
   4b. PENDING ALERT STORE: Hand-off of push alerts to the in-app modal
   Stored in a dedicated Cache Storage entry (survives SW restarts and server
   redirects). Pages read it directly via caches.match() in header.ejs.
   NOTE: Name intentionally does NOT start with 'Evacwar-' so the activate
   cleanup step never deletes it.
   -------------------------------------------------------------------------- */
const PENDING_ALERT_CACHE = 'evacwar-pending-alert';
const PENDING_ALERT_KEY = '/__evacwar-pending-alert';

function savePendingAlert(alert) {
  if (!alert) return Promise.resolve();
  const record = Object.assign({}, alert, { stored_at: Date.now() });
  return caches.open(PENDING_ALERT_CACHE)
    .then((cache) => cache.put(
      PENDING_ALERT_KEY,
      new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' } })
    ))
    .catch((err) => console.warn('[PUSH] Could not store pending alert:', err.message));
}

/* --------------------------------------------------------------------------
   5. WEB PUSH NOTIFICATIONS: Background Alert Receiving & Display
   -------------------------------------------------------------------------- */
self.addEventListener('push', (event) => {
  console.log('[PUSH] Background push event received');

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: '🚨 EMERGENCY ALERT — Evacwar',
        body: event.data.text() || 'Emergency broadcast received. Please open Evacwar.'
      };
    }
  }

  const isWeatherUpdate = data.type === 'WEATHER_UPDATE' || data.noSiren === true;
  const title = data.title || (isWeatherUpdate ? '🌤️ LoRa Weather Sensor Update' : '🚨 EMERGENCY ALERT — Evacwar');
  const severity = (data.severity || 'RED').toUpperCase();
  const alertId = data.alertId || data.id || Date.now();
  const targetUrl = data.url || (isWeatherUpdate ? '/typhoon' : '/');

  console.log('[PUSH] Displaying notification for alert ID:', alertId, 'type:', data.type);

  // Use gentle vibration/quiet behavior for 2-hour weather updates (NO emergency siren/wake-up alarm)
  const emergencyVibration = isWeatherUpdate
    ? [120, 80, 120]
    : [500, 150, 500, 150, 500, 250, 300, 100, 300, 100, 300, 250, 500, 150, 500];

  const options = {
    body: data.body || data.message || 'Emergency broadcast received in your barangay. Please check evacuation guidelines.',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-192x192.png',
    vibrate: emergencyVibration,
    tag: isWeatherUpdate ? `Evacwar-weather-${alertId}` : `Evacwar-alert-${alertId}-${Date.now()}`,
    renotify: !isWeatherUpdate,
    requireInteraction: !isWeatherUpdate,
    silent: Boolean(isWeatherUpdate),
    data: {
      url: targetUrl,
      alertId: alertId,
      severity: severity,
      type: data.type || 'EMERGENCY_ALERT',
      noSiren: isWeatherUpdate,
      alert: isWeatherUpdate ? null : {
        id: alertId,
        title: title,
        message: data.message || data.body || '',
        severity: severity,
        barangay: data.barangay || null,
        sent_at: data.sent_at || data.timestamp || Date.now()
      }
    },
    actions: isWeatherUpdate
      ? [{ action: 'open_weather', title: 'View Weather' }]
      : (String(severity || '').toUpperCase().includes('RED')
        ? [
            { action: 'evacuate_nearest', title: 'Evacuate' },
            { action: 'open_alert', title: 'Open Evacwar' }
          ]
        : [{ action: 'open_alert', title: 'Open Evacwar' }])
  };

  event.waitUntil(Promise.all([
    isWeatherUpdate ? Promise.resolve() : savePendingAlert(options.data.alert),
    self.registration.showNotification(title, options).catch((err) => {
      console.warn('[PUSH] Fallback notification triggered:', err.message);
      return self.registration.showNotification(title, {
        body: options.body,
        icon: options.icon,
        badge: options.badge,
        tag: `Evacwar-alert-${alertId}`,
        data: options.data
      });
    })
  ]));
});

/* --------------------------------------------------------------------------
   6. NOTIFICATION CLICK: Focus Existing App Window or Open New Window
   -------------------------------------------------------------------------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawTargetPath = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';
  const notifType = (event.notification.data && event.notification.data.type) || '';
  const isWeatherNotif = notifType === 'WEATHER_UPDATE' || rawTargetPath.includes('/typhoon');
  const isEvacuateAction = event.action === 'evacuate_nearest';

  const defaultUrl = self.location.origin;
  const fullUrl = new URL(isEvacuateAction ? '/resident/evacuation?auto_route=nearest' : rawTargetPath, defaultUrl).href;
  const alertPayload = event.notification.data && event.notification.data.alert
    ? event.notification.data.alert
    : null;

  event.waitUntil(
    // Persist emergency alerts only (never store siren alerts for weather updates)
    (isWeatherNotif ? Promise.resolve() : savePendingAlert(alertPayload))
      .then(() => clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(async (windowClients) => {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url && (client.url.startsWith(defaultUrl) || client.url.includes('evacwar-testing.onrender.com'))) {
            if (isEvacuateAction) {
              const evacUrl = new URL('/resident/evacuation?auto_route=nearest', defaultUrl).href;
              if (typeof client.navigate === 'function') {
                try { await client.navigate(evacUrl); } catch (_) {}
              } else {
                client.postMessage({ type: 'NAVIGATE_TO', url: '/resident/evacuation?auto_route=nearest' });
              }
            } else if (isWeatherNotif) {
              let roleDest = '/resident/typhoon?view=sensor';
              try {
                const u = new URL(client.url);
                if (u.pathname.startsWith('/admin')) roleDest = '/admin/typhoon?view=sensor';
                else if (u.pathname.startsWith('/staff')) roleDest = '/staff/typhoon?view=sensor';
                else if (u.pathname.startsWith('/rescuer')) roleDest = '/rescuer/typhoon?view=sensor';
              } catch (_) {}
              const roleFullUrl = new URL(roleDest, defaultUrl).href;
              if (typeof client.navigate === 'function') {
                try { await client.navigate(roleFullUrl); } catch (_) {}
              } else {
                client.postMessage({ type: 'NAVIGATE_TO', url: roleDest });
              }
            } else if (alertPayload) {
              client.postMessage({ type: 'SHOW_EMERGENCY_ALERT', alert: alertPayload });
            }
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(isWeatherNotif ? new URL('/resident/typhoon?view=sensor', defaultUrl).href : fullUrl);
        }
      })
  );
});


