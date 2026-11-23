/**
 * Evacwar Progressive Web App (PWA) Client Management Script
 * - Service Worker Registration & Safe Updates
 * - Standalone Installation Prompt & Dismissal Management
 * - Global Non-blocking Online/Offline Network Status Indicator
 * - Respects emergency safety guidelines (no false offline claims)
 */

(function () {
  'use strict';

  const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]'
  );

  let deferredInstallPrompt = null;
  let isCurrentlyOffline = !navigator.onLine;

  /* --------------------------------------------------------------------------
     1. SERVICE WORKER REGISTRATION & UPDATE MANAGEMENT
     -------------------------------------------------------------------------- */
  
  function isResidentNativeOrPortal() {
    return Boolean(
      (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
      typeof window.AndroidBleBridge !== 'undefined' ||
      typeof window.AndroidSettingsBridge !== 'undefined' ||
      typeof window.AndroidUsbSerialBridge !== 'undefined' ||
      /; wv\)/i.test(navigator.userAgent || '')
    );
  }

  function registerServiceWorker() {
    if (isResidentNativeOrPortal()) {
      const hadController = Boolean('serviceWorker' in navigator && navigator.serviceWorker.controller);
      const tasks = [];
      if ('serviceWorker' in navigator) {
        tasks.push(
          navigator.serviceWorker.getRegistrations()
            .then(regs => Promise.all(regs.map(r => r.unregister())))
            .catch(() => {})
        );
      }
      if ('caches' in window && typeof caches.keys === 'function') {
        tasks.push(
          caches.keys()
            .then(keys => Promise.all(keys.map(k => caches.delete(k))))
            .catch(() => {})
        );
      }
      if (hadController && !sessionStorage.getItem('evw_native_sw_purged')) {
        sessionStorage.setItem('evw_native_sw_purged', '1');
        Promise.all(tasks).finally(() => {
          try { window.location.reload(); } catch (_) {}
        });
      }
      return;
    }
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        console.log('ServiceWorker registration successful.');
        try { registration.update(); } catch (_) {}

        // When online, pre-cache critical portal views (QR, map, dashboard, reports, profile) for seamless offline access
        const precachePortalViews = async () => {
          if (!navigator.onLine) return;

          const currentPath = window.location.pathname;
          const role = (window.userRole || '').toLowerCase();
          const staffType = String(window.userStaffType || '').toUpperCase();
          const isRescuer = staffType === 'RESCUER' || currentPath.startsWith('/rescuer') || role === 'rescuer';
          let targetPages = [];

          if (isRescuer) {
            targetPages = [
              '/rescuer',
              '/rescuer/map',
              '/rescuer/reports',
              '/rescuer/typhoon',
              '/rescuer/profile'
            ];
          } else if (currentPath.startsWith('/staff') || role === 'staff' || role === 'barangay_council') {
            targetPages = [
              '/staff',
              '/staff/qr',
              '/staff/map',
              '/staff/reports',
              '/staff/profile'
            ];
          } else if (currentPath.startsWith('/resident') || role === 'resident') {
            targetPages = [
              '/resident',
              '/resident/qr',
              '/resident/evacuation',
              '/resident/sos',
              '/resident/typhoon',
              '/resident/profile'
            ];
          } else if (currentPath.startsWith('/admin') || role === 'admin') {
            targetPages = [
              '/admin',
              '/admin/evacuation',
              '/admin/residents',
              '/admin/staff',
              '/admin/typhoon',
              '/admin/broadcast',
              '/admin/chat',
              '/admin/reports',
              '/admin/settings'
            ];
          }

          if (targetPages.length === 0) return;

          try {
            const keys = await caches.keys();
            const activeKey = keys.filter(k => k.startsWith('Evacwar-static')).sort((a, b) => {
              const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
              const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
              return numA - numB;
            }).pop() || 'Evacwar-static-v103';
            const cache = await caches.open(activeKey);

            // Cache current page immediately from live DOM/fetch first so current page is always ready offline
            const orderedPages = [currentPath, ...targetPages.filter(p => p !== currentPath)];
            for (const pageUrl of orderedPages) {
              try {
                const res = await fetch(pageUrl, { credentials: 'same-origin', headers: { 'Accept': 'text/html' } });
                if (res && res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
                  const bodyText = await res.text();
                  const cleanHeaders = new Headers();
                  cleanHeaders.set('Content-Type', 'text/html; charset=utf-8');
                  const resToStore = new Response(bodyText, {
                    status: 200,
                    statusText: 'OK',
                    headers: cleanHeaders
                  });
                  await cache.put(pageUrl, resToStore.clone());
                  await cache.put(new URL(pageUrl, window.location.origin).href, resToStore.clone());
                  // Also cache the primary user portal page to root / for seamless offline PWA launching
                  if (pageUrl === targetPages[0]) {
                    await cache.put('/', resToStore.clone());
                    await cache.put(new URL('/', window.location.origin).href, resToStore.clone());
                  }
                  if (pageUrl === '/resident') {
                    await cache.put('/resident/dashboard', resToStore.clone());
                  }
                  if (pageUrl === '/resident/qr') {
                    await cache.put('/resident/scan', resToStore.clone());
                  }
                  if (pageUrl === '/admin') {
                    await cache.put('/admin/dashboard', resToStore.clone());
                  }
                  if (pageUrl === '/staff') {
                    await cache.put('/staff/dashboard', resToStore.clone());
                  }
                  if (pageUrl === '/staff/qr') {
                    await cache.put('/staff/scan', resToStore.clone());
                  }
                  if (pageUrl === '/staff/profile') {
                    await cache.put('/staff/settings', resToStore.clone());
                  }
                  if (pageUrl === '/rescuer') {
                    await cache.put('/rescuer/dashboard', resToStore.clone());
                  }
                  if (pageUrl === '/rescuer/map') {
                    await cache.put('/rescuer/radar', resToStore.clone());
                    await cache.put('/rescuer/rescue', resToStore.clone());
                  }
                  if (pageUrl === '/rescuer/reports') {
                    await cache.put('/rescuer/sos', resToStore.clone());
                  }
                  if (pageUrl === '/rescuer/typhoon') {
                    await cache.put('/rescuer/weather', resToStore.clone());
                  }
                  if (pageUrl === '/rescuer/profile') {
                    await cache.put('/rescuer/settings', resToStore.clone());
                  }
                }
              } catch (_) {}
            }

            // If evacuation intake staff portal (excluding rescuers and residents), download resident directory into IndexedDB for offline scanning
            const staffType = String(window.userStaffType || '').toUpperCase();
            const isRescuer = staffType === 'RESCUER' || currentPath.startsWith('/rescuer');
            const isResident = role === 'resident' || currentPath.startsWith('/resident');
            if (!isRescuer && !isResident && (currentPath.startsWith('/staff') || (role === 'staff' && staffType !== 'RESCUER')) && window.EvakWarDB && typeof window.EvakWarDB.downloadOfflineRoster === 'function') {
              window.EvakWarDB.downloadOfflineRoster().catch(() => {});
            }
          } catch (e) { }
        };

        // Precache promptly upon registration and on network reconnection
        setTimeout(precachePortalViews, 300);
        window.addEventListener('online', precachePortalViews);

        // Check for waiting service worker
        if (registration.waiting) {
          handleServiceWorkerUpdate(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              handleServiceWorkerUpdate(installingWorker);
            }
          });
        });
      })
      .catch((err) => {
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          console.warn('[Evacwar PWA] Service Worker registration failed:', err);
        }
      });

    // Reload upon controllerchange ONLY if device is not in the middle of an emergency action and online
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      if (!navigator.onLine) return; // Prevent disrupting offline navigation or causing blank/reload loops

      // Safety check: Do NOT auto-refresh if SOS is active, or pending form submission
      const isSosActive = document.getElementById('sosBtnPing') && !document.getElementById('sosBtnPing').classList.contains('hidden');
      const isSubmittingForm = document.querySelector('form[data-submitting="true"]');
      if (isSosActive || isSubmittingForm) {
        console.log('[Evacwar PWA] Update waiting; auto-refresh postponed during active emergency/submission.');
        return;
      }

      refreshing = true;
      window.location.reload();
    });
  }

  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker);
  }

  function handleServiceWorkerUpdate(worker) {
    // Notify worker to activate when safe
    const isSosPage = window.location.pathname.includes('/sos');
    const isBroadcastPage = window.location.pathname.includes('/broadcast');

    // If not in a critical active emergency view, safely notify worker to skip waiting
    if (!isSosPage && !isBroadcastPage) {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  /* --------------------------------------------------------------------------
     2. PWA INSTALL EXPERIENCE (BANNER / PROMPT)
     -------------------------------------------------------------------------- */
  const DISMISS_STORAGE_KEY = 'Evacwar_pwa_dismissed';
  const DISMISS_DURATION_DAYS = 7;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  function isDismissedRecently() {
    try {
      const dismissedAt = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (!dismissedAt) return false;
      const daysPassed = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      return daysPassed < DISMISS_DURATION_DAYS;
    } catch (e) {
      return false;
    }
  }

  function markDismissed() {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
    } catch (e) { }
  }

  function syncAllInstallUI() {
    const standalone = isStandalone();
    const hasDeferred = Boolean(deferredInstallPrompt);

    // Update all install status badges
    document.querySelectorAll('[data-pwa-install-badge]').forEach((badge) => {
      if (standalone) {
        badge.innerHTML = `<i class="ph ph-check-circle text-emerald-600"></i> <span data-i18n="status_installed">Installed</span>`;
        badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
      } else if (hasDeferred) {
        badge.innerHTML = `<i class="ph ph-download-simple text-blue-600"></i> <span data-i18n="status_ready">Ready</span>`;
        badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60';
      } else {
        badge.innerHTML = `<i class="ph ph-device-mobile text-slate-500"></i> <span>Available</span>`;
        badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 profile-sub-bg profile-text-dark';
      }
    });

    // Update all install action buttons
    document.querySelectorAll('[data-pwa-install-btn]').forEach((btn) => {
      if (standalone) {
        btn.innerHTML = `<i class="ph ph-check-circle text-emerald-600"></i> <span data-i18n="status_installed">Installed</span>`;
        btn.setAttribute('disabled', 'true');
        btn.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 cursor-default shrink-0';
      } else {
        btn.removeAttribute('disabled');
        btn.innerHTML = `<i class="ph ph-download-simple"></i> <span data-i18n="btn_install">Install</span>`;
        const isRed = btn.classList.contains('bg-rose-600') || btn.classList.contains('bg-rose-700') || window.location.pathname.startsWith('/rescuer');
        btn.className = isRed
          ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors shrink-0'
          : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors shrink-0';
      }
    });

    // Update modal direct install button if present
    const modalDirectBtn = document.getElementById('pwa-modal-direct-install-btn');
    const modalInstalledNotice = document.getElementById('pwa-modal-installed-notice');
    if (modalDirectBtn && modalInstalledNotice) {
      if (standalone) {
        modalDirectBtn.classList.add('hidden');
        modalInstalledNotice.classList.remove('hidden');
      } else if (hasDeferred) {
        modalDirectBtn.classList.remove('hidden');
        modalInstalledNotice.classList.add('hidden');
      } else {
        modalDirectBtn.classList.add('hidden');
        modalInstalledNotice.classList.add('hidden');
      }
    }
  }

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'desktop';
  }

  function setInstallModalTab(platform) {
    const tabs = ['ios', 'android', 'desktop'];
    tabs.forEach((p) => {
      const tabBtn = document.getElementById(`pwa-tab-btn-${p}`);
      const tabContent = document.getElementById(`pwa-tab-content-${p}`);
      if (tabBtn) {
        if (p === platform) {
          tabBtn.className = 'flex-1 py-2 px-3 rounded-xl font-bold text-xs bg-blue-600 text-white shadow-sm transition-all';
        } else {
          tabBtn.className = 'flex-1 py-2 px-3 rounded-xl font-semibold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all';
        }
      }
      if (tabContent) {
        if (p === platform) {
          tabContent.classList.remove('hidden');
        } else {
          tabContent.classList.add('hidden');
        }
      }
    });
  }

  function triggerApkDownload() {
    const link = document.createElement('a');
    link.href = '/evakwar-resident-v2.apk';
    link.setAttribute('download', 'evakwar-resident-v2.apk');
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function openInstallModal() {
    triggerApkDownload();
  }

  function closeInstallModal() {
    const modal = document.getElementById('modalInstallApp');
    if (modal) {
      modal.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }
  }

  async function triggerInstall() {
    triggerApkDownload();
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    return;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallBanner();
    syncAllInstallUI();
    console.log('[Evacwar PWA] Successfully installed application.');
  });

  function showInstallBanner() {
    return;
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'fixed bottom-20 lg:bottom-6 left-4 right-4 max-w-md mx-auto z-40 bg-slate-900/95 dark:bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl transition-all duration-300 transform translate-y-8 opacity-0';

    banner.innerHTML = `
      <div class="flex items-start gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/30 p-1.5 shrink-0 flex items-center justify-center overflow-hidden">
          <img src="/icons/icon-192x192.png" alt="Evacwar Logo" class="w-full h-full object-contain" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <h4 class="font-extrabold text-sm text-white tracking-tight">Install Evacwar</h4>
            <span class="text-[10px] font-bold text-blue-400 bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 rounded-full uppercase tracking-wider">Fast Access</span>
          </div>
          <p class="text-xs text-slate-300 mt-1 leading-snug">
            Install Evacwar for a faster app-like experience and quick emergency access.
          </p>
          <div class="flex items-center gap-2.5 mt-3">
            <button id="pwa-install-btn" type="button" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer">
              Install
            </button>
            <button id="pwa-dismiss-btn" type="button" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all cursor-pointer">
              Not now
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Animate in smoothly
    requestAnimationFrame(() => {
      banner.classList.remove('translate-y-8', 'opacity-0');
    });

    const installBtn = banner.querySelector('#pwa-install-btn');
    const dismissBtn = banner.querySelector('#pwa-dismiss-btn');

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        hideInstallBanner();
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          console.log('[Evacwar PWA] User accepted installation prompt.');
        } else {
          markDismissed();
        }
        deferredInstallPrompt = null;
        syncAllInstallUI();
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        markDismissed();
        hideInstallBanner();
      });
    }
  }

  function hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    banner.classList.add('translate-y-8', 'opacity-0');
    setTimeout(() => {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 300);
  }

  // Expose global PWA controller for application views (settings, emergency banners, etc.)
  window.EvakWarPWA = {
    triggerInstall: triggerInstall,
    openInstallModal: openInstallModal,
    closeInstallModal: closeInstallModal,
    setInstallModalTab: setInstallModalTab,
    isStandalone: isStandalone,
    hasPrompt: () => Boolean(deferredInstallPrompt),
    syncUI: syncAllInstallUI,
    detectPlatform: detectPlatform
  };
  window.triggerPWAInstall = triggerInstall;
  window.openPWAInstallModal = openInstallModal;
  window.closePWAInstallModal = closeInstallModal;
  window.setPWAInstallTab = setInstallModalTab;

  /* --------------------------------------------------------------------------
     3. GLOBAL NETWORK STATUS INDICATOR & AUTOMATIC RECONNECT
     -------------------------------------------------------------------------- */
  function ensureNetworkIndicator() {
    let indicator = document.getElementById('pwa-network-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'pwa-network-indicator';
      indicator.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 transform -translate-y-12 opacity-0 max-w-[92vw]';
      indicator.innerHTML = `
        <div id="pwa-network-content" class="px-3.5 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 backdrop-blur-md border pointer-events-auto select-none">
          <span id="pwa-network-dot" class="w-2 h-2 rounded-full shrink-0"></span>
          <span id="pwa-network-text" class="truncate"></span>
        </div>
      `;
      document.body.appendChild(indicator);
    }
    return indicator;
  }

  let onlineTimer = null;

  function updateNetworkStatus(online) {
    if (document.getElementById('btnHeaderLoraBle')) {
      if (!online) {
        window.dispatchEvent(new CustomEvent('Evacwar:offline-detected'));
      } else {
        window.dispatchEvent(new CustomEvent('Evacwar:online-restored'));
      }
      return;
    }
    const indicator = ensureNetworkIndicator();
    const content = indicator.querySelector('#pwa-network-content');
    const dot = indicator.querySelector('#pwa-network-dot');
    const text = indicator.querySelector('#pwa-network-text');
    if (!content || !dot || !text) return;

    clearTimeout(onlineTimer);

    if (!online) {
      // Non-blocking compact OFFLINE pill
      isCurrentlyOffline = true;
      content.className = 'px-3 py-1 rounded-full text-xs font-bold shadow-md flex items-center gap-1.5 backdrop-blur-md border pointer-events-auto select-none bg-slate-900/90 border-amber-500/50 text-amber-200 shadow-slate-950/20';
      dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0';
      text.textContent = 'Offline';

      indicator.classList.remove('-translate-y-12', 'opacity-0');
      indicator.classList.add('translate-y-0', 'opacity-100');

      window.dispatchEvent(new CustomEvent('Evacwar:offline-detected'));
    } else {
      // Reconnected: show brief BACK ONLINE confirmation
      if (isCurrentlyOffline) {
        isCurrentlyOffline = false;
        content.className = 'px-3 py-1 rounded-full text-xs font-bold shadow-md flex items-center gap-1.5 backdrop-blur-md border pointer-events-auto select-none bg-slate-900/90 border-emerald-500/50 text-emerald-200 shadow-slate-950/20';
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shrink-0';
        text.textContent = 'Online';

        indicator.classList.remove('-translate-y-12', 'opacity-0');
        indicator.classList.add('translate-y-0', 'opacity-100');

        onlineTimer = setTimeout(() => {
          indicator.classList.remove('translate-y-0', 'opacity-100');
          indicator.classList.add('-translate-y-12', 'opacity-0');
        }, 3000);

        window.dispatchEvent(new CustomEvent('Evacwar:online-restored'));
      } else {
        indicator.classList.remove('translate-y-0', 'opacity-100');
        indicator.classList.add('-translate-y-12', 'opacity-0');
      }
    }
  }

  async function checkServerReachable() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('/health', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Accept': 'text/plain, application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  // Handle network transition to offline
  function handleNetworkOffline() {
    updateNetworkStatus(false);
  }

  // Handle network transition to online with automatic recovery
  async function handleNetworkOnline() {
    const reachable = await checkServerReachable();
    if (reachable) {
      // 1. Update global status indicator
      updateNetworkStatus(true);

      // 2. Reconnect Socket.IO if available and disconnected
      if (window.__appSocket && typeof window.__appSocket.connect === 'function' && !window.__appSocket.connected) {
        window.__appSocket.connect();
      }

      // 3. Trigger IndexedDB offline queue synchronization
      if (window.EvakWarDB && typeof window.EvakWarDB.syncPending === 'function') {
        window.EvakWarDB.syncPending();
      }
    } else {
      // Browser reports online (e.g. connected to Wi-Fi portal without internet), remain offline
      updateNetworkStatus(false);
    }
  }

  window.addEventListener('offline', handleNetworkOffline);
  window.addEventListener('online', handleNetworkOnline);

  // Global listener for offline sync completion
  window.addEventListener('Evacwar:sync-completed', (e) => {
    const { syncedCount } = e.detail || {};
    if (syncedCount > 0) {
      if (!window.location.pathname.includes('/staff/qr')) {
        showOfflineNotice(`✓ Connection restored! Offline data received & synced (${syncedCount} record${syncedCount > 1 ? 's' : ''} uploaded to database).`, 'success');
      }
    }
  });

  // Initialize network status on load if currently offline
  if (!navigator.onLine) {
    document.addEventListener('DOMContentLoaded', () => {
      updateNetworkStatus(false);
    });
  }

  /* --------------------------------------------------------------------------
     4. GLOBAL OFFLINE ACTION NOTICES & FORMS GUARD
     -------------------------------------------------------------------------- */
  function showOfflineNotice(message = "Offline Mode: Operating via LoRa Mesh and Local Network.", type = 'info') {
    let toast = document.getElementById('Evacwar-offline-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'Evacwar-offline-toast';
      toast.className = 'fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 transform translate-y-8 opacity-0 pointer-events-none max-w-sm w-full px-3';
      document.body.appendChild(toast);
    }
    const isSuccess = type === 'success';
    const bgClass = isSuccess
      ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100 shadow-emerald-950/40'
      : 'bg-slate-900/95 border-amber-500/60 text-amber-100 shadow-slate-950/40';
    const dotClass = isSuccess ? 'bg-emerald-400' : 'bg-amber-400';
    toast.innerHTML = `
      <div class="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-xl border backdrop-blur-md text-xs font-bold pointer-events-auto ${bgClass}">
        <span class="w-2 h-2 rounded-full ${dotClass} shrink-0"></span>
        <span class="flex-1">${message}</span>
      </div>
    `;
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-8', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });
    clearTimeout(window.__offlineToastTimer);
    window.__offlineToastTimer = setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-8', 'opacity-0');
    }, 3500);
  }
  window.showOfflineNotice = showOfflineNotice;

  /* --------------------------------------------------------------------------
     4. OFFLINE EMERGENCY OPERATION - NEVER BLOCK LOCAL / LORA ACTIONS
     -------------------------------------------------------------------------- */
  // In EvakWar emergency offline-first architecture, form submissions and actions
  // must NEVER be blocked by a generic "requires internet" interceptor.
  // All actions flow through local network (Wi-Fi), 433 MHz LoRa mesh, or offline IndexedDB sync.
  document.addEventListener('submit', (e) => {
    // Transparently permit all emergency, chat, and application forms offline
  }, true);

  /* --------------------------------------------------------------------------
     5. STANDALONE APP DISPLAY MODE ADAPTATION & RECOVERY TRACKING
     -------------------------------------------------------------------------- */
  function initPWAState() {
    if (isStandalone()) {
      document.documentElement.classList.add('Evacwar-standalone-pwa');
    }
    syncAllInstallUI();

    // Record last active application page for seamless recovery
    try {
      sessionStorage.setItem('Evacwar_last_page', window.location.pathname + window.location.search);
    } catch (e) { }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWAState);
  } else {
    initPWAState();
  }

  /* --------------------------------------------------------------------------
     6. PURGE PORTAL CACHES ON LOGOUT (PREVENTS CROSS-ROLE REUSE)
     -------------------------------------------------------------------------- */
  document.addEventListener('click', (e) => {
    const target = e.target && e.target.closest && e.target.closest('a[href="/logout"], a[href*="/logout"]');
    if (target) {
      try {
        localStorage.removeItem('Evacwar_last_portal');
        sessionStorage.removeItem('Evacwar_last_page');
      } catch (err) { }

      if ('caches' in window) {
        caches.keys().then((keys) => {
          const activeKey = keys.find(k => k.startsWith('Evacwar-static'));
          if (activeKey) {
            caches.open(activeKey).then((cache) => {
              const portalPages = [
                '/',
                '/admin', '/admin/dashboard', '/admin/residents', '/admin/staff', '/admin/evacuation', '/admin/users', '/admin/reports', '/admin/settings', '/admin/broadcast',
                '/staff', '/staff/dashboard', '/staff/qr', '/staff/map', '/staff/reports', '/staff/profile', '/staff/settings',
                '/resident', '/resident/dashboard', '/resident/qr', '/resident/evacuation', '/resident/sos', '/resident/typhoon', '/resident/profile', '/resident/settings'
              ];
              portalPages.forEach(p => cache.delete(p).catch(() => { }));
            }).catch(() => { });
          }
        }).catch(() => { });
      }
    }
  }, true);

})();
