/**
 * In-memory active rescuer tracking singleton.
 * Supports Multi-SOS / En-Route Rescue: a single rescuer can be assigned to multiple SOS alerts along their path.
 */
class RescuerTracker {
  constructor() {
    // Map: sos_id (Number) -> rescuer record
    this.activeRescuers = new Map();
    // Map: rescuer_user_id (Number) -> latest rescuer GPS coordinates & profile
    this.rescuersByUserId = new Map();
  }

  /**
   * Update or set the current active rescuer location for a given SOS ID (and sync across all SOS IDs handled by this rescuer).
   */
  updateRescuerLocation(sosId, data) {
    const lat = Number(data && (data.latitude !== undefined ? data.latitude : data.lat));
    const lng = Number(data && (data.longitude !== undefined ? data.longitude : data.lng));
    if (data && data.rescuer_user_id && isFinite(lat) && isFinite(lng)) {
      const uid = Number(data.rescuer_user_id);
      const prevUser = this.rescuersByUserId.get(uid) || {};
      const resolvedPhoto = data.rescuer_photo || prevUser.rescuer_photo || null;
      const resolvedName = data.rescuer_name || prevUser.rescuer_name || 'Emergency Rescuer';
      const resolvedRole = data.rescuer_role || prevUser.rescuer_role || 'Emergency Rescuer';
      this.rescuersByUserId.set(uid, {
        ...prevUser,
        rescuer_user_id: uid,
        rescuer_name: resolvedName,
        rescuer_role: resolvedRole,
        rescuer_photo: resolvedPhoto,
        latitude: lat,
        longitude: lng,
        lat: lat,
        lng: lng,
        accuracy: Number(data.accuracy || prevUser.accuracy || 0),
        updated_at: new Date().toISOString()
      });

      // Sync new coordinates to all other active SOS alerts handled by this same rescuer (Multi-Rescue support)
      for (const [otherSosId, record] of this.activeRescuers.entries()) {
        if (record && Number(record.rescuer_user_id) === uid) {
          this.activeRescuers.set(otherSosId, {
            ...record,
            rescuer_name: resolvedName,
            rescuer_photo: resolvedPhoto || record.rescuer_photo || null,
            latitude: lat,
            longitude: lng,
            lat: lat,
            lng: lng,
            accuracy: Number(data.accuracy || record.accuracy || 0),
            updated_at: new Date().toISOString()
          });
        }
      }
    }

    if (!sosId) return null;
    const numericId = Number(sosId);
    const existing = this.activeRescuers.get(numericId) || {};

    const updatedRecord = {
      ...existing,
      ...data,
      sos_id: numericId,
      latitude: isFinite(lat) ? lat : existing.latitude,
      longitude: isFinite(lng) ? lng : existing.longitude,
      accuracy: Number((data && data.accuracy) || existing.accuracy || 0),
      updated_at: new Date().toISOString()
    };

    this.activeRescuers.set(numericId, updatedRecord);
    return updatedRecord;
  }

  /**
   * Retrieve the latest known GPS location of a rescuer by their user_id (or sos_id fallback).
   */
  getRescuerLocation(id) {
    if (!id) return null;
    const numId = Number(id);
    if (this.rescuersByUserId.has(numId)) {
      return this.rescuersByUserId.get(numId);
    }
    for (const record of this.activeRescuers.values()) {
      if (Number(record.rescuer_user_id) === numId || Number(record.sos_id) === numId) {
        return {
          ...record,
          lat: Number(record.latitude),
          lng: Number(record.longitude)
        };
      }
    }
    return null;
  }

  /**
   * Clear active rescuer tracking for a resolved, cancelled, or completed SOS alert.
   */
  clearRescuerLocation(sosId) {
    if (!sosId) return false;
    const numericId = Number(sosId);
    return this.activeRescuers.delete(numericId);
  }

  /**
   * Clear active AND standby rescuer tracking by rescuer user ID (e.g. when rescuer logs out or goes offline).
   */
  clearRescuerLocationByRescuerId(rescuerUserId) {
    if (!rescuerUserId) return false;
    const uid = Number(rescuerUserId);
    let removed = this.rescuersByUserId.delete(uid);
    for (const [sosId, record] of this.activeRescuers.entries()) {
      if (record.rescuer_user_id === uid) {
        this.activeRescuers.delete(sosId);
        removed = true;
      }
    }
    return removed;
  }

  /**
   * Retrieve all currently active rescuer locations (responding to an SOS).
   */
  getActiveRescuers() {
    return Array.from(this.activeRescuers.values());
  }

  /**
   * Retrieve all known ONLINE rescuer GPS locations (both active responders and standby rescuers pinged within maxAgeMs).
   */
  getAllKnownRescuers(maxAgeMs = 3 * 60 * 1000) {
    const byUid = new Map();
    const now = Date.now();

    for (const record of this.activeRescuers.values()) {
      if (record && record.rescuer_user_id && isFinite(Number(record.latitude)) && isFinite(Number(record.longitude))) {
        const updatedMs = record.updated_at ? new Date(record.updated_at).getTime() : now;
        if (isFinite(updatedMs) && (now - updatedMs) <= maxAgeMs) {
          byUid.set(Number(record.rescuer_user_id), record);
        }
      }
    }

    for (const [uid, record] of this.rescuersByUserId.entries()) {
      if (!record || !isFinite(Number(record.latitude)) || !isFinite(Number(record.longitude))) continue;
      const updatedMs = record.updated_at ? new Date(record.updated_at).getTime() : now;
      if (isFinite(updatedMs) && (now - updatedMs) <= maxAgeMs) {
        const existing = byUid.get(Number(uid));
        const existingMs = existing && existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
        if (!existing || updatedMs >= existingMs) {
          byUid.set(Number(uid), record);
        }
      }
    }

    return Array.from(byUid.values());
  }

  /**
   * Retrieve active rescuer record for a specific SOS ID.
   */
  getActiveRescuerBySosId(sosId) {
    if (!sosId) return null;
    return this.activeRescuers.get(Number(sosId)) || null;
  }
}

// Export singleton instance
module.exports = new RescuerTracker();
