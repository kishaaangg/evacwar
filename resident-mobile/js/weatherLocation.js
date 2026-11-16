/**
 * Evacwar Weather Location Manager
 * Handles device GPS geolocation, storage in localStorage, and dynamic Open-Meteo updates.
 */
(function(window) {
  const STORAGE_KEY = 'Evacwar_weather_coords';
  const DEFAULT_LAT = 13.5102;
  const DEFAULT_LON = 123.3470;
  const DEFAULT_NAME = 'San Rafael, Baao';

  const WeatherLocation = {
    DEFAULT_LAT: DEFAULT_LAT,
    DEFAULT_LON: DEFAULT_LON,
    DEFAULT_NAME: DEFAULT_NAME,

    /**
     * Get stored coordinates from localStorage (if any)
     */
    getSavedLocation: function() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
          return parsed;
        }
      } catch (e) {
        console.warn('[WeatherLocation] Could not read saved coordinates:', e);
      }
      return null;
    },

    /**
     * Save granted coordinates to localStorage
     */
    saveLocation: function(lat, lon, accuracy) {
      try {
        const payload = {
          lat: Number(Number(lat).toFixed(4)),
          lon: Number(Number(lon).toFixed(4)),
          accuracy: accuracy ? Number(Number(accuracy).toFixed(1)) : null,
          timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return payload;
      } catch (e) {
        console.warn('[WeatherLocation] Could not save coordinates:', e);
      }
      return null;
    },

    /**
     * Clear saved location from localStorage
     */
    clearLocation: function() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    },

    /**
     * Check if browser supports Geolocation API
     */
    isSupported: function() {
      return typeof navigator !== 'undefined' && 'geolocation' in navigator;
    },

    /**
     * Request actual GPS coordinates from device
     */
    getCurrentPosition: function() {
      return new Promise((resolve, reject) => {
        if (!this.isSupported()) {
          return reject(new Error('Geolocation is not supported by your browser.'));
        }

        const options = {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // Cache for 1 min to prevent battery drain
        };

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            console.log('GPS latitude:', lat);
            console.log('GPS longitude:', lon);
            console.log('GPS accuracy:', accuracy ? accuracy + ' m' : 'N/A');

            const saved = this.saveLocation(lat, lon, accuracy);
            resolve(saved || { lat, lon, accuracy });
          },
          (error) => {
            let userMsg = 'Unable to retrieve location.';
            if (error.code === error.PERMISSION_DENIED) {
              userMsg = 'Location permission denied. Showing default weather for San Rafael, Baao.';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
              userMsg = 'GPS location is unavailable on your device.';
            } else if (error.code === error.TIMEOUT) {
              userMsg = 'Location request timed out. Please try again.';
            }
            console.warn('[WeatherLocation] GPS error:', error.message || userMsg);
            reject(new Error(userMsg));
          },
          options
        );
      });
    },

    /**
     * Fetch weather from Open-Meteo via /api/weather/refresh with optional GPS coordinates
     */
    fetchWeather: async function(coords) {
      const payload = coords || this.getSavedLocation() || {};
      const res = await fetch('/api/weather/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lat: payload.lat,
          lon: payload.lon,
          accuracy: payload.accuracy
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data || !data.success || !data.weather) {
        throw new Error(data.error || 'Failed to fetch weather data.');
      }

      return data.weather;
    },

    /**
     * Show clean toast notification
     */
    showToast: function(msg, isError) {
      if (typeof window.showToast === 'function') {
        window.showToast(msg, isError ? 'error' : 'info');
        return;
      }
      const existing = document.getElementById('weatherLocToast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'weatherLocToast';
      toast.className = `fixed bottom-16 sm:bottom-5 right-3 sm:right-5 z-50 px-2.5 py-1.5 rounded-xl shadow-lg border text-xs font-semibold transition-all duration-200 transform translate-y-0 inline-flex items-center gap-2 backdrop-blur-md leading-snug max-w-[280px] sm:max-w-xs ${
        isError ? 'bg-red-600/95 text-white border-red-500/80 shadow-red-950/20' : 'bg-slate-900/95 text-white border-slate-700/80 shadow-slate-950/20 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-300'
      }`;
      toast.innerHTML = `<i class="ph ${isError ? 'ph-warning-circle' : 'ph-map-pin'} text-sm shrink-0"></i><span class="truncate">${msg}</span>`;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => toast.remove(), 250);
      }, 3200);
    }
  };

  window.EvacwarWeatherLocation = WeatherLocation;
  window.EvakwarWeatherLocation = WeatherLocation;
})(window);
