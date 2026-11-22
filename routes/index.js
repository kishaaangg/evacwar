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

  // When opened via HTTPS link (unless ?web=1), show the clean "Open EvakWar App" launcher screen
  // and immediately trigger the Android native App Intent (ph.gov.baao.evakwar.resident) on Android phones
  if (!isAlreadyWebFallback) {
    const proto = (req.secure || req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
    const host = req.headers.host || 'evacwar.onrender.com';
    const fallbackWebUrl = `${proto}://${host}/evacuate?web=1&auto_route=nearest`;
    const androidIntentUri = `intent://evacuate?auto_route=nearest#Intent;scheme=evakwar;package=ph.gov.baao.evakwar.resident;S.navigate_to=%2Fresident%2Fevacuation%3Fauto_route%3Dnearest;S.browser_fallback_url=${encodeURIComponent(fallbackWebUrl)};end`;
    const appLaunchHref = isAndroidDevice ? androidIntentUri : 'evakwar://evacuate?auto_route=nearest';

    return res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open EvakWar App — Nearest Evacuation Route</title>
  <style>
    body { margin: 0; min-height: 100vh; background: linear-gradient(160deg, #0b132b 0%, #0f172a 60%, #172554 100%); color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; text-align: center; }
    .box { max-width: 390px; width: 100%; background: rgba(30, 41, 59, 0.95); border: 1.5px solid rgba(16, 185, 129, 0.55); border-radius: 24px; padding: 28px 22px; box-shadow: 0 20px 45px rgba(0,0,0,0.5); }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(248, 113, 113, 0.4); color: #fca5a5; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }
    .logo { width: 64px; height: 64px; border-radius: 18px; background: #ffffff; margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 8px 20px rgba(0,0,0,0.3); }
    .logo img { width: 54px; height: 54px; object-fit: contain; }
    h2 { font-size: 20px; font-weight: 900; margin: 0 0 8px; color: #ffffff; letter-spacing: -0.01em; }
    p { font-size: 13px; color: #cbd5e1; margin: 0 0 20px; line-height: 1.55; }
    .btn-primary { display: block; width: 100%; padding: 14px 18px; border-radius: 14px; background: #10b981; color: #022c22; font-weight: 900; font-size: 14px; text-decoration: none; box-sizing: border-box; box-shadow: 0 8px 20px rgba(16, 185, 129, 0.35); transition: transform 0.12s ease; }
    .btn-primary:active { transform: scale(0.98); }
    .btn-secondary { display: block; width: 100%; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: #e2e8f0; font-weight: 700; font-size: 13px; text-decoration: none; box-sizing: border-box; margin-top: 10px; }
    .hint { font-size: 11px; color: #94a3b8; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="badge">Emergency Evacuation Route</div>
    <div class="logo">
      <img src="/images/evacwar-logo.png" alt="EvakWar" onerror="this.style.display='none'" />
    </div>
    <h2>Open the EvakWar App</h2>
    <p>Launch EvakWar to get your live GPS location and automatic route to the nearest safe evacuation center in Barangay San Rafael.</p>
    <a id="openAppBtn" href="${appLaunchHref}" class="btn-primary">Open EvakWar App</a>
    <a id="webFallbackBtn" href="${fallbackWebUrl}" class="btn-secondary">Continue in Browser Map</a>
    <div class="hint">Barangay San Rafael, Baao &bull; MDRRMO Command Center</div>
  </div>
  <script>
    (function () {
      var isAndroid = ${JSON.stringify(isAndroidDevice)};
      var intentUrl = ${JSON.stringify(androidIntentUri)};
      if (isAndroid) {
        setTimeout(function () {
          try {
            window.location.href = intentUrl;
          } catch (e) {}
        }, 350);
      }
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
