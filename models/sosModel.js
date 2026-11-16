const db = require('../config/db');

// In-flight mutex lock to prevent concurrent requests from creating duplicate alerts
const inFlightAlertCreations = new Map();

const SosModel = {
  createAlert: async ({ resident_id, name, latitude, longitude, accuracy }) => {
    let cleanResidentId = resident_id || null;
    let resolvedName = name || 'Resident';

    // Disambiguate resident identity: guarantee cleanResidentId is canonical residents.id
    if (cleanResidentId) {
      try {
        let [resMatch] = await db.execute('SELECT id, user_id, first_name, last_name FROM residents WHERE id = ?', [cleanResidentId]);
        if (!resMatch || resMatch.length === 0) {
          [resMatch] = await db.execute('SELECT id, user_id, first_name, last_name FROM residents WHERE user_id = ?', [cleanResidentId]);
        }
        if (resMatch && resMatch.length > 0) {
          cleanResidentId = resMatch[0].id;
          resolvedName = `${resMatch[0].first_name} ${resMatch[0].last_name || ''}`.trim();
        }
      } catch (err) {
        console.warn('Error resolving resident identity in createAlert:', err);
      }
    }

    const lockKey = cleanResidentId
      ? `res_${cleanResidentId}`
      : `guest_${String(resolvedName).trim().toLowerCase()}_${Number(latitude).toFixed(3)}_${Number(longitude).toFixed(3)}`;

    // If another creation request is currently in flight for this resident/user, await and return it
    if (inFlightAlertCreations.has(lockKey)) {
      try {
        const existingPromise = inFlightAlertCreations.get(lockKey);
        const res = await existingPromise;
        if (res) return res;
      } catch (_e) { }
    }

    const creationPromise = (async () => {
      try {
        const lat = Number(latitude);
        const lng = Number(longitude);

        // Strict validation: Coordinates must be valid, finite numbers within legal Earth bounds, and not (0,0)
        if (
          latitude === null || latitude === undefined ||
          longitude === null || longitude === undefined ||
          isNaN(lat) || isNaN(lng) ||
          !isFinite(lat) || !isFinite(lng) ||
          lat < -90 || lat > 90 ||
          lng < -180 || lng > 180 ||
          (lat === 0 && lng === 0)
        ) {
          console.warn("SosModel.createAlert rejected: Missing or invalid GPS coordinates:", { latitude, longitude });
          return null;
        }

        // 1. If resident already has an active alert, update its coordinates instead of creating duplicates
        if (cleanResidentId) {
          const [existing] = await db.execute(
            `SELECT id FROM sos_alerts WHERE (resident_id = ? OR resident_id IN (SELECT user_id FROM residents WHERE id = ?)) AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING') ORDER BY id DESC LIMIT 1`,
            [cleanResidentId, cleanResidentId]
          );
          if (existing.length > 0) {
            const activeId = existing[0].id;
            await db.execute(
              `UPDATE sos_alerts SET latitude = ?, longitude = ?, accuracy = ?, name = ?, updated_at = NOW() WHERE id = ?`,
              [lat, lng, accuracy || 0, resolvedName, activeId]
            );
            return await SosModel.getById(activeId);
          }
        } else {
          // Check for guest alert with same name and location created in the last 60 seconds
          const [existingGuest] = await db.execute(
            `SELECT id FROM sos_alerts WHERE resident_id IS NULL AND name = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING') AND created_at >= NOW() - INTERVAL 1 MINUTE ORDER BY id DESC LIMIT 1`,
            [resolvedName]
          );
          if (existingGuest.length > 0) {
            const activeId = existingGuest[0].id;
            await db.execute(
              `UPDATE sos_alerts SET latitude = ?, longitude = ?, accuracy = ?, updated_at = NOW() WHERE id = ?`,
              [lat, lng, accuracy || 0, activeId]
            );
            return await SosModel.getById(activeId);
          }
        }

        const [result] = await db.execute(
          `INSERT INTO sos_alerts (resident_id, name, latitude, longitude, accuracy, status)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
          [cleanResidentId, resolvedName, lat, lng, accuracy || 0]
        );

        return await SosModel.getById(result.insertId);
      } catch (err) {
        console.error("Error creating SOS alert:", err.message || err);
        return null;
      }
    })();

    inFlightAlertCreations.set(lockKey, creationPromise);
    try {
      return await creationPromise;
    } finally {
      // Hold lock briefly to absorb race-condition double submissions
      setTimeout(() => {
        inFlightAlertCreations.delete(lockKey);
      }, 3000);
    }
  },

  getById: async (id) => {
    try {
      const [rows] = await db.execute(`
        SELECT 
          s.*,
          COALESCE(r.first_name, r_fallback.first_name) as first_name,
          COALESCE(r.last_name, r_fallback.last_name) as last_name,
          COALESCE(r.contact_number, r_fallback.contact_number) as contact_number,
          COALESCE(r.home_address, r_fallback.home_address) as home_address,
          COALESCE(r.barangay, r_fallback.barangay) as barangay,
          COALESCE(r.emergency_contact_name, r_fallback.emergency_contact_name) as emergency_contact_name,
          COALESCE(r.emergency_contact_phone, r_fallback.emergency_contact_phone) as emergency_contact_phone,
          COALESCE(r.vulnerability, r_fallback.vulnerability) as vulnerability,
          COALESCE(r.is_pregnant, r_fallback.is_pregnant) as is_pregnant,
          COALESCE(r.is_pwd, r_fallback.is_pwd) as is_pwd,
          COALESCE(r.has_serious_illness, r_fallback.has_serious_illness) as has_serious_illness,
          COALESCE(r.profile_photo, r_fallback.profile_photo) as resident_profile_photo,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', COALESCE(r.first_name, r_fallback.first_name), COALESCE(r.last_name, r_fallback.last_name))), ''),
            s.name
          ) as resident_display_name,
          u.email as handler_email,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', st.first_name, st.last_name)), ''),
            NULLIF(TRIM(CONCAT_WS(' ', hr.first_name, hr.last_name)), ''),
            u.email
          ) as handler_name,
          st.contact_number as handler_contact,
          st.profile_photo as handler_photo
        FROM sos_alerts s
        LEFT JOIN residents r ON s.resident_id = r.id
        LEFT JOIN residents r_fallback ON (r.id IS NULL AND s.resident_id = r_fallback.user_id)
        LEFT JOIN users u ON s.handled_by = u.id
        LEFT JOIN staff st ON u.id = st.user_id
        LEFT JOIN residents hr ON u.id = hr.user_id
        WHERE s.id = ?
        GROUP BY s.id
        LIMIT 1
      `, [id]);
      return rows[0] || null;
    } catch (err) {
      console.error("Error fetching SOS by id, executing fallback query:", err.message || err);
      try {
        const [fallback] = await db.execute(`SELECT * FROM sos_alerts WHERE id = ?`, [id]);
        return fallback[0] || null;
      } catch (fallbackErr) {
        return null;
      }
    }
  },

  updateLocation: async (id, { latitude, longitude, accuracy }) => {
    try {
      const lat = Number(latitude);
      const lng = Number(longitude);

      if (
        latitude === null || latitude === undefined ||
        longitude === null || longitude === undefined ||
        isNaN(lat) || isNaN(lng) ||
        !isFinite(lat) || !isFinite(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180 ||
        (lat === 0 && lng === 0)
      ) {
        console.warn("SosModel.updateLocation rejected: Invalid GPS coordinates:", { latitude, longitude });
        return null;
      }

      await db.execute(
        `UPDATE sos_alerts SET latitude = ?, longitude = ?, accuracy = ? WHERE id = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')`,
        [lat, lng, accuracy || 0, id]
      );
      return await SosModel.getById(id);
    } catch (err) {
      console.error("Error updating SOS location:", err.message || err);
      return null;
    }
  },

  updateStatus: async (id, status, handled_by = null, notes = null, userRole = null) => {
    try {
      const cleanId = (id && !isNaN(id)) ? Number(id) : null;
      if (!cleanId) {
        return { error: 'INVALID_ID', message: 'Invalid SOS alert ID.' };
      }

      const currentAlert = await SosModel.getById(cleanId);
      if (!currentAlert) {
        return { error: 'NOT_FOUND', message: 'SOS alert not found.' };
      }

      const currentHandledBy = (currentAlert.handled_by !== null && currentAlert.handled_by !== undefined && currentAlert.handled_by !== '')
        ? Number(currentAlert.handled_by)
        : null;
      const incomingHandledBy = (handled_by !== null && handled_by !== undefined && handled_by !== '')
        ? Number(handled_by)
        : null;
      const isAdmin = userRole === 'admin';

      // 1. Check if already resolved or cancelled
      if (currentAlert.status === 'RESOLVED' || currentAlert.status === 'CANCELLED') {
        if (status !== 'RESOLVED' && status !== 'CANCELLED') {
          return {
            error: 'ALREADY_RESOLVED',
            message: `This SOS alert is already ${currentAlert.status.toLowerCase()}.`,
            alert: currentAlert
          };
        }
      }

      // 2. Enforce assigned rescuer restriction:
      // If already claimed by another rescuer, reject other rescuers attempting to dispatch, rescue, or resolve
      if (currentHandledBy && incomingHandledBy && currentHandledBy !== incomingHandledBy && !isAdmin) {
        return {
          error: 'ALREADY_ASSIGNED',
          message: 'This SOS has already been assigned to another rescuer.',
          alert: currentAlert
        };
      }
      if (currentHandledBy && !incomingHandledBy && !isAdmin) {
        return {
          error: 'ALREADY_ASSIGNED',
          message: 'This SOS has already been assigned to another rescuer.',
          alert: currentAlert
        };
      }

      const targetHandledBy = incomingHandledBy || currentHandledBy || null;

      // 3. Concurrency-safe atomic conditional update:
      // If unassigned (handled_by is NULL/0), only update if handled_by is still NULL, 0, or matches targetHandledBy.
      // This prevents race conditions if two rescuers click Dispatch/Accept at the same millisecond.
      let updateResult;
      if (currentHandledBy) {
        if (notes) {
          [updateResult] = await db.execute(
            `UPDATE sos_alerts SET status = ?, handled_by = ?, responder_notes = ?, updated_at = NOW() WHERE id = ?`,
            [status, targetHandledBy, notes, cleanId]
          );
        } else {
          [updateResult] = await db.execute(
            `UPDATE sos_alerts SET status = ?, handled_by = ?, updated_at = NOW() WHERE id = ?`,
            [status, targetHandledBy, cleanId]
          );
        }
      } else {
        if (notes) {
          [updateResult] = await db.execute(
            `UPDATE sos_alerts SET status = ?, handled_by = ?, responder_notes = ?, updated_at = NOW() WHERE id = ? AND (handled_by IS NULL OR handled_by = 0 OR handled_by = ?)`,
            [status, targetHandledBy, notes, cleanId, targetHandledBy]
          );
        } else {
          [updateResult] = await db.execute(
            `UPDATE sos_alerts SET status = ?, handled_by = ?, updated_at = NOW() WHERE id = ? AND (handled_by IS NULL OR handled_by = 0 OR handled_by = ?)`,
            [status, targetHandledBy, cleanId, targetHandledBy]
          );
        }
      }

      // If affectedRows is 0 on unassigned update, another rescuer claimed it in a race condition
      if (updateResult && updateResult.affectedRows === 0) {
        const freshAlert = await SosModel.getById(cleanId);
        if (freshAlert && freshAlert.handled_by && Number(freshAlert.handled_by) !== incomingHandledBy && !isAdmin) {
          return {
            error: 'ALREADY_ASSIGNED',
            message: 'This SOS has already been assigned to another rescuer.',
            alert: freshAlert
          };
        }
      }

      return await SosModel.getById(cleanId);
    } catch (err) {
      console.error("Error updating SOS status:", err.message || err);
      return null;
    }
  },

  cancelByResidentId: async (resident_id) => {
    try {
      const [activeRows] = await db.execute(
        `SELECT id, resident_id FROM sos_alerts WHERE (resident_id = ? OR resident_id IN (SELECT id FROM residents WHERE user_id = ?) OR resident_id IN (SELECT user_id FROM residents WHERE id = ?)) AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')`,
        [resident_id, resident_id, resident_id]
      );
      if (activeRows.length > 0) {
        await db.execute(
          `UPDATE sos_alerts SET status = 'CANCELLED', updated_at = NOW() WHERE (resident_id = ? OR resident_id IN (SELECT id FROM residents WHERE user_id = ?) OR resident_id IN (SELECT user_id FROM residents WHERE id = ?)) AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')`,
          [resident_id, resident_id, resident_id]
        );
      }
      return activeRows;
    } catch (err) {
      console.error("Error cancelling SOS by resident_id:", err.message || err);
      return [];
    }
  },

  cancelAlert: async (id, resident_id = null) => {
    try {
      const cleanId = (id && !isNaN(id)) ? Number(id) : null;
      const cleanResId = (resident_id && !isNaN(resident_id)) ? Number(resident_id) : null;

      let activeRows = [];
      if (cleanId && cleanResId) {
        [activeRows] = await db.execute(
          `SELECT id, resident_id FROM sos_alerts WHERE (id = ? OR resident_id = ? OR resident_id IN (SELECT id FROM residents WHERE user_id = ?) OR resident_id IN (SELECT user_id FROM residents WHERE id = ?)) AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')`,
          [cleanId, cleanResId, cleanResId, cleanResId]
        );
      } else if (cleanId) {
        [activeRows] = await db.execute(
          `SELECT id, resident_id FROM sos_alerts WHERE id = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')`,
          [cleanId]
        );
      } else if (cleanResId) {
        [activeRows] = await db.execute(
          `SELECT id, resident_id FROM sos_alerts WHERE (resident_id = ? OR resident_id IN (SELECT id FROM residents WHERE user_id = ?) OR resident_id IN (SELECT user_id FROM residents WHERE id = ?)) AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')`,
          [cleanResId, cleanResId, cleanResId]
        );
      }

      if (activeRows.length > 0) {
        const ids = activeRows.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');
        await db.execute(
          `UPDATE sos_alerts SET status = 'CANCELLED', updated_at = NOW() WHERE id IN (${placeholders})`,
          ids
        );
        return activeRows;
      } else if (cleanId) {
        // Fallback: If not found in active status, update directly by id
        await db.execute(
          `UPDATE sos_alerts SET status = 'CANCELLED', updated_at = NOW() WHERE id = ?`,
          [cleanId]
        );
        return [{ id: cleanId, resident_id: cleanResId }];
      }
      return [];
    } catch (err) {
      console.error("Error in cancelAlert:", err.message || err);
      return [];
    }
  },

  resolveByResidentId: async (resident_id, handled_by = null, notes = 'Auto-resolved: Resident successfully checked into evacuation center') => {
    try {
      const [activeRows] = await db.execute(
        `SELECT id FROM sos_alerts WHERE (resident_id = ? OR resident_id IN (SELECT id FROM residents WHERE user_id = ?) OR resident_id IN (SELECT user_id FROM residents WHERE id = ?)) AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')`,
        [resident_id, resident_id, resident_id]
      );
      if (activeRows.length > 0) {
        await db.execute(
          `UPDATE sos_alerts SET status = 'RESOLVED', handled_by = COALESCE(?, handled_by), responder_notes = COALESCE(?, responder_notes), updated_at = NOW() WHERE (resident_id = ? OR resident_id IN (SELECT id FROM residents WHERE user_id = ?) OR resident_id IN (SELECT user_id FROM residents WHERE id = ?)) AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')`,
          [handled_by, notes, resident_id, resident_id, resident_id]
        );
        return activeRows.map(r => r.id);
      }
      return [];
    } catch (err) {
      console.error("Error auto-resolving SOS by resident_id:", err.message || err);
      return [];
    }
  },

  getActiveAlerts: async () => {
    try {
      const [rows] = await db.execute(`
        SELECT 
          s.*,
          COALESCE(r.first_name, r_fallback.first_name) as first_name,
          COALESCE(r.last_name, r_fallback.last_name) as last_name,
          COALESCE(r.contact_number, r_fallback.contact_number) as contact_number,
          COALESCE(r.home_address, r_fallback.home_address) as home_address,
          COALESCE(r.barangay, r_fallback.barangay) as barangay,
          COALESCE(r.emergency_contact_name, r_fallback.emergency_contact_name) as emergency_contact_name,
          COALESCE(r.emergency_contact_phone, r_fallback.emergency_contact_phone) as emergency_contact_phone,
          COALESCE(r.vulnerability, r_fallback.vulnerability) as vulnerability,
          COALESCE(r.is_pregnant, r_fallback.is_pregnant) as is_pregnant,
          COALESCE(r.is_pwd, r_fallback.is_pwd) as is_pwd,
          COALESCE(r.has_serious_illness, r_fallback.has_serious_illness) as has_serious_illness,
          COALESCE(r.profile_photo, r_fallback.profile_photo) as resident_profile_photo,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', COALESCE(r.first_name, r_fallback.first_name), COALESCE(r.last_name, r_fallback.last_name))), ''),
            s.name
          ) as resident_display_name,
          u.email as handler_email,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', st.first_name, st.last_name)), ''),
            NULLIF(TRIM(CONCAT_WS(' ', hr.first_name, hr.last_name)), ''),
            u.email
          ) as handler_name,
          st.contact_number as handler_contact,
          st.profile_photo as handler_photo
        FROM sos_alerts s
        LEFT JOIN residents r ON s.resident_id = r.id
        LEFT JOIN residents r_fallback ON (r.id IS NULL AND s.resident_id = r_fallback.user_id)
        LEFT JOIN users u ON s.handled_by = u.id
        LEFT JOIN staff st ON u.id = st.user_id
        LEFT JOIN residents hr ON u.id = hr.user_id
        WHERE s.status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `);
      return rows;
    } catch (err) {
      console.error("Error getting active SOS alerts:", err.message || err);
      return [];
    }
  },

  getAllRecentAlerts: async (limit = 30) => {
    try {
      const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 30, 200));
      const [rows] = await db.query(`
        SELECT 
          s.*,
          COALESCE(r.first_name, r_fallback.first_name) as first_name,
          COALESCE(r.last_name, r_fallback.last_name) as last_name,
          COALESCE(r.contact_number, r_fallback.contact_number) as contact_number,
          COALESCE(r.home_address, r_fallback.home_address) as home_address,
          COALESCE(r.barangay, r_fallback.barangay) as barangay,
          COALESCE(r.emergency_contact_name, r_fallback.emergency_contact_name) as emergency_contact_name,
          COALESCE(r.emergency_contact_phone, r_fallback.emergency_contact_phone) as emergency_contact_phone,
          COALESCE(r.vulnerability, r_fallback.vulnerability) as vulnerability,
          COALESCE(r.is_pregnant, r_fallback.is_pregnant) as is_pregnant,
          COALESCE(r.is_pwd, r_fallback.is_pwd) as is_pwd,
          COALESCE(r.has_serious_illness, r_fallback.has_serious_illness) as has_serious_illness,
          COALESCE(r.profile_photo, r_fallback.profile_photo) as resident_profile_photo,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', COALESCE(r.first_name, r_fallback.first_name), COALESCE(r.last_name, r_fallback.last_name))), ''),
            s.name
          ) as resident_display_name,
          u.email as handler_email,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', st.first_name, st.last_name)), ''),
            NULLIF(TRIM(CONCAT_WS(' ', hr.first_name, hr.last_name)), ''),
            u.email
          ) as handler_name,
          st.contact_number as handler_contact,
          st.profile_photo as handler_photo
        FROM sos_alerts s
        LEFT JOIN residents r ON s.resident_id = r.id
        LEFT JOIN residents r_fallback ON (r.id IS NULL AND s.resident_id = r_fallback.user_id)
        LEFT JOIN users u ON s.handled_by = u.id
        LEFT JOIN staff st ON u.id = st.user_id
        LEFT JOIN residents hr ON u.id = hr.user_id
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT ${parsedLimit}
      `);
      return rows;
    } catch (err) {
      console.error("Error getting recent SOS alerts:", err.message || err);
      return [];
    }
  },

  getActiveByResidentId: async (resident_id) => {
    try {
      const [rows] = await db.execute(`
        SELECT 
          s.*,
          COALESCE(r.first_name, r_fallback.first_name) as first_name,
          COALESCE(r.last_name, r_fallback.last_name) as last_name,
          COALESCE(r.contact_number, r_fallback.contact_number) as contact_number,
          COALESCE(r.home_address, r_fallback.home_address) as home_address,
          COALESCE(r.barangay, r_fallback.barangay) as barangay
        FROM sos_alerts s
        LEFT JOIN residents r ON s.resident_id = r.id
        LEFT JOIN residents r_fallback ON (r.id IS NULL AND s.resident_id = r_fallback.user_id)
        WHERE (s.resident_id = ? OR s.resident_id IN (SELECT id FROM residents WHERE user_id = ?) OR s.resident_id IN (SELECT user_id FROM residents WHERE id = ?)) 
          AND s.status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')
        GROUP BY s.id
        ORDER BY s.id DESC LIMIT 1
      `, [resident_id, resident_id, resident_id]);
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.error("Error getting active SOS for resident:", err.message || err);
      return null;
    }
  }
};

module.exports = SosModel;
