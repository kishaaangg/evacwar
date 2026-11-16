/**
 * EvakWar Rescuer Geolocation Tracking Module
 * Continuously captures rescuer's GPS coordinates during active DISPATCH and RESCUE operations
 * and streams them to the Admin SOS Map via the existing Socket.IO connection.
 */
(function () {
  if (window.EvakWarRescuerTracker) return;

  const STORAGE_KEY = 'evakwar_active_rescuer_sos_id';
  let watchId = null;
  let activeSosId = null;
  let lastSentTime = 0;
  let lastCoords = null;
  const THROTTLE_MS = 3000; // Emit at most once every 3 seconds

  function getActiveSocket() {
    if (window.__appSocket) return window.__appSocket;
    if (window.__staffSocket) return window.__staffSocket;
    if (typeof io !== 'undefined') {
      window.__appSocket = io();
      return window.__appSocket;
    }
    return null;
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

    // Lightweight compact fallback toast element
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

  function updateTrackingIndicator(active, sosId) {
    let indicator = document.getElementById('rescuerTrackingIndicator');
    if (!active) {
      if (indicator) indicator.remove();
      return;
    }

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'rescuerTrackingIndicator';
      indicator.className = 'fixed top-16 right-4 z-40 bg-indigo-600/95 backdrop-blur-md text-white px-3 py-1.5 rounded-full shadow-lg border border-indigo-400/40 flex items-center gap-2 text-xs font-black tracking-wide animate-pulse pointer-events-auto';
      document.body.appendChild(indicator);
    }

    indicator.innerHTML = `
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
      </span>
      <span>GPS Telemetry Active (SOS #${sosId || ''})</span>
    `;
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // in meters
  }

  function onPositionUpdate(pos) {
    if (!activeSosId) return;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const acc = pos.coords.accuracy || 0;
    const now = Date.now();

    // Throttling: send at most every THROTTLE_MS, unless moved > 8 meters
    if (lastCoords && (now - lastSentTime < THROTTLE_MS)) {
      const dist = calculateDistance(lastCoords.lat, lastCoords.lng, lat, lng);
      if (dist < 8) {
        return;
      }
    }

    lastSentTime = now;
    lastCoords = { lat, lng };

    const socket = getActiveSocket();
    if (socket && socket.connected) {
      socket.emit('rescuer:location', {
        sos_id: Number(activeSosId),
        latitude: lat,
        longitude: lng,
        accuracy: acc
      });
    }
  }

  function onPositionError(err) {
    console.warn('[Rescuer Tracker] Geolocation error:', err);
    if (err.code === err.PERMISSION_DENIED) {
      showTrackerToast('GPS permission denied. Please allow location access to share rescue location.', 'error');
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      showTrackerToast('GPS signal unavailable. Waiting for GPS fix...', 'error');
    }
    // Do not throw or crash
  }

  const RescuerTracker = {
    /**
     * Start continuous geolocation tracking for an assigned SOS alert.
     */
    startTracking: function (sosId) {
      if (!sosId) return;
      const numericId = Number(sosId);

      if (watchId && activeSosId === numericId) {
        // Already actively tracking this SOS ID
        return;
      }

      // Stop previous watcher if switching SOS targets
      if (watchId) {
        this.stopTracking(false);
      }

      if (!navigator.geolocation) {
        showTrackerToast('Geolocation is not supported by your browser or device.', 'error');
        return;
      }

      activeSosId = numericId;
      try {
        sessionStorage.setItem(STORAGE_KEY, String(numericId));
      } catch (_e) { }

      updateTrackingIndicator(true, numericId);
      showTrackerToast(`Live GPS tracking activated for SOS #${numericId}`, 'success');

      // Request initial position immediately
      navigator.geolocation.getCurrentPosition(onPositionUpdate, onPositionError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      // Start continuous watching
      watchId = navigator.geolocation.watchPosition(onPositionUpdate, onPositionError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      });
    },

    /**
     * Stop continuous geolocation tracking.
     */
    stopTracking: function (notify = true) {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      const previousSosId = activeSosId;
      activeSosId = null;
      lastCoords = null;
      lastSentTime = 0;

      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (_e) { }

      updateTrackingIndicator(false);
      if (notify && previousSosId) {
        showTrackerToast(`Live GPS tracking ended for SOS #${previousSosId}`, 'info');
      }
    },

    /**
     * Check if tracking is currently active.
     */
    isTracking: function () {
      return watchId !== null && activeSosId !== null;
    },

    /**
     * Get the currently tracked SOS ID.
     */
    getTrackedSosId: function () {
      return activeSosId;
    }
  };

  // Wire Socket.IO lifecycle events to automatically stop tracking when SOS resolves or cancels
  function initSocketListeners() {
    const socket = getActiveSocket();
    if (!socket || socket.__rescuerTrackerListenersInitialized) return;
    socket.__rescuerTrackerListenersInitialized = true;

    socket.on('sos:resolve', function (data) {
      if (data && RescuerTracker.isTracking() && Number(data.id) === Number(RescuerTracker.getTrackedSosId())) {
        RescuerTracker.stopTracking(true);
      }
    });

    socket.on('sos:cancel', function (data) {
      if (data && RescuerTracker.isTracking() && Number(data.id) === Number(RescuerTracker.getTrackedSosId())) {
        RescuerTracker.stopTracking(true);
      }
    });

    socket.on('rescuer:location_cleared', function (data) {
      if (data && RescuerTracker.isTracking() && Number(data.sos_id) === Number(RescuerTracker.getTrackedSosId())) {
        RescuerTracker.stopTracking(true);
      }
    });
  }

  // Auto-resume tracking if active in current session upon page load / refresh
  function checkSessionResume() {
    try {
      const storedSosId = sessionStorage.getItem(STORAGE_KEY);
      if (storedSosId) {
        const parsed = parseInt(storedSosId, 10);
        if (!isNaN(parsed) && parsed > 0) {
          // Check if alert is still active via lightweight check
          fetch('/api/sos/active')
            .then(res => res.json())
            .then(data => {
              if (data && data.success && Array.isArray(data.alerts)) {
                const targetAlert = data.alerts.find(a => Number(a.id) === parsed);
                if (targetAlert && (targetAlert.status === 'RESPONDING' || targetAlert.status === 'RESCUED')) {
                  RescuerTracker.startTracking(parsed);
                } else {
                  sessionStorage.removeItem(STORAGE_KEY);
                }
              }
            })
            .catch(() => {
              // Silently ignore if offline
            });
        }
      }
    } catch (_e) { }
  }

  // Initialize on load
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
