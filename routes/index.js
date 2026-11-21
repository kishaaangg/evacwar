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

const authController = require("../controllers/authController");
const residentController = require("../controllers/residentController");

router.get("/", redirectIfAuth, authController.getWelcome);

// SMS RED & ORANGE Alert Native App Deep-Link Launcher (/evacuate -> Opens EvakWar App & Routes to Nearest Evacuation Center)
router.get(["/evacuate", "/nearest-evac"], (req, res, next) => {
  const ua = String((req.headers && req.headers['user-agent']) || '').toLowerCase();
  const isAndroidDevice = ua.includes('android');
  const isAlreadyWebFallback = req.query && req.query.web === '1';

  // On Android phones, immediately launch the installed EvakWar Native App (ph.gov.baao.evakwar.resident)
  // straight to the Evacuation Map with automatic Nearest Evacuation Center routing
  if (isAndroidDevice && !isAlreadyWebFallback) {
    const proto = (req.secure || req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
    const host = req.headers.host || 'evacwar.onrender.com';
    const fallbackWebUrl = `${proto}://${host}/evacuate?web=1&auto_route=nearest`;
    const androidIntentUri = `intent://evacuate?auto_route=nearest#Intent;scheme=evakwar;package=ph.gov.baao.evakwar.resident;S.navigate_to=%2Fresident%2Fevacuation%3Fauto_route%3Dnearest;S.browser_fallback_url=${encodeURIComponent(fallbackWebUrl)};end`;

    return res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Opening EvakWar Evacuation Route...</title>
  <style>
    body { margin: 0; min-height: 100vh; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; text-align: center; }
    .box { max-width: 360px; width: 100%; background: #1e293b; border: 2px solid #10b981; border-radius: 18px; padding: 24px 18px; box-shadow: 0 15px 35px rgba(0,0,0,0.45); }
    .btn { display: block; width: 100%; padding: 13px 16px; border-radius: 12px; background: #10b981; color: #022c22; font-weight: 900; font-size: 13px; text-transform: uppercase; text-decoration: none; box-sizing: border-box; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size: 11px; font-weight: 900; color: #34d399; text-transform: uppercase; letter-spacing: 0.06em;">EvakWar Emergency Navigation</div>
    <h2 style="font-size: 17px; font-weight: 900; margin: 6px 0 8px;">Opening EvakWar App...</h2>
    <p style="font-size: 12px; color: #cbd5e1; margin: 0; line-height: 1.5;">Calculating your GPS location and routing to the nearest available evacuation center.</p>
    <a id="openAppBtn" href="${androidIntentUri}" class="btn">Open EvakWar App (Nearest Evacuation)</a>
  </div>
  <script>
    (function () {
      var intentUrl = ${JSON.stringify(androidIntentUri)};
      var fallbackUrl = ${JSON.stringify(fallbackWebUrl)};
      try {
        window.location.replace(intentUrl);
      } catch (e) {
        window.location.href = 'evakwar://evacuate?auto_route=nearest';
      }
      setTimeout(function () {
        if (!document.hidden) {
          window.location.replace(fallbackUrl);
        }
      }, 2200);
    })();
  </script>
</body>
</html>`);
  }

  if (req.session && req.session.userId && req.session.role) {
    const role = String(req.session.role).toLowerCase();
    if (role === 'admin') return res.redirect('/admin/evacuation?auto_route=nearest');
    if (role === 'rescuer' || req.session.staffType === 'RESCUER') return res.redirect('/rescuer/map?auto_route=nearest');
    if (role === 'staff' || role === 'barangay_council') return res.redirect('/staff/map?auto_route=nearest');
    return res.redirect('/resident/evacuation?auto_route=nearest');
  }
  req.query = req.query || {};
  req.query.auto_route = 'nearest';
  req.query.from_sms = '1';
  return residentController.getEvacuation(req, res, next);
});

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
