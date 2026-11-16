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

// GET /api/sos/rescuers/active - Retrieve all active rescuer locations (strictly authorized staff/admin only)
router.get('/rescuers/active', requireAuth, requireRole(['staff', 'admin']), (req, res) => {
  try {
    const rescuers = rescuerTracker.getActiveRescuers();
    res.json({ success: true, rescuers });
  } catch (error) {
    console.error('Error fetching active rescuer locations:', error);
    res.status(500).json({ success: false, error: error.message });
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

    if (req.io) {
      req.io.emit('sos:new', alert);
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
