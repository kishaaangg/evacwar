const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const upload = require('../utils/upload');

// Redirect RESCUER staff to dedicated /rescuer portal
router.use((req, res, next) => {
  if (req.session && req.session.staffType === 'RESCUER') {
    const subPath = req.path === '/' ? '' : req.path;
    if (subPath === '/qr' || subPath === '/scan') {
      return res.redirect('/rescuer');
    }
    return res.redirect('/rescuer' + subPath);
  }
  next();
});

// 1. Dashboard & Active Site Selection
router.get("/", staffController.getDashboard);
router.get("/dashboard", staffController.getDashboard);
router.get("/site/:centerId", staffController.getDashboard);
router.get("/evacuation-center/:centerId", staffController.getDashboard);

// 2. QR Scanner Intake & Lookup
router.get("/qr", staffController.getQr);
router.get("/scan", staffController.getQr);
router.post("/qr/scan", staffController.lookupQr);
router.post("/qr/lookup", staffController.lookupQr);
router.post("/qr/checkin", staffController.confirmCheckIn);
router.post("/walkin/checkin", staffController.walkinCheckIn);
router.get("/qr/feed", staffController.getRecentIntakeFeed);
router.post("/offline/sync", staffController.syncOfflineOperations);
router.get("/offline/roster", staffController.getOfflineRosterData);

// 3. Unified Evacwar Map (Includes SOS Monitoring & Dispatch)
router.get("/map", staffController.getStaffMap);
router.get("/evacuation", staffController.getStaffMap);
router.get("/rescue", (req, res) => res.redirect("/staff/map"));
router.get("/sos", (req, res) => res.redirect("/staff/map"));
router.post("/sos/status", staffController.updateSosStatus);
router.get("/typhoon", staffController.getTyphoon);
router.get("/chat", staffController.getChat);

// 4. Reports (Includes Embedded EC Information Board + Evacuee Masterlist)
router.get("/reports", staffController.getReports);
router.get("/evacuees", staffController.getReports);
router.get("/masterlist", staffController.getReports);
router.get("/ec-board", (req, res) => res.redirect("/staff/reports"));
router.get("/ecboard", (req, res) => res.redirect("/staff/reports"));
router.get("/board", (req, res) => res.redirect("/staff/reports"));
router.get("/ec", (req, res) => res.redirect("/staff/reports"));
router.get("/ec-board/data", staffController.getEcBoardData);
router.post("/checkout", staffController.checkOut);

// 5. Staff Profile & Settings
router.get("/profile", staffController.getSettings);
router.post("/profile", upload.single('profile_photo'), staffController.updateSettings);
router.get("/settings", staffController.getSettings);
router.post("/settings", upload.single('profile_photo'), staffController.updateSettings);

// Legacy Broadcast Redirect
router.get("/broadcast", (req, res) => res.redirect("/staff"));

module.exports = router;

