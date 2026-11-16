const express = require('express');
const router = express.Router();
const NotificationModel = require('../models/notificationModel');
const { noCache } = require('../middleware/authMiddleware');

router.use(noCache);

// GET /api/notifications - Return real-time notifications for central header panel
router.get('/', async (req, res) => {
  try {
    const sessionRole = (req.session && (req.session.role || req.session.userRole)) || (res.locals.user && res.locals.user.role !== 'guest' ? res.locals.user.role : null);
    const userRole = req.query.role || sessionRole || 'resident';
    const userId = (req.session && req.session.userId) || (res.locals.user && res.locals.user.id);
    let barangay = req.query.barangay || (res.locals.user && res.locals.user.assigned_barangay);

    if (!barangay && userId) {
      const db = require('../config/db');
      const [resRows] = await db.query('SELECT barangay, home_address FROM residents WHERE user_id = ? LIMIT 1', [userId]).catch(() => [[]]);
      if (resRows && resRows[0]) {
        barangay = resRows[0].home_address || resRows[0].barangay || 'San Rafael';
      }
    }
    if (!barangay) barangay = 'San Rafael';

    let staffType = (req.session && req.session.staffType) || (res.locals.staff && res.locals.staff.staff_type) || (res.locals.user && res.locals.user.staff_type) || req.query.staff_type || null;
    if (!staffType && userRole === 'rescuer') staffType = 'RESCUER';

    const notifications = await NotificationModel.getAll(userRole, barangay, staffType);
    res.json({ success: true, notifications });
  } catch (error) {
    console.error("Error fetching notifications API:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
