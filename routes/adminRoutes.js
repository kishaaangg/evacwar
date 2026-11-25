const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const upload = require('../utils/upload');

router.get("/", adminController.getDashboard);
router.get("/residents", adminController.getResidents);
router.get("/residents/details/:id", adminController.getResidentDetails);
router.post("/residents/approve/:id", adminController.approveResident);
router.post("/residents/reject/:id", adminController.rejectResident);
router.post("/residents/create", upload.fields([
  { name: 'profile_photo', maxCount: 1 },
  { name: 'valid_id', maxCount: 1 }
]), adminController.createResident);
router.post("/residents/edit/:id", upload.fields([
  { name: 'profile_photo', maxCount: 1 },
  { name: 'valid_id', maxCount: 1 }
]), adminController.editResident);
router.post("/residents/upload-id/:id", upload.single('valid_id'), adminController.uploadResidentId);
router.post("/residents/delete/:id", adminController.deleteResident);

router.get("/staff", adminController.getStaff);
router.post("/staff/create", upload.single('profile_photo'), adminController.createStaff);
router.post("/staff/edit/:id", upload.single('profile_photo'), adminController.editStaff);
router.post("/staff/delete/:id", adminController.deleteStaff);
router.post("/admins/create", adminController.createAdmin);
router.post("/admins/delete/:id", adminController.deleteAdmin);

router.get("/typhoon", adminController.getTyphoon);
router.get("/evacuation", adminController.getEvacuation);
router.post("/evacuation/create", adminController.createCenter);
router.post("/evacuation/edit/:id", adminController.updateCenter);
router.post("/evacuation/delete/:id", adminController.deleteCenter);
router.post("/map-features", adminController.saveMapFeatures);
router.get("/broadcast", adminController.getBroadcast);
router.post("/broadcast", adminController.sendBroadcast);
router.post("/broadcast/calculate-recipients", adminController.calculateRecipients);
router.get("/chat", adminController.getChat);
router.get("/reports", adminController.getReports);
router.get("/reports/export-pdf", adminController.exportReportPDF);
router.get("/reports/print", adminController.printReport);
router.get("/settings", adminController.getSettings);
router.post("/settings", upload.single('profile_photo'), adminController.updateSettings);

module.exports = router;
