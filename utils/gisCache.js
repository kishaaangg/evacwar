/**
 * Safe in-memory cache for static GIS and map configuration data.
 * Requirements:
 * - Cache only safe, non-user-specific, non-real-time GIS data (drawn_features GeoJSON).
 * - Immediate invalidation when an administrator updates map features.
 * - Fallback to database on cache miss or expiration (5-minute TTL).
 */

const db = require('../config/db');

let _cachedDrawnFeatures = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const gisCache = {
  /**
   * Retrieves the current GeoJSON drawn_features (string or parsed object).
   * @param {boolean} parseJson - whether to return parsed JSON or raw string
   * @returns {Promise<string|object>}
   */
  getDrawnFeatures: async (parseJson = false) => {
    const now = Date.now();
    if (_cachedDrawnFeatures && (now - _cachedAt < CACHE_TTL_MS)) {
      return parseJson ? JSON.parse(_cachedDrawnFeatures) : _cachedDrawnFeatures;
    }

    try {
      const [rows] = await db.execute("SELECT value FROM map_settings WHERE key_name = 'drawn_features'");
      const rawValue = (rows && rows.length > 0 && rows[0].value) 
        ? rows[0].value 
        : '{"type":"FeatureCollection","features":[]}';
      
      _cachedDrawnFeatures = rawValue;
      _cachedAt = now;

      return parseJson ? JSON.parse(rawValue) : rawValue;
    } catch (err) {
      console.warn('[gisCache] DB query failed, using fallback or stale cache:', err.message);
      if (_cachedDrawnFeatures) {
        return parseJson ? JSON.parse(_cachedDrawnFeatures) : _cachedDrawnFeatures;
      }
      const fallback = '{"type":"FeatureCollection","features":[]}';
      return parseJson ? JSON.parse(fallback) : fallback;
    }
  },

  /**
   * Explicitly updates or invalidates the cache when map features are saved.
   * @param {string|object|null} newGeoJson
   */
  invalidate: (newGeoJson = null) => {
    if (newGeoJson) {
      _cachedDrawnFeatures = typeof newGeoJson === 'string' ? newGeoJson : JSON.stringify(newGeoJson);
      _cachedAt = Date.now();
    } else {
      _cachedDrawnFeatures = null;
      _cachedAt = 0;
    }
  }
};

module.exports = gisCache;
