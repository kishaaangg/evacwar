const express = require("express");
const router = express.Router();
const { requireAuth, requireRole, redirectIfAuth } = require("../middleware/authMiddleware");

const authRoutes = require("./authRoutes");
const adminRoutes = require("./adminRoutes");
const residentRoutes = require("./residentRoutes");
const staffRoutes = require("./staffRoutes");
const rescuerRoutes = require("./rescuerRoutes");
const weatherRoutes = require("./weatherRoutes");
const sosRoutes = require("./sosRoutes");
const notificationRoutes = require("./notificationRoutes");
const pushRoutes = require("./pushRoutes");
const pagasaRoutes = require("./pagasaRoutes");
const loraRoutes = require("./loraRoutes");

router.get("/", redirectIfAuth, (_req, res) => res.redirect("/login"));

router.use("/", authRoutes);
router.use("/api/weather", weatherRoutes);
router.use("/api/pagasa", pagasaRoutes);
router.use("/api/sos", sosRoutes);
router.use("/api/lora", loraRoutes.router);
router.use("/api/notifications", notificationRoutes);
router.use("/api/push", pushRoutes);

// Real-time Active Evacuation Centers API (for live map markers, occupancy, and resident lists)
const Center = require("../models/centerModel");
const { noCache } = require("../middleware/authMiddleware");

router.get("/api/centers/active", noCache, async (_req, res) => {
  try {
    const centers = await Center.findAll();
    res.json({ success: true, centers });
  } catch (error) {
    console.error("Error fetching active centers for live map:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/api/centers", noCache, async (_req, res) => {
  try {
    const centers = await Center.findAll();
    res.json({ success: true, centers });
  } catch (error) {
    console.error("Error fetching centers for live map:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Protected routes
const staffController = require("../controllers/staffController");
router.post("/api/offline/sync", requireAuth, requireRole(['staff', 'barangay_council', 'admin']), staffController.syncOfflineOperations);
router.get("/api/offline/roster", requireAuth, requireRole(['staff', 'barangay_council', 'admin']), staffController.getOfflineRosterData);
router.get("/api/offline/data", requireAuth, requireRole(['staff', 'barangay_council', 'admin']), staffController.getOfflineRosterData);

router.use("/admin", requireAuth, requireRole(['admin']), adminRoutes);
router.use("/resident", requireAuth, requireRole(['resident']), residentRoutes);
router.get("/resident=id=:id", requireAuth, requireRole(['resident']), (_req, res) => res.redirect("/resident/profile"));
router.use("/staff", requireAuth, requireRole(['staff', 'barangay_council']), staffRoutes);
router.use("/rescuer", requireAuth, requireRole(['staff', 'barangay_council', 'rescuer']), rescuerRoutes);

// Role-aware shortcuts for /map, /reports, and /profile
router.get("/map", requireAuth, (req, res) => {
  if (req.session.role === 'resident') return res.redirect('/resident/evacuation');
  if (req.session.staffType === 'RESCUER') return res.redirect('/rescuer/map');
  return res.redirect('/staff/map');
});
router.get("/reports", requireAuth, (req, res) => {
  if (req.session.staffType === 'RESCUER') return res.redirect('/rescuer/reports');
  return res.redirect('/staff/reports');
});
router.get("/profile", requireAuth, (req, res) => {
  if (req.session.role === 'resident') return res.redirect('/resident/profile');
  if (req.session.role === 'admin') return res.redirect('/admin/settings');
  if (req.session.staffType === 'RESCUER') return res.redirect('/rescuer/profile');
  return res.redirect('/staff/profile');
});

module.exports = router;
