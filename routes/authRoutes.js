const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { redirectIfAuth } = require('../middleware/authMiddleware');
const upload = require('../utils/upload');
const db = require('../config/db');
const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

router.get("/login", redirectIfAuth, authController.getLogin);
router.post("/login", authController.postLogin);
router.all("/login", (req, res) => {
  res.setHeader("Allow", "GET, POST");
  res.status(405).send("Method Not Allowed");
});

router.get(["/logout", "/logout/index.html", "/logout/"], authController.logout);
router.post(["/logout", "/logout/index.html", "/logout/"], authController.logout);
router.all(["/logout", "/logout/index.html", "/logout/"], (req, res) => {
  res.setHeader("Allow", "GET, POST");
  res.status(405).send("Method Not Allowed");
});

router.get("/register", redirectIfAuth, authController.getRegister);
router.post("/register", upload.fields([
  { name: 'valid_id', maxCount: 1 },
  { name: 'barangay_id_photo', maxCount: 1 },
  { name: 'id_photo', maxCount: 1 }
]), authController.postRegister);
router.all("/register", (req, res) => {
  res.setHeader("Allow", "GET, POST");
  res.status(405).send("Method Not Allowed");
});

// Lightweight session validation endpoint for BFCache and history navigation
router.get("/auth/check", (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  if (req.session && req.session.userId) {
    return res.json({ authenticated: true, role: req.session.role });
  }
  return res.json({ authenticated: false });
});

// =========================================================================
// POST /api/mobile/login (CAPACITOR NATIVE RESIDENT AUTHENTICATION)
// Authenticates credentials against Barangay Hall MySQL database and returns
// offline-cacheable verification salt & hash for offline fallback.
// Supports all 82 resident accounts from MySQL.
// =========================================================================
router.post('/api/mobile/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both email/username and password.' });
    }

    const trimmed = String(email).trim().toLowerCase();
    const user = await User.findByEmailOrContact(trimmed);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
    }

    const isMatch = await bcrypt.compare(String(password), user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
    }

    // Generate secure offline verification salt & hash (SHA-256 with 16-byte random salt)
    const salt = crypto.randomBytes(16).toString('hex');
    const offlineHash = crypto.createHash('sha256').update(String(password) + ':' + salt).digest('hex');

    // 1. Check if user is Staff or Rescuer (role === 'staff' or linked staff row)
    const [staffRows] = await db.query('SELECT * FROM staff WHERE user_id = ? LIMIT 1', [user.id]);
    const staffRecord = staffRows && staffRows[0] ? staffRows[0] : null;

    if (user.role === 'staff' || staffRecord) {
      const isRescuer = (staffRecord && staffRecord.staff_type === 'RESCUER') || user.staff_type === 'RESCUER';
      const staffType = isRescuer ? 'RESCUER' : 'EVACUATION';
      const appRole = isRescuer ? 'rescuer' : 'staff';
      const redirectUrl = isRescuer ? '/rescuer/dashboard/index.html' : '/staff/dashboard/index.html';

      const sFullName = staffRecord
        ? `${staffRecord.first_name || ''} ${staffRecord.last_name || ''}`.trim()
        : (user.name || 'Staff Member');

      const sPhoto = staffRecord && staffRecord.profile_photo
        ? (staffRecord.profile_photo.startsWith('http') || staffRecord.profile_photo.startsWith('/')
          ? staffRecord.profile_photo
          : `/uploads/profiles/${staffRecord.profile_photo}`)
        : null;

      const staffContext = {
        id: staffRecord ? staffRecord.id : user.id,
        userId: user.id,
        user_id: user.id,
        name: sFullName,
        full_name: sFullName,
        first_name: staffRecord ? (staffRecord.first_name || 'Staff') : 'Staff',
        middle_name: staffRecord ? (staffRecord.middle_name || '') : '',
        last_name: staffRecord ? (staffRecord.last_name || '') : '',
        email: user.email,
        role: 'staff',
        staff_type: staffType,
        assigned_center_id: staffRecord ? staffRecord.assigned_center_id : null,
        contact_number: staffRecord ? (staffRecord.contact_number || '') : '',
        occupation: staffRecord ? (staffRecord.occupation || '') : '',
        profile_photo: sPhoto
      };

      if (req.session) {
        req.session.userId = user.id;
        req.session.role = 'staff';
        req.session.staffId = staffContext.id;
        req.session.staffType = staffType;
        req.session.userName = sFullName;
      }

      return res.json({
        success: true,
        message: 'Staff authentication successful',
        role: appRole,
        redirectUrl: redirectUrl,
        user: {
          id: user.id,
          name: sFullName,
          email: user.email,
          role: 'staff',
          staff_type: staffType
        },
        staff: staffContext,
        offlineAuth: {
          salt: salt,
          hash: offlineHash
        }
      });
    }

    // 2. Otherwise verify Resident record
    const [residentRows] = await db.query('SELECT * FROM residents WHERE user_id = ? LIMIT 1', [user.id]);
    const resident = residentRows && residentRows[0] ? residentRows[0] : null;

    if (!resident && user.role !== 'resident') {
      return res.status(403).json({ success: false, message: 'Invalid role for mobile app. Registered residents, staff, and rescuers only.' });
    }

    const approvalStatus = resident ? (resident.approval_status || 'APPROVED') : (user.approval_status || (user.is_verified ? 'APPROVED' : 'PENDING'));
    if (approvalStatus === 'REJECTED') {
      return res.status(403).json({ success: false, message: 'Your resident registration was rejected. Please contact Barangay San Rafael office.' });
    }

    const [members] = resident ? await db.query('SELECT * FROM household_members WHERE resident_id = ?', [resident.id]) : [[]];

    const fullName = resident
      ? `${resident.first_name || ''} ${resident.last_name || ''}`.trim()
      : (user.name || user.email.split('@')[0]);

    const resolvedPhoto = resident && resident.profile_photo
      ? (resident.profile_photo.startsWith('http') || resident.profile_photo.startsWith('/')
        ? resident.profile_photo
        : `/uploads/profiles/${resident.profile_photo}`)
      : null;

    const userContext = {
      id: resident ? (resident.user_id || user.id) : user.id,
      resident_id: resident ? resident.id : 0,
      name: fullName,
      full_name: fullName,
      first_name: resident ? (resident.first_name || 'Resident') : (user.first_name || 'Resident'),
      middle_name: resident ? (resident.middle_name || '') : '',
      last_name: resident ? (resident.last_name || '') : '',
      email: user.email,
      role: 'resident',
      contact_number: resident ? (resident.contact_number || '') : (user.contact_number || ''),
      barangay: resident ? (resident.barangay || 'San Rafael') : 'San Rafael',
      home_address: resident ? (resident.home_address || '') : '',
      sex: resident ? (resident.sex || 'Male') : 'Male',
      birthdate: resident ? resident.birthdate : null,
      age: resident ? (resident.age || 0) : 0,
      family_size: resident ? (resident.family_size || 1) : 1,
      vulnerability: resident ? (resident.vulnerability || 'NONE') : 'NONE',
      has_special_needs: resident ? Boolean(resident.has_special_needs) : false,
      is_4ps: resident ? Boolean(resident.is_4ps) : false,
      is_pregnant: resident ? Boolean(resident.is_pregnant) : false,
      is_lactating: resident ? Boolean(resident.is_lactating) : false,
      is_pwd: resident ? Boolean(resident.is_pwd) : false,
      is_single_head: resident ? Boolean(resident.is_single_head) : false,
      has_serious_illness: resident ? Boolean(resident.has_serious_illness) : false,
      serious_illness_details: resident ? (resident.serious_illness_details || '') : '',
      emergency_contact_name: resident ? (resident.emergency_contact_name || '') : '',
      emergency_contact_phone: resident ? (resident.emergency_contact_phone || '') : '',
      profile_photo: resolvedPhoto,
      qr_code_uuid: resident ? (resident.qr_code_uuid || `evw-resident-${resident.id}`) : `evw-user-${user.id}`,
      approval_status: 'APPROVED'
    };

    // Initialize express session so subsequent requests with credentials: 'include' work seamlessly
    if (req.session) {
      req.session.userId = user.id;
      req.session.role = 'resident';
      req.session.userName = fullName;
      if (resident) req.session.residentId = resident.id;
    }

    return res.json({
      success: true,
      message: 'Authentication successful',
      role: 'resident',
      redirectUrl: '/resident/dashboard/index.html',
      user: {
        id: user.id,
        email: user.email,
        role: 'resident'
      },
      resident: userContext,
      members: members || [],
      offlineAuth: {
        salt: salt,
        hash: offlineHash
      }
    });
  } catch (err) {
    console.error('Error in /api/mobile/login:', err);
    return res.status(500).json({ success: false, message: 'Server error during mobile authentication.' });
  }
});

// =========================================================================
// POST /api/mobile/profile/update
// Updates resident profile info in MySQL (personal info, contact, vulnerabilities)
// =========================================================================
router.post('/api/mobile/profile/update', upload.single('profile_photo'), async (req, res) => {
  try {
    const userId = req.body.user_id || req.body.userId || (req.session && req.session.userId);
    const residentId = req.body.resident_id || req.body.residentId || (req.session && req.session.residentId);

    if (!userId && !residentId) {
      return res.status(400).json({ success: false, message: 'Missing user_id or resident_id.' });
    }

    // Locate resident record
    let query = 'SELECT * FROM residents WHERE id = ? LIMIT 1';
    let param = residentId;
    if (!residentId) {
      query = 'SELECT * FROM residents WHERE user_id = ? LIMIT 1';
      param = userId;
    }
    const [rows] = await db.query(query, [param]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Resident record not found.' });
    }
    const current = rows[0];

    const firstName = req.body.first_name !== undefined ? String(req.body.first_name).trim() : current.first_name;
    const middleName = req.body.middle_name !== undefined ? String(req.body.middle_name).trim() : current.middle_name;
    const lastName = req.body.last_name !== undefined ? String(req.body.last_name).trim() : current.last_name;
    const contact = req.body.contact_number !== undefined ? String(req.body.contact_number).trim() : current.contact_number;
    const address = req.body.home_address !== undefined ? String(req.body.home_address).trim() : current.home_address;
    const barangay = req.body.barangay !== undefined ? String(req.body.barangay).trim() : (current.barangay || 'San Rafael');
    const sex = req.body.sex !== undefined ? req.body.sex : current.sex;
    const birthdate = req.body.birthdate !== undefined ? req.body.birthdate : current.birthdate;
    const age = req.body.age !== undefined ? (parseInt(req.body.age, 10) || current.age) : current.age;
    const familySize = req.body.family_size !== undefined ? (parseInt(req.body.family_size, 10) || current.family_size) : current.family_size;
    const vulnerability = req.body.vulnerability !== undefined ? String(req.body.vulnerability).trim() : current.vulnerability;

    const is4ps = req.body.is_4ps !== undefined ? (req.body.is_4ps === '1' || req.body.is_4ps === true || req.body.is_4ps === 'true' ? 1 : 0) : current.is_4ps;
    const isPregnant = req.body.is_pregnant !== undefined ? (req.body.is_pregnant === '1' || req.body.is_pregnant === true || req.body.is_pregnant === 'true' ? 1 : 0) : current.is_pregnant;
    const isLactating = req.body.is_lactating !== undefined ? (req.body.is_lactating === '1' || req.body.is_lactating === true || req.body.is_lactating === 'true' ? 1 : 0) : current.is_lactating;
    const isPwd = req.body.is_pwd !== undefined ? (req.body.is_pwd === '1' || req.body.is_pwd === true || req.body.is_pwd === 'true' ? 1 : 0) : current.is_pwd;
    const isSingleHead = req.body.is_single_head !== undefined ? (req.body.is_single_head === '1' || req.body.is_single_head === true || req.body.is_single_head === 'true' ? 1 : 0) : current.is_single_head;
    const hasSeriousIllness = req.body.has_serious_illness !== undefined ? (req.body.has_serious_illness === '1' || req.body.has_serious_illness === true || req.body.has_serious_illness === 'true' ? 1 : 0) : current.has_serious_illness;
    const seriousIllnessDetails = req.body.serious_illness_details !== undefined ? String(req.body.serious_illness_details).trim() : current.serious_illness_details;
    const emergName = req.body.emergency_contact_name !== undefined ? String(req.body.emergency_contact_name).trim() : current.emergency_contact_name;
    const emergPhone = req.body.emergency_contact_phone !== undefined ? String(req.body.emergency_contact_phone).trim() : current.emergency_contact_phone;

    let profilePhoto = current.profile_photo;
    if (req.file) {
      profilePhoto = req.file.filename;
    }

    await db.query(`
      UPDATE residents SET
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        contact_number = ?,
        home_address = ?,
        barangay = ?,
        sex = ?,
        birthdate = ?,
        age = ?,
        family_size = ?,
        vulnerability = ?,
        is_4ps = ?,
        is_pregnant = ?,
        is_lactating = ?,
        is_pwd = ?,
        is_single_head = ?,
        has_serious_illness = ?,
        serious_illness_details = ?,
        emergency_contact_name = ?,
        emergency_contact_phone = ?,
        profile_photo = ?
      WHERE id = ?
    `, [
      firstName, middleName, lastName, contact, address, barangay, sex, birthdate || null,
      age || null, familySize || 1, vulnerability || 'NONE', is4ps, isPregnant, isLactating,
      isPwd, isSingleHead, hasSeriousIllness, seriousIllnessDetails || null, emergName || null,
      emergPhone || null, profilePhoto, current.id
    ]);

    // If email is provided and changed, update users table
    if (req.body.email && current.user_id) {
      const cleanEmail = String(req.body.email).trim().toLowerCase();
      await db.query('UPDATE users SET email = ? WHERE id = ?', [cleanEmail, current.user_id]).catch(() => {});
    }

    // Return updated resident profile
    const [updatedRows] = await db.query('SELECT * FROM residents WHERE id = ?', [current.id]);
    const updated = updatedRows[0];
    const fullName = `${updated.first_name || ''} ${updated.last_name || ''}`.trim();

    return res.json({
      success: true,
      message: 'Profile updated successfully!',
      resident: {
        ...updated,
        name: fullName,
        full_name: fullName
      }
    });
  } catch (err) {
    console.error('Error in /api/mobile/profile/update:', err);
    return res.status(500).json({ success: false, message: 'Server error updating profile: ' + err.message });
  }
});

// =========================================================================
// POST /api/mobile/members/save
// Adds or edits a household member in MySQL
// =========================================================================
router.post('/api/mobile/members/save', upload.single('profile_photo'), async (req, res) => {
  try {
    const residentId = req.body.resident_id || req.body.residentId || (req.session && req.session.residentId);
    if (!residentId) {
      return res.status(400).json({ success: false, message: 'Missing resident_id.' });
    }

    const memberId = req.body.id ? parseInt(req.body.id, 10) : null;
    const firstName = String(req.body.first_name || '').trim();
    const middleName = String(req.body.middle_name || '').trim();
    const lastName = String(req.body.last_name || '').trim();
    const relation = String(req.body.relation || 'Dependent').trim();
    const sex = req.body.sex || 'Male';
    const birthdate = req.body.birthdate || null;
    const age = req.body.age ? parseInt(req.body.age, 10) : null;
    const isPregnant = (req.body.is_pregnant === '1' || req.body.is_pregnant === true || req.body.is_pregnant === 'true') ? 1 : 0;
    const isLactating = (req.body.is_lactating === '1' || req.body.is_lactating === true || req.body.is_lactating === 'true') ? 1 : 0;
    const isPwd = (req.body.is_pwd === '1' || req.body.is_pwd === true || req.body.is_pwd === 'true') ? 1 : 0;
    const hasSeriousIllness = (req.body.has_serious_illness === '1' || req.body.has_serious_illness === true || req.body.has_serious_illness === 'true') ? 1 : 0;
    const seriousIllnessDetails = String(req.body.serious_illness_details || '').trim();
    const profilePhoto = req.file ? req.file.filename : (req.body.profile_photo || null);

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'First name and last name are required.' });
    }

    if (memberId) {
      await db.query(`
        UPDATE household_members SET
          first_name = ?, middle_name = ?, last_name = ?, relation = ?,
          sex = ?, birthdate = ?, age = ?, is_pregnant = ?, is_lactating = ?,
          is_pwd = ?, has_serious_illness = ?, serious_illness_details = ?, profile_photo = COALESCE(?, profile_photo)
        WHERE id = ? AND resident_id = ?
      `, [
        firstName, middleName, lastName, relation, sex, birthdate, age,
        isPregnant, isLactating, isPwd, hasSeriousIllness, seriousIllnessDetails || null,
        profilePhoto, memberId, residentId
      ]);
    } else {
      await db.query(`
        INSERT INTO household_members
        (resident_id, first_name, middle_name, last_name, relation, sex, birthdate, age, status, is_pregnant, is_lactating, is_pwd, has_serious_illness, serious_illness_details, profile_photo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', ?, ?, ?, ?, ?, ?)
      `, [
        residentId, firstName, middleName, lastName, relation, sex, birthdate,
        age, isPregnant, isLactating, isPwd, hasSeriousIllness, seriousIllnessDetails || null,
        profilePhoto
      ]);
    }

    // Refresh member list
    const [members] = await db.query('SELECT * FROM household_members WHERE resident_id = ? ORDER BY id ASC', [residentId]);
    return res.json({ success: true, message: 'Household member saved successfully!', members: members || [] });
  } catch (err) {
    console.error('Error in /api/mobile/members/save:', err);
    return res.status(500).json({ success: false, message: 'Server error saving household member: ' + err.message });
  }
});

// =========================================================================
// POST /api/mobile/members/delete
// Deletes a household member from MySQL
// =========================================================================
router.post('/api/mobile/members/delete', async (req, res) => {
  try {
    const memberId = req.body.id || req.body.memberId;
    const residentId = req.body.resident_id || req.body.residentId || (req.session && req.session.residentId);

    if (!memberId) {
      return res.status(400).json({ success: false, message: 'Missing member id.' });
    }

    if (residentId) {
      await db.query('DELETE FROM household_members WHERE id = ? AND resident_id = ?', [memberId, residentId]);
    } else {
      await db.query('DELETE FROM household_members WHERE id = ?', [memberId]);
    }

    const [members] = residentId ? await db.query('SELECT * FROM household_members WHERE resident_id = ? ORDER BY id ASC', [residentId]) : [[]];
    return res.json({ success: true, message: 'Member deleted successfully.', members: members || [] });
  } catch (err) {
    console.error('Error in /api/mobile/members/delete:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting member: ' + err.message });
  }
});

// =========================================================================
// GET /api/mobile/resident/:id
// Fetches fresh resident record + household members for sync
// =========================================================================
router.get('/api/mobile/resident/:id', async (req, res) => {
  try {
    const resId = req.params.id;
    const [rows] = await db.query('SELECT * FROM residents WHERE id = ? OR user_id = ? LIMIT 1', [resId, resId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Resident not found.' });
    }
    const resident = rows[0];
    const [members] = await db.query('SELECT * FROM household_members WHERE resident_id = ? ORDER BY id ASC', [resident.id]);
    return res.json({ success: true, resident, members: members || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
