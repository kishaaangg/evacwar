const express = require('express');
const router = express.Router();
const SosModel = require('../models/sosModel');
const staffController = require('../controllers/staffController');
const rescuerTracker = require('../utils/rescuerTracker');
const loraRoutes = require('./loraRoutes');
const { requireAuth, requireRole, noCache } = require('../middleware/authMiddleware');

// Ensure real-time SOS responses are never cached by browser
router.use(noCache);

// GET /api/sos/active - Retrieve all active SOS alerts
router.get('/active', async (req, res) => {
  try {
    const alerts = await SosModel.getActiveAlerts();
    res.json({ success: true, alerts });
  } catch (error) {
    console.error('Error fetching active SOS alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sos/rescuers/active - Retrieve ONLY currently ONLINE rescuer locations with real live GPS
router.get('/rescuers/active', requireAuth, requireRole(['staff', 'admin', 'rescuer', 'barangay_council']), async (req, res) => {
  try {
    const activeMap = new Map();
    const known = (typeof rescuerTracker.getAllKnownRescuers === 'function')
      ? rescuerTracker.getAllKnownRescuers(3 * 60 * 1000)
      : rescuerTracker.getActiveRescuers();
    known.forEach((kr) => {
      if (kr && kr.rescuer_user_id && isFinite(Number(kr.latitude)) && isFinite(Number(kr.longitude))) {
        activeMap.set(`u_${kr.rescuer_user_id}`, {
          ...kr,
          sos_id: kr.sos_id || `standby_${kr.rescuer_user_id}`,
          status: kr.status || 'STANDBY'
        });
      }
    });
    res.json({ success: true, rescuers: Array.from(activeMap.values()) });
  } catch (error) {
    console.error('Error fetching active rescuer locations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sos/rescuer/location - Standby / live GPS heartbeat for rescuers so nearest-rescuer auto-assign uses real coordinates
router.post('/rescuer/location', requireAuth, requireRole(['staff', 'rescuer', 'admin', 'barangay_council']), async (req, res) => {
  try {
    const { latitude, longitude, accuracy, sos_id, rescuer_photo, rescuer_name } = req.body || {};
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
      return res.status(400).json({ success: false, message: 'Valid GPS coordinates required.' });
    }
    const uid = Number((req.session && req.session.userId) || req.headers['x-evakwar-mobile-user-id'] || 0);
    if (!uid) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    const db = require('../config/db');
    const cached = rescuerTracker.getRescuerLocation(uid);
    let rName = (rescuer_name && rescuer_name !== 'Emergency Rescuer' && rescuer_name !== 'Rescuer Unit')
      ? rescuer_name
      : ((cached && cached.rescuer_name && cached.rescuer_name !== 'Emergency Rescuer') ? cached.rescuer_name : null);
    let rPhoto = rescuer_photo || (cached && cached.rescuer_photo) || null;
    let rRole = (cached && cached.rescuer_role) || null;

    if (!rName || !rPhoto) {
      const [pRows] = await db.execute('SELECT first_name, last_name, profile_photo, occupation, staff_type FROM staff WHERE user_id = ? LIMIT 1', [uid]).catch(() => [[]]);
      if (pRows && pRows.length > 0) {
        if (pRows[0].staff_type && !['RESCUER', 'BOTH'].includes(String(pRows[0].staff_type).toUpperCase())) {
          return res.json({ success: true, skipped: true });
        }
        const dbName = `${pRows[0].first_name || ''} ${pRows[0].last_name || ''}`.trim();
        if (dbName) rName = dbName;
        if (!rPhoto && pRows[0].profile_photo) rPhoto = pRows[0].profile_photo;
        if (pRows[0].occupation) rRole = pRows[0].occupation;
      }
    }
    if (!rName) {
      rName = (req.session && req.session.userName) || req.headers['x-evakwar-mobile-name'] || null;
    }
    if (!rName) {
      return res.json({ success: true, skipped: true });
    }
    if (rPhoto && !String(rPhoto).startsWith('http') && !String(rPhoto).startsWith('/')) {
      rPhoto = `/uploads/profiles/${rPhoto}`;
    }
    rescuerTracker.updateRescuerLocation(sos_id ? Number(sos_id) : null, {
      rescuer_user_id: uid,
      rescuer_name: rName,
      rescuer_photo: rPhoto,
      rescuer_role: rRole || rName,
      latitude: lat,
      longitude: lng,
      accuracy: Number(accuracy || 0)
    });
    const latest = rescuerTracker.getRescuerLocation(uid);
    if (req.io) {
      req.io.emit('rescuer:location_update', {
        sos_id: sos_id ? Number(sos_id) : `standby_${uid}`,
        rescuer_user_id: uid,
        rescuer_name: (latest && latest.rescuer_name) || rName,
        rescuer_photo: (latest && latest.rescuer_photo) || rPhoto,
        rescuer_role: rRole || rName,
        latitude: lat,
        longitude: lng,
        lat: lat,
        lng: lng,
        accuracy: Number(accuracy || 0),
        status: sos_id ? 'RESPONDING' : 'STANDBY',
        updated_at: new Date().toISOString()
      });
    }
    const { autoAssignPendingSosToOnlineRescuer } = require('../utils/barangayGeofence');
    if (typeof autoAssignPendingSosToOnlineRescuer === 'function') {
      await autoAssignPendingSosToOnlineRescuer(req.io);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating standby rescuer location:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sos/resident/active - Retrieve active SOS alert for current session user (strictly resident only)
router.get('/resident/active', requireAuth, requireRole(['resident']), async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    if (!userId) {
      return res.json({ success: true, activeSos: null });
    }
    const activeSos = await SosModel.getActiveByResidentId(userId);
    res.json({ success: true, activeSos });
  } catch (error) {
    console.error('Error fetching active resident SOS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sos/create - Create an active SOS alert with strict GPS coordinate validation
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { resident_id, name, latitude, longitude, accuracy } = req.body;
    const lat = Number(latitude);
    const lng = Number(longitude);

    // Strict coordinate validation
    if (
      latitude === null || latitude === undefined ||
      longitude === null || longitude === undefined ||
      isNaN(lat) || isNaN(lng) ||
      !isFinite(lat) || !isFinite(lng) ||
      lat < -90 || lat > 90 ||
      lng < -180 || lng > 180 ||
      (lat === 0 && lng === 0)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Valid GPS latitude and longitude are required to trigger an SOS alert.'
      });
    }

    const userId = req.session ? req.session.userId : null;
    const isStaffOrAdmin = req.session && (req.session.role === 'admin' || req.session.role === 'staff' || req.session.role === 'barangay_council');
    const targetResidentId = (isStaffOrAdmin && resident_id) ? resident_id : (resident_id || userId);

    const alert = await SosModel.createAlert({
      resident_id: targetResidentId,
      name: name || (req.session && req.session.userName ? req.session.userName : 'Resident'),
      latitude: lat,
      longitude: lng,
      accuracy: Number(accuracy || 0)
    });

    if (!alert) {
      return res.status(500).json({ success: false, error: 'Failed to record SOS alert' });
    }
    if (alert.error === 'OUTSIDE_BARANGAY') {
      return res.status(403).json({
        success: false,
        error: 'OUTSIDE_BARANGAY',
        message: alert.message || 'SOS & Rescue option is available ONLY within Barangay San Rafael boundary.'
      });
    }

    if (alert.auto_assigned && alert.responder_name) {
      try {
        loraRoutes.queueOutboundSosAck(alert, alert.status || 'ACKNOWLEDGED', alert.responder_name, {
          lat: alert.rescuer_lat || 13.51037,
          lng: alert.rescuer_lng || 123.34810
        });
      } catch (_e) {}
    }

    if (req.io) {
      req.io.emit('sos:new', alert);
      if (alert.auto_assigned && alert.responder_name) {
        const rPhoto = alert.rescuer_photo || alert.handler_photo || null;
        req.io.emit('sos:update_status', {
          id: Number(alert.id),
          sos_id: Number(alert.id),
          resident_id: alert.resident_id ? Number(alert.resident_id) : null,
          status: alert.status || 'ACKNOWLEDGED',
          handled_by: alert.handled_by || null,
          responder_name: alert.responder_name,
          handler_name: alert.handler_name || alert.responder_name,
          rescuer_photo: rPhoto,
          handler_photo: rPhoto,
          rescuer_lat: alert.rescuer_lat || 13.51037,
          rescuer_lng: alert.rescuer_lng || 123.34810,
          auto_assigned: true,
          auto_assigned_type: alert.auto_assigned_type || 'NEAREST_RESCUER',
          alert
        });
        req.io.emit('rescuer:location_update', {
          sos_id: Number(alert.id),
          rescuer_user_id: alert.handled_by || null,
          rescuer_name: alert.responder_name,
          rescuer_role: 'Emergency Rescuer',
          rescuer_photo: rPhoto,
          latitude: alert.rescuer_lat || 13.51037,
          longitude: alert.rescuer_lng || 123.34810,
          lat: alert.rescuer_lat || 13.51037,
          lng: alert.rescuer_lng || 123.34810,
          status: alert.status || 'ACKNOWLEDGED',
          resident_id: alert.resident_id ? Number(alert.resident_id) : null,
          resident_lat: Number(alert.latitude) || null,
          resident_lng: Number(alert.longitude) || null,
          updated_at: new Date().toISOString()
        });
      }
    }

    res.json({ success: true, alert });
  } catch (error) {
    console.error('Error creating SOS alert via REST endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sos/status - Admin or staff or rescuer updates SOS status (ACKNOWLEDGED, RESPONDING, RESCUED, RESOLVED)
router.post('/status', requireAuth, requireRole(['staff', 'barangay_council', 'admin', 'rescuer']), staffController.updateSosStatus);

// POST /api/sos/resolve - Admin, staff, or assigned rescuer resolves an active SOS alert (strictly enforced RBAC)
router.post('/resolve', requireAuth, requireRole(['staff', 'admin', 'rescuer']), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: 'SOS alert ID required', message: 'SOS alert ID required' });
    }
    const userId = req.session ? req.session.userId : null;
    const userRole = req.session ? req.session.role : null;

    const result = await SosModel.updateStatus(id, 'RESOLVED', userId, null, userRole);
    if (result && result.error === 'ALREADY_ASSIGNED') {
      return res.status(409).json({ success: false, message: result.message, alert: result.alert });
    }
    if (!result || result.error) {
      return res.status(400).json({ success: false, error: result ? result.message : 'Error resolving SOS alert', message: result ? result.message : 'Error resolving SOS alert' });
    }

    const updated = result;
    rescuerTracker.clearRescuerLocation(id);
    try { loraRoutes.queueOutboundSosAck(updated, 'RESOLVED', (updated && updated.handler_name) || 'Rescue Team'); } catch (_e) {}

    // Broadcast via socket if req.io is present
    if (req.io) {
      req.io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(id) });
      req.io.emit('sos:resolve', { id: Number(id), status: 'RESOLVED' });
    }
    
    res.json({ success: true, alert: updated });
  } catch (error) {
    console.error('Error resolving SOS alert:', error);
    res.status(500).json({ success: false, error: error.message, message: error.message });
  }
});

// POST /api/sos/cancel - Resident cancels their active SOS alert (or staff/admin cancels)
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { id, resident_id } = req.body;
    const userId = req.session ? req.session.userId : null;
    const userRole = req.session ? req.session.role : null;
    const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff' || userRole === 'barangay_council';

    // Residents can only cancel their own alerts
    const targetResidentId = (isStaffOrAdmin && resident_id) ? resident_id : userId;

    const cancelledAlerts = await SosModel.cancelAlert(id, targetResidentId);
    NotificationModel.invalidateCache();

    if (req.io) {
      if (cancelledAlerts && cancelledAlerts.length > 0) {
        cancelledAlerts.forEach(alert => {
          rescuerTracker.clearRescuerLocation(alert.id);
          req.io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(alert.id) });
          req.io.emit('sos:cancel', { id: Number(alert.id), sos_id: Number(alert.id), resident_id: alert.resident_id ? Number(alert.resident_id) : null, status: 'CANCELLED' });
          req.io.emit('sos:update_status', { id: Number(alert.id), sos_id: Number(alert.id), resident_id: alert.resident_id ? Number(alert.resident_id) : null, status: 'CANCELLED' });
        });
      } else {
        const alertId = id ? Number(id) : null;
        const resId = targetResidentId ? Number(targetResidentId) : null;
        if (alertId) {
          rescuerTracker.clearRescuerLocation(alertId);
          req.io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: alertId });
        }
        req.io.emit('sos:cancel', { id: alertId, sos_id: alertId, resident_id: resId, status: 'CANCELLED' });
        if (alertId) {
          req.io.emit('sos:update_status', { id: alertId, sos_id: alertId, resident_id: resId, status: 'CANCELLED' });
        }
      }
    }

    res.json({ success: true, message: 'SOS alert cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling SOS alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
