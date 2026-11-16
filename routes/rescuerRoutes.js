const express = require('express');
const router = express.Router();
const rescuerController = require('../controllers/rescuerController');
const upload = require('../utils/upload');

// Redirect EVACUATION site staff to dedicated /staff portal
router.use((req, res, next) => {
  if (req.session && req.session.staffType === 'EVACUATION') {
    const subPath = req.path === '/' ? '' : req.path;
    return res.redirect('/staff' + subPath);
  }
  next();
});

// 1. Rescuer Command Dashboard
router.get("/", rescuerController.getDashboard);
router.get("/dashboard", rescuerController.getDashboard);

// 2. Rescuer Tactical SOS Radar & Field Map
router.get("/map", rescuerController.getMap);
router.get("/radar", (req, res) => res.redirect("/rescuer/map"));
router.get("/rescue", (req, res) => res.redirect("/rescuer/map"));

// 3. Rescuer SOS Emergency Reports & Telemetry
router.get("/reports", rescuerController.getReports);
router.get("/sos", (req, res) => res.redirect("/rescuer/reports"));
router.post("/sos/status", rescuerController.updateSosStatus);

// 4. Typhoon & Severe Weather Tracking
router.get("/typhoon", rescuerController.getTyphoon);
router.get("/weather", (req, res) => res.redirect("/rescuer/typhoon"));
router.get("/chat", rescuerController.getChat);

// 5. Rescuer Profile & Settings
router.get("/profile", rescuerController.getSettings);
router.post("/profile", upload.single('profile_photo'), rescuerController.updateSettings);
router.get("/settings", rescuerController.getSettings);
router.post("/settings", upload.single('profile_photo'), rescuerController.updateSettings);

module.exports = router;
