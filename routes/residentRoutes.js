const express = require('express');
const router = express.Router();
const residentController = require('../controllers/residentController');

const upload = require('../utils/upload');

// Resilient upload handler for member profile photos so multipart text fields are always preserved
const handleMemberPhotoUpload = (req, res, next) => {
  upload.single('profile_photo')(req, res, (err) => {
    if (err) {
      console.warn('Multer photo upload notice for household member:', err.message);
    }
    next();
  });
};

router.get("/", residentController.getDashboard);
router.get("/dashboard", residentController.getDashboard);
router.get("/qr", residentController.getQr);
router.post("/qr/members", handleMemberPhotoUpload, residentController.addMember);
router.post("/qr/members/edit/:id", handleMemberPhotoUpload, residentController.editMember);
router.post("/qr/members/:id/edit", handleMemberPhotoUpload, residentController.editMember);
router.post("/qr/members/delete/:id", residentController.deleteMember);
router.get("/evacuation", residentController.getEvacuation);
router.post("/evacuation/checkin", residentController.manualCheckin);
router.get("/typhoon", residentController.getTyphoon);
router.get("/chat", residentController.getChat);
router.get("/sos", residentController.getSos);
router.get("/profile", residentController.getSettings);
router.post("/profile", upload.single('profile_photo'), residentController.updateSettings);
router.get("/settings", residentController.getSettings);
router.post("/settings", upload.single('profile_photo'), residentController.updateSettings);
router.get("/personal-info", (_req, res) => res.redirect("/resident/profile?openModal=personalInfo"));
router.get("/demographic", (_req, res) => res.redirect("/resident/profile?openModal=personalInfo"));
router.get("/details", (_req, res) => res.redirect("/resident/profile?openModal=personalInfo"));
router.get("/details/:id", (_req, res) => res.redirect("/resident/profile?openModal=personalInfo"));

module.exports = router;
