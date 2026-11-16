const db = require('../config/db');

let _io = null;
let _lastCheckTime = 0;

const autoCheckout = {
  setIo: (io) => {
    _io = io;
  },

  getIo: () => {
    return _io;
  },

  checkAndCheckoutExpired: async (ioInstance, force = false) => {
    const now = Date.now();
    if (!force && (now - _lastCheckTime < 30000)) {
      return { checkedOutCount: 0, affectedCenters: [], throttled: true };
    }
    _lastCheckTime = now;
    const io = ioInstance || _io;
    try {
      // 1. Identify centers that contain active check-ins older than 24 hours
      const [expiredRows] = await db.execute(`
        SELECT DISTINCT center_id 
        FROM check_ins 
        WHERE status IN ('ACTIVE', 'CHECKED_IN') 
          AND check_in_time < DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);

      if (!expiredRows || expiredRows.length === 0) {
        return { checkedOutCount: 0, affectedCenters: [] };
      }

      const affectedCenterIds = expiredRows
        .map(r => r.center_id)
        .filter(id => id !== null && id !== undefined);

      // 2. Automatically mark expired check-ins as CHECKED_OUT with current timestamp
      const [updateResult] = await db.execute(`
        UPDATE check_ins 
        SET status = 'CHECKED_OUT', check_out_time = CURRENT_TIMESTAMP 
        WHERE status IN ('ACTIVE', 'CHECKED_IN') 
          AND check_in_time < DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);

      const checkedOutCount = updateResult.affectedRows || 0;

      // 3. Resync current_occupancy for all affected evacuation centers
      const Center = require('../models/centerModel');
      for (const cId of affectedCenterIds) {
        const newOccupancy = await Center.syncOccupancy(cId);
        if (io) {
          io.emit('center_updated', {
            centerId: cId,
            occupancy: newOccupancy,
            autoCheckout: true,
            departedCount: checkedOutCount
          });
          io.emit('ec_board_updated', {
            centerId: cId,
            occupancy: newOccupancy
          });
        }
      }

      if (io && checkedOutCount > 0) {
        try {
          const allCenters = await Center.findAll();
          io.emit('map_centers_updated', { centers: allCenters });
        } catch (e) {
          io.emit('map_centers_updated');
        }
      }

      if (checkedOutCount > 0) {
        console.log(`[AutoCheckout] Successfully auto-checked out ${checkedOutCount} evacuee(s) older than 24h across center(s): ${affectedCenterIds.join(', ')}`);
      }

      return {
        checkedOutCount,
        affectedCenters: affectedCenterIds
      };
    } catch (err) {
      console.error('[AutoCheckout] Error checking/processing expired check-ins:', err);
      return { checkedOutCount: 0, affectedCenters: [], error: err.message };
    }
  },

  startScheduler: (io, intervalMs = 60 * 1000) => {
    if (io) _io = io;

    // Run once immediately on start
    autoCheckout.checkAndCheckoutExpired(_io).catch(err => {
      console.error('[AutoCheckout] Initial scheduler execution failed:', err);
    });

    // Run on recurring interval (default every 60s)
    return setInterval(() => {
      autoCheckout.checkAndCheckoutExpired(_io).catch(err => {
        console.error('[AutoCheckout] Recurring scheduler execution failed:', err);
      });
    }, intervalMs);
  }
};

module.exports = autoCheckout;
