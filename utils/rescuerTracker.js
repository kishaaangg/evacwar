/**
 * In-memory active rescuer tracking singleton.
 * Maintains ONLY the current active rescuer location needed for an active SOS distress alert.
 * Zero unnecessary location history is stored.
 */
class RescuerTracker {
  constructor() {
    // Map: sos_id (Number) -> {
    //   sos_id,
    //   rescuer_user_id,
    //   rescuer_name,
    //   rescuer_role,
    //   rescuer_photo,
    //   latitude,
    //   longitude,
    //   accuracy,
    //   status,
    //   updated_at
    // }
    this.activeRescuers = new Map();
  }

  /**
   * Update or set the current active rescuer location for a given SOS ID.
   * Overwrites the previous location to ensure only the latest coordinates are stored.
   */
  updateRescuerLocation(sosId, data) {
    if (!sosId) return null;
    const numericId = Number(sosId);
    const existing = this.activeRescuers.get(numericId) || {};

    const updatedRecord = {
      ...existing,
      ...data,
      sos_id: numericId,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      accuracy: Number(data.accuracy || 0),
      updated_at: new Date().toISOString()
    };

    this.activeRescuers.set(numericId, updatedRecord);
    return updatedRecord;
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
   * Clear active rescuer tracking by rescuer user ID.
   */
  clearRescuerLocationByRescuerId(rescuerUserId) {
    if (!rescuerUserId) return false;
    const uid = Number(rescuerUserId);
    let removed = false;
    for (const [sosId, record] of this.activeRescuers.entries()) {
      if (record.rescuer_user_id === uid) {
        this.activeRescuers.delete(sosId);
        removed = true;
      }
    }
    return removed;
  }

  /**
   * Retrieve all currently active rescuer locations.
   */
  getActiveRescuers() {
    return Array.from(this.activeRescuers.values());
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
