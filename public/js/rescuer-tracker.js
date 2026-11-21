/**
 * Real-Time Rescuer Geolocation Tracker (Multi-SOS / En-Route Rescue Support)
 * Captures the responding rescuer's live GPS coordinates and streams them to all
 * assigned SOS alerts along their path simultaneously.
 */
(function () {
  if (window.EvakWarRescuerTracker) return;

  const STORAGE_KEY = 'evakwar_active_rescuer_sos_ids';
  let watchId = null;
  const activeSosIds = new Set();
  let lastSentTime = 0;
  let lastCoords = null;
  const THROTTLE_MS = 3000;

  function getActiveSocket() {
    if (window.__appSocket) return window.__appSocket;
    if (window.__staffSocket) return window.__staffSocket;
    if (typeof io !== 'undefined') {
      window.__appSocket = io();
      return window.__appSocket;
    }
    return null;
  }

  function persistActiveIds() {
    try {
      const arr = Array.from(activeSosIds);
      if (arr.length > 0) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (_e) {}
  }

  function showTrackerToast(message, type = 'info') {
    if (window.showSosToast && typeof window.showSosToast === 'function') {
      window.showSosToast(message, type);
      return;
    }
    if (window.EvakwarWeatherLocation && typeof window.EvakwarWeatherLocation.showToast === 'function') {
      window.EvakwarWeatherLocation.showToast(message);
      return;
    }

    let toast = document.getElementById('rescuerTrackerToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rescuerTrackerToast';
      document.body.appendChild(toast);
    }
    const bgClass = type === 'error' ? 'bg-red-600/95 text-white border-red-500/80' :
                    type === 'success' ? 'bg-emerald-600/95 text-white border-emerald-500/80' :
                    'bg-slate-900/95 text-white border-slate-700/80';
    toast.className = `fixed bottom-4 right-3 sm:right-4 z-[9999] px-2.5 py-1.5 rounded-xl shadow-lg border font-semibold text-xs inline-flex items-center gap-2 transition-all duration-200 pointer-events-auto max-w-[280px] sm:max-w-xs backdrop-blur-md leading-snug ${bgClass}`;
    toast.innerHTML = `<i class="ph ph-navigation-arrow text-sm shrink-0"></i><span class="truncate">${message}</span><button type="button" onclick="this.parentElement.style.display='none'" class="text-white/70 hover:text-white p-0.5 ml-1 shrink-0 rounded transition-opacity" title="Dismiss"><i class="ph ph-x text-xs"></i></button>`;
    toast.style.display = 'inline-flex';
    toast.style.opacity = '1';

    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { toast.style.display = 'none'; }, 250);
    }, 3200);
  }

  function updateTrackingIndicator() {
    let indicator = document.getElementById('rescuerTrackingIndicator');
    if (activeSosIds.size === 0) {
      if (indicator) indicator.remove();
      return;
    }

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'rescuerTrackingIndicator';
      indicator.className = 'fixed top-16 right-4 z-40 bg-indigo-600/95 backdrop-blur-md text-white px-3 py-1.5 rounded-full shadow-lg border border-indigo-400/40 flex items-center gap-2 text-xs font-black tracking-wide animate-pulse pointer-events-auto';
      document.body.appendChild(indicator);
    }

    const idsList = Array.from(activeSosIds).map(id => `#${id}`).join(', ');
    indicator.innerHTML = `
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
      </span>
      <span>Multi-Rescue GPS Active (${activeSosIds.size} SOS: ${idsList})</span>
    `;
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function onPositionUpdate(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const acc = pos.coords.accuracy || 0;
    window._lastKnownUserGps = { lat, lng, isFallback: false };

    if (activeSosIds.size === 0) return;
    const now = Date.now();

    if (lastCoords && (now - lastSentTime < THROTTLE_MS)) {
      const dist = calculateDistance(lastCoords.lat, lastCoords.lng, lat, lng);
      if (dist < 8) return;
    }

    lastSentTime = now;
    lastCoords = { lat, lng };

    const socket = getActiveSocket();
    if (socket && socket.connected) {
      activeSosIds.forEach((sosId) => {
        socket.emit('rescuer:location', {
          sos_id: Number(sosId),
          latitude: lat,
          longitude: lng,
          accuracy: acc
        });
      });
    }
  }

  function onPositionError(err) {
    console.warn('[Rescuer Tracker] Geolocation error:', err);
  }

  const RescuerTracker = {
    /**
     * Add an SOS ID to the active multi-rescue tracking queue without dropping existing SOS alerts.
     */
    startTracking: function (sosId) {
      if (!sosId) return;
      const numericId = Number(sosId);
      if (!isFinite(numericId) || numericId <= 0) return;

      activeSosIds.add(numericId);
      persistActiveIds();
      updateTrackingIndicator();

      if (!navigator.geolocation) return;

      if (watchId === null) {
        navigator.geolocation.getCurrentPosition(onPositionUpdate, onPositionError, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
        watchId = navigator.geolocation.watchPosition(onPositionUpdate, onPositionError, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000
        });
      } else if (lastCoords) {
        const socket = getActiveSocket();
        if (socket && socket.connected) {
          socket.emit('rescuer:location', {
            sos_id: numericId,
            latitude: lastCoords.lat,
            longitude: lastCoords.lng,
            accuracy: 10
          });
        }
      }
      showTrackerToast(`Added SOS #${numericId} to Active Multi-Rescue Queue (${activeSosIds.size} active)`, 'success');
    },

    /**
     * Remove a specific SOS ID from tracking (or clear all if no numeric sosId passed).
     */
    stopTracking: function (sosIdOrNotify = true) {
      if (typeof sosIdOrNotify === 'number' || (typeof sosIdOrNotify === 'string' && !isNaN(Number(sosIdOrNotify)))) {
        const targetId = Number(sosIdOrNotify);
        activeSosIds.delete(targetId);
        persistActiveIds();
        updateTrackingIndicator();
        if (activeSosIds.size > 0) return;
      } else {
        activeSosIds.clear();
        persistActiveIds();
        updateTrackingIndicator();
      }

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      lastCoords = null;
      lastSentTime = 0;
    },

    isTracking: function () {
      return watchId !== null && activeSosIds.size > 0;
    },

    getTrackedSosId: function () {
      const first = activeSosIds.values().next();
      return first.done ? null : first.value;
    },

    getTrackedSosIds: function () {
      return Array.from(activeSosIds);
    }
  };

  function initSocketListeners() {
    const socket = getActiveSocket();
    if (!socket || socket.__rescuerTrackerListenersInitialized) return;
    socket.__rescuerTrackerListenersInitialized = true;

    socket.on('sos:resolve', function (data) {
      if (data && data.id && activeSosIds.has(Number(data.id))) {
        RescuerTracker.stopTracking(Number(data.id));
      }
    });

    socket.on('sos:cancel', function (data) {
      if (data && data.id && activeSosIds.has(Number(data.id))) {
        RescuerTracker.stopTracking(Number(data.id));
      }
    });

    socket.on('rescuer:location_cleared', function (data) {
      if (data && data.sos_id && activeSosIds.has(Number(data.sos_id))) {
        RescuerTracker.stopTracking(Number(data.sos_id));
      }
    });
  }

  function checkSessionResume() {
    try {
      const myUid = Number(window.currentUserId || 0);
      fetch('/api/sos/active')
        .then(res => res.json())
        .then(data => {
          if (data && data.success && Array.isArray(data.alerts)) {
            data.alerts.forEach(a => {
              if (a && ['ACKNOWLEDGED', 'RESPONDING', 'RESCUED'].includes(a.status) && myUid && Number(a.handled_by) === myUid) {
                RescuerTracker.startTracking(Number(a.id));
              }
            });
          }
        })
        .catch(() => {});
    } catch (_e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSocketListeners();
      checkSessionResume();
    });
  } else {
    initSocketListeners();
    checkSessionResume();
  }

  window.EvakWarRescuerTracker = RescuerTracker;
})();
